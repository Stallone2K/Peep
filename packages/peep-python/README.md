# peep-sdk (Python)

Official Python SDK for the [Peep](https://peep.shownomore.com) web scraping
API. Scrape, crawl, map, search, extract, and run autonomous agents. Every call
draws from your shared **Peep Card** credit balance.

## Install

From PyPI with pip, Poetry, or uv:

```bash
pip install peep-sdk
poetry add peep-sdk
uv add peep-sdk
```

## Usage

```python
import os
from peep import Peep

peep = Peep(api_key=os.environ["PEEP_API_KEY"])

# Scrape a page to markdown
res = peep.scrape("https://example.com", formats=["markdown"])
print(res["data"]["markdown"])
print(peep.last_credits)  # {"used": 1, "remaining": 499}

# Crawl a site and wait for completion
crawl = peep.crawl_and_wait("https://example.com", limit=50)

# Search the web
hits = peep.search("best web scraping api", limit=10)

# AI structured extraction
data = peep.extract_and_wait(
    ["https://example.com"],
    prompt="Extract the company name and pricing tiers.",
)

# Autonomous harvesting
leads = peep.agent_and_wait(
    "Find flats for rent in Vivek Vihar with phone numbers and photos",
    maxSources=10,
)

# Check your balance
print(peep.credits()["balance"])
```

> Option keyword arguments are passed through verbatim — use the API's
> camelCase names, e.g. `peep.scrape(url, onlyMainContent=True)`.

## Methods

| Method | Endpoint | Notes |
|--------|----------|-------|
| `scrape(url, **options)` | `POST /scrape` | Sync. Pass a YouTube URL for video intelligence. |
| `youtube(url)` | `POST /scrape` | Sugar for YouTube videos. |
| `map(url, **options)` | `POST /map` | Sync URL discovery. |
| `search(query, **options)` | `POST /search` | Sync. |
| `crawl(...)` / `crawl_and_wait(...)` | `POST /crawl` | Async; `*_and_wait` polls to completion. |
| `batch_scrape(...)` / `batch_scrape_and_wait(...)` | `POST /batch/scrape` | Async. |
| `extract(...)` / `extract_and_wait(...)` | `POST /extract` | Async. |
| `agent(...)` / `agent_and_wait(...)` | `POST /agent` | Async. |
| `credits()` | `GET /credits` | Free. Balance + ledger. |

Non-2xx responses raise `PeepError` with `.status` and `.code`. After every
call, `peep.last_credits` holds `{"used", "remaining"}` from the response
headers.

## License

MIT
