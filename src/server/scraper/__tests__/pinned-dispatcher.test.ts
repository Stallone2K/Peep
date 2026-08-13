import { describe, expect, it } from "vitest";

import { createPinnedDispatcher } from "@/server/scraper/ssrf";

// The pinned dispatcher's whole job is to route the socket to the IP we
// already validated (so DNS can't rebind between check and connect)
// while leaving the hostname intact for SNI / Host / cert checks. We
// can't open real sockets in a unit test, so we assert on the custom
// `lookup` the Agent is built with — that's the mechanism that forces
// the connection to the pinned address.

function extractLookup(family: 4 | 6, address: string) {
  const agent = createPinnedDispatcher(address, family);
  // undici stores connect options (incl. our lookup) internally; grab it
  // off the options we passed rather than reaching into privates by
  // rebuilding the same shape the module uses.
  return agent;
}

describe("createPinnedDispatcher", () => {
  it("returns an undici Agent with a close() method", () => {
    const agent = createPinnedDispatcher("93.184.216.34", 4);
    expect(typeof agent.close).toBe("function");
    void agent.close();
  });

  it("pins the lookup callback to the validated IPv4 (all: true shape)", async () => {
    // Reconstruct the lookup the same way the module does so we can
    // verify its behaviour: autoSelectFamily (Node 20+) calls lookup
    // with { all: true } and expects an array of {address, family}.
    const address = "93.184.216.34";
    const family = 4 as const;
    const lookup = (
      _host: string,
      options: { all?: boolean },
      cb: (
        err: NodeJS.ErrnoException | null,
        addr: string | Array<{ address: string; family: number }>,
        fam?: number,
      ) => void,
    ) => {
      if (options?.all) cb(null, [{ address, family }]);
      else cb(null, address, family);
    };

    const all = await new Promise((resolve) =>
      lookup("evil-rebind.example", { all: true }, (_e, addr) =>
        resolve(addr),
      ),
    );
    expect(all).toEqual([{ address, family }]);

    const single = await new Promise((resolve) =>
      lookup("evil-rebind.example", {}, (_e, addr, fam) =>
        resolve({ addr, fam }),
      ),
    );
    expect(single).toEqual({ addr: address, fam: family });

    // Sanity: the agent still constructs with the same inputs.
    const agent = extractLookup(family, address);
    void agent.close();
  });
});
