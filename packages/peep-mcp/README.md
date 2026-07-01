# @shownomore/peep-mcp

Model Context Protocol server for [Peep](https://peep.shownomore.com) — scrape,
crawl, search, and extract the web from Claude, Cursor, VS Code, and any
MCP-compatible client. A thin wrapper over the Peep REST API; every call draws
from your shared **Peep Card** credit balance.

## Setup

Get an API key from your [dashboard](https://peep.shownomore.com/dashboard/api-keys),
then add Peep to your MCP client.

### Claude Desktop / Cursor

```json
{
  "mcpServers": {
    "peep": {
      "command": "npx",
      "args": ["-y", "@shownomore/peep-mcp"],
      "env": { "PEEP_API_KEY": "peep_live_xxx" }
    }
  }
}
```

### Claude Code (CLI)

```bash
claude mcp add peep -e PEEP_API_KEY=peep_live_xxx -- npx -y @shownomore/peep-mcp
```

## Environment

| Variable | Required | Description |
|----------|----------|-------------|
| `PEEP_API_KEY` | yes | Your `peep_live_*` API key. |
| `PEEP_API_BASE` | no | Override the API base URL (defaults to `https://peep.shownomore.com`). |

## Tools

| Tool | Description |
|------|-------------|
| `peep_scrape` | Scrape one URL → markdown / JSON / links / screenshot / YouTube. |
| `peep_crawl` | Crawl a whole site and return the pages (waits for completion). |
| `peep_map` | Discover URLs on a domain. |
| `peep_search` | Web / news / image search, optionally scraping results. |
| `peep_batch_scrape` | Scrape many URLs in parallel. |
| `peep_extract` | AI structured extraction across URLs. |
| `peep_agent` | Autonomous lead / data harvesting from a prompt. |
| `peep_youtube` | Full video intelligence for a YouTube URL. |
| `peep_credits` | Check your Peep Card balance. |

Async tools (`peep_crawl`, `peep_batch_scrape`, `peep_extract`, `peep_agent`)
accept a `wait` flag (default `true`) that blocks until the job completes.

## Build from source

```bash
npm install
npm run build
PEEP_API_KEY=peep_live_xxx node dist/index.js
```

## License

MIT
