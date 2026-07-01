# @shownomore/peep-sdk

Official Node.js SDK for the [Peep](https://peep.shownomore.com) web scraping
API. Scrape, crawl, map, search, extract, and run autonomous agents — all from a
typed client. Every call draws from your shared **Peep Card** credit balance.

## Install

Use any package manager — they all resolve from the npm registry:

```bash
npm install @shownomore/peep-sdk
yarn add @shownomore/peep-sdk
pnpm add @shownomore/peep-sdk
bun add @shownomore/peep-sdk
```

## Usage

```js
import { Peep } from "@shownomore/peep-sdk";

const peep = new Peep({ apiKey: process.env.PEEP_API_KEY });

// Scrape a page to markdown
const res = await peep.scrape("https://example.com", { formats: ["markdown"] });
console.log(res.data.markdown);
console.log(peep.lastCredits); // { used: 1, remaining: 499 }

// Crawl a site and wait for completion
const crawl = await peep.crawlAndWait("https://example.com", { limit: 50 });

// Search the web
const hits = await peep.search("best web scraping api", { limit: 10 });

// AI structured extraction
const data = await peep.extractAndWait(["https://example.com"], {
  prompt: "Extract the company name and pricing tiers.",
});

// Autonomous harvesting
const leads = await peep.agentAndWait(
  "Find flats for rent in Vivek Vihar with phone numbers and photos",
  { maxSources: 10 },
);

// Check your balance
const { balance } = await peep.credits();
```

## API

| Method | Endpoint | Notes |
|--------|----------|-------|
| `scrape(url, options?)` | `POST /scrape` | Sync. Pass a YouTube URL for video intelligence. |
| `youtube(url)` | `POST /scrape` | Sugar for YouTube videos. |
| `map(url, options?)` | `POST /map` | Sync URL discovery. |
| `search(query, options?)` | `POST /search` | Sync. |
| `crawl(url, options?)` / `crawlAndWait(...)` | `POST /crawl` | Async; `*AndWait` polls to completion. |
| `batchScrape(urls, options?)` / `batchScrapeAndWait(...)` | `POST /batch/scrape` | Async. |
| `extract(urls, options?)` / `extractAndWait(...)` | `POST /extract` | Async. |
| `agent(prompt, options?)` / `agentAndWait(...)` | `POST /agent` | Async. |
| `credits()` | `GET /credits` | Free. Balance + ledger. |

Non-2xx responses throw a `PeepError` with `.status`, `.code`, and `.message`.
After every call, `peep.lastCredits` holds `{ used, remaining }` from the
`X-Peep-Credits-*` headers.

## Options

```js
new Peep({
  apiKey: "peep_live_xxx",
  baseUrl: "https://peep.shownomore.com", // optional override
});
```

## License

MIT
