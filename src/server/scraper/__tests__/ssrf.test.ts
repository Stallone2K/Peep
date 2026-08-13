import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Controllable DNS: tests register hostname → addresses here and the
// mocked node:dns/promises lookup serves them (throws ENOTFOUND for
// anything unregistered) — no network involved.
const dnsTable = new Map<string, Array<{ address: string; family: number }>>();

vi.mock("node:dns/promises", () => ({
  lookup: vi.fn(async (hostname: string) => {
    const hit = dnsTable.get(hostname);
    if (!hit) {
      const err = new Error(`getaddrinfo ENOTFOUND ${hostname}`);
      (err as NodeJS.ErrnoException).code = "ENOTFOUND";
      throw err;
    }
    return hit;
  }),
}));

import {
  assertSafeUrl,
  isPrivateAddress,
  isPrivateV4,
  isPrivateV6,
  isSafeUrl,
} from "@/server/scraper/ssrf";

beforeEach(() => {
  dnsTable.clear();
});

afterEach(() => {
  delete process.env.SSRF_ALLOWED_HOSTS;
});

describe("isPrivateV4", () => {
  it.each([
    "127.0.0.1",
    "127.255.255.254",
    "10.0.0.1",
    "10.255.255.255",
    "172.16.0.1",
    "172.31.255.255",
    "192.168.1.1",
    "169.254.169.254", // cloud metadata
    "100.64.0.1", // CGN
    "0.0.0.0",
    "192.0.2.1", // TEST-NET-1
    "198.18.0.1", // benchmarking
    "224.0.0.1", // multicast
    "240.0.0.1", // reserved
  ])("blocks %s", (ip) => {
    expect(isPrivateV4(ip)).toBe(true);
  });

  it.each([
    "8.8.8.8",
    "1.1.1.1",
    "93.184.216.34",
    "172.15.255.255", // just below RFC1918 172.16/12
    "172.32.0.1", // just above
    "100.63.255.255", // just below CGN
    "9.255.255.255", // just below 10/8
    "11.0.0.0", // just above 10/8
  ])("allows %s", (ip) => {
    expect(isPrivateV4(ip)).toBe(false);
  });

  it("fails closed on malformed input", () => {
    expect(isPrivateV4("not-an-ip")).toBe(true);
  });
});

describe("isPrivateV6", () => {
  it.each([
    "::1", // loopback
    "::", // unspecified
    "fe80::1", // link-local
    "fe80::1%eth0", // link-local with zone index
    "febf::1", // still within fe80::/10
    "fc00::1", // ULA
    "fd12:3456:789a::1", // ULA
    "ff02::1", // multicast
    "::ffff:127.0.0.1", // v4-mapped loopback
    "::ffff:10.0.0.1", // v4-mapped RFC1918
    "::ffff:169.254.169.254", // v4-mapped metadata
    "::ffff:7f00:1", // v4-mapped loopback, hex form
    "::a.b.c.d".replace("a.b.c.d", "10.0.0.1"), // v4-compatible
    "::0a00:1", // v4-compatible hex form (10.0.0.1)
    "64:ff9b::8.8.8.8", // NAT64 — blocked outright (translator escape)
    "64:ff9b::a00:1", // NAT64 embedding 10.0.0.1
    "64:ff9b:1::1", // NAT64 local-use
    "2002:7f00:0001::", // 6to4 embedding 127.0.0.1
    "2002:a00:1::", // 6to4 embedding 10.0.0.1
    "2001:0:53aa:64c:0:0:0:1", // Teredo — blocked outright
  ])("blocks %s", (ip) => {
    expect(isPrivateV6(ip)).toBe(true);
  });

  it.each([
    "2606:4700:4700::1111", // Cloudflare DNS
    "2620:fe::fe", // Quad9
    "::ffff:8.8.8.8", // v4-mapped public
    "2002:808:808::", // 6to4 embedding 8.8.8.8 (public)
    "2001:4860:4860::8888", // Google DNS (2001::/32 Teredo is only 2001:0::)
  ])("allows %s", (ip) => {
    expect(isPrivateV6(ip)).toBe(false);
  });

  it("fails closed on malformed input", () => {
    expect(isPrivateV6("::gggg")).toBe(true);
    expect(isPrivateV6("1:2:3")).toBe(true);
    expect(isPrivateV6("1::2::3")).toBe(true);
  });
});

describe("isPrivateAddress", () => {
  it("routes by family and fails closed on garbage", () => {
    expect(isPrivateAddress("127.0.0.1")).toBe(true);
    expect(isPrivateAddress("::1")).toBe(true);
    expect(isPrivateAddress("8.8.8.8")).toBe(false);
    expect(isPrivateAddress("banana")).toBe(true);
  });
});

describe("assertSafeUrl — schemes", () => {
  it.each([
    "file:///etc/passwd",
    "chrome://settings",
    "about:blank",
    "javascript:alert(1)",
    "data:text/html,<h1>hi</h1>",
    "ftp://example.com/",
    "gopher://example.com/",
  ])("rejects %s", async (url) => {
    await expect(assertSafeUrl(url)).rejects.toThrow();
  });

  it("rejects http when requireHttps is set", async () => {
    await expect(
      assertSafeUrl("http://example.com/", { requireHttps: true }),
    ).rejects.toThrow();
  });
});

describe("assertSafeUrl — literal hosts", () => {
  it.each([
    "http://127.0.0.1/",
    "http://127.0.0.1:6379/",
    "http://10.0.0.5/admin",
    "http://169.254.169.254/latest/meta-data/",
    "http://[::1]/",
    "http://[fe80::1]/",
    "http://[::ffff:10.0.0.1]/",
    "http://[64:ff9b::a00:1]/",
    "http://0.0.0.0/",
  ])("rejects %s", async (url) => {
    await expect(assertSafeUrl(url)).rejects.toThrow();
  });

  it("rejects obfuscated IPv4 literals (URL parser normalizes them)", async () => {
    // 0x7f000001 / 017700000001 / 2130706433 all normalize to 127.0.0.1
    await expect(assertSafeUrl("http://0x7f000001/")).rejects.toThrow();
    await expect(assertSafeUrl("http://2130706433/")).rejects.toThrow();
  });

  it.each([
    "http://localhost/",
    "http://localhost:3000/",
    "http://foo.localhost/",
    "http://printer.local/",
    "http://db.internal/",
  ])("rejects internal hostname %s", async (url) => {
    await expect(assertSafeUrl(url)).rejects.toThrow();
  });

  it("accepts a public literal IP and returns it for pinning", async () => {
    const safe = await assertSafeUrl("http://8.8.8.8/");
    expect(safe.address).toBe("8.8.8.8");
    expect(safe.family).toBe(4);
  });
});

describe("assertSafeUrl — DNS resolution (rebinding)", () => {
  it("rejects a public-looking hostname that resolves to a private IP", async () => {
    dnsTable.set("rebind.example", [
      { address: "169.254.169.254", family: 4 },
    ]);
    await expect(
      assertSafeUrl("https://rebind.example/"),
    ).rejects.toMatchObject({
      details: { reason: expect.stringMatching(/private IP/i) },
    });
  });

  it("rejects when ANY resolved address is private (dual answers)", async () => {
    dnsTable.set("mixed.example", [
      { address: "93.184.216.34", family: 4 },
      { address: "10.0.0.7", family: 4 },
    ]);
    await expect(assertSafeUrl("https://mixed.example/")).rejects.toThrow();
  });

  it("rejects a hostname resolving to a private IPv6", async () => {
    dnsTable.set("v6.example", [{ address: "fd00::1", family: 6 }]);
    await expect(assertSafeUrl("https://v6.example/")).rejects.toThrow();
  });

  it("rejects unresolvable hostnames", async () => {
    await expect(
      assertSafeUrl("https://nxdomain.example/"),
    ).rejects.toMatchObject({
      details: { reason: expect.stringMatching(/resolved/i) },
    });
  });

  it("returns the first resolved address for pinning on success", async () => {
    dnsTable.set("good.example", [
      { address: "93.184.216.34", family: 4 },
      { address: "2606:4700:4700::1111", family: 6 },
    ]);
    const safe = await assertSafeUrl("https://good.example/page?q=1");
    expect(safe.address).toBe("93.184.216.34");
    expect(safe.family).toBe(4);
    expect(safe.hostname).toBe("good.example");
  });
});

describe("assertSafeUrl — SSRF_ALLOWED_HOSTS escape hatch", () => {
  it("lets an allowlisted hostname through despite private resolution", async () => {
    process.env.SSRF_ALLOWED_HOSTS = "staging.corp, other.host";
    dnsTable.set("staging.corp", [{ address: "10.1.2.3", family: 4 }]);
    const safe = await assertSafeUrl("http://staging.corp/");
    expect(safe.address).toBe("10.1.2.3");
  });

  it("does not affect non-listed hosts", async () => {
    process.env.SSRF_ALLOWED_HOSTS = "staging.corp";
    dnsTable.set("evil.example", [{ address: "10.1.2.3", family: 4 }]);
    await expect(assertSafeUrl("http://evil.example/")).rejects.toThrow();
  });
});

describe("isSafeUrl", () => {
  it("wraps assertSafeUrl without throwing", async () => {
    expect(await isSafeUrl("http://127.0.0.1/")).toBe(false);
    expect(await isSafeUrl("file:///etc/passwd")).toBe(false);
    expect(await isSafeUrl("http://8.8.8.8/")).toBe(true);
  });
});
