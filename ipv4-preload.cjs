// Fix: this VPS has broken outbound IPv6. Node/undici Happy-Eyeballs races
// IPv6 and times out on hosts with AAAA records (e.g. accounts.google.com),
// breaking Google OIDC discovery. Force IPv4 for this process.
try { require("net").setDefaultAutoSelectFamily(false); } catch {}
try { require("dns").setDefaultResultOrder("ipv4first"); } catch {}
