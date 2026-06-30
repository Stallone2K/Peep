"""Peep API client."""

from __future__ import annotations

import time
from typing import Any, Callable, Dict, List, Optional

import requests

_TERMINAL = ("completed", "failed", "cancelled", "canceled", "error")


class PeepError(Exception):
    """Raised on any non-2xx response from the Peep API."""

    def __init__(self, status: int, code: str, message: str) -> None:
        super().__init__(message)
        self.status = status
        self.code = code


class Peep:
    """Client for the Peep web scraping API.

    Args:
        api_key: Your ``peep_live_*`` API key.
        base_url: Override the API base URL.

    Option keyword arguments are passed through verbatim, so use the API's
    camelCase names — e.g. ``peep.scrape(url, onlyMainContent=True)``.
    """

    def __init__(
        self,
        api_key: str,
        base_url: str = "https://peep.shownomore.com",
    ) -> None:
        if not api_key:
            raise ValueError("Peep: api_key is required.")
        self.api_key = api_key
        self.base_url = base_url.rstrip("/")
        self.last_credits: Dict[str, Optional[int]] = {"used": None, "remaining": None}
        self._session = requests.Session()

    # ── Internals ───────────────────────────────────────────────
    def _request(
        self, method: str, path: str, body: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        res = self._session.request(
            method,
            f"{self.base_url}{path}",
            headers={"Authorization": f"Bearer {self.api_key}"},
            json=body,
        )

        used = res.headers.get("x-peep-credits-used")
        remaining = res.headers.get("x-peep-credits-remaining")
        self.last_credits = {
            "used": int(used) if used is not None else None,
            "remaining": int(remaining) if remaining is not None else None,
        }

        data = res.json() if res.text else {}
        if not res.ok:
            err = data.get("error", {}) if isinstance(data, dict) else {}
            raise PeepError(
                res.status_code,
                err.get("code", "UNKNOWN"),
                err.get("message", f"Request failed with status {res.status_code}"),
            )
        return data

    def _start_and_wait(
        self,
        start: Callable[[], Dict[str, Any]],
        get_status: Callable[[str], Dict[str, Any]],
        poll_interval: float,
        timeout: float,
    ) -> Dict[str, Any]:
        job = start()
        job_id = job.get("jobId")
        if not job_id:
            return job
        deadline = time.time() + timeout
        last = get_status(job_id)
        while time.time() < deadline:
            if str(last.get("status", "")).lower() in _TERMINAL:
                return last
            time.sleep(poll_interval)
            last = get_status(job_id)
        return last  # timed out — return the latest snapshot

    # ── Sync endpoints ──────────────────────────────────────────
    def scrape(self, url: str, **options: Any) -> Dict[str, Any]:
        return self._request("POST", "/api/v1/scrape", {"url": url, **options})

    def youtube(self, url: str) -> Dict[str, Any]:
        return self.scrape(url, formats=["markdown"])

    def map(self, url: str, **options: Any) -> Dict[str, Any]:
        return self._request("POST", "/api/v1/map", {"url": url, **options})

    def search(self, query: str, **options: Any) -> Dict[str, Any]:
        return self._request("POST", "/api/v1/search", {"query": query, **options})

    # ── Async endpoints ─────────────────────────────────────────
    def crawl(self, url: str, **options: Any) -> Dict[str, Any]:
        return self._request("POST", "/api/v1/crawl", {"url": url, **options})

    def get_crawl(self, job_id: str) -> Dict[str, Any]:
        return self._request("GET", f"/api/v1/crawl/{job_id}")

    def crawl_and_wait(
        self, url: str, poll_interval: float = 2.5, timeout: float = 300, **options: Any
    ) -> Dict[str, Any]:
        return self._start_and_wait(
            lambda: self.crawl(url, **options), self.get_crawl, poll_interval, timeout
        )

    def batch_scrape(
        self, urls: List[str], scrape_options: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        return self._request(
            "POST",
            "/api/v1/batch/scrape",
            {"urls": urls, "scrapeOptions": scrape_options or {}},
        )

    def get_batch(self, job_id: str) -> Dict[str, Any]:
        return self._request("GET", f"/api/v1/batch/scrape/{job_id}")

    def batch_scrape_and_wait(
        self,
        urls: List[str],
        scrape_options: Optional[Dict[str, Any]] = None,
        poll_interval: float = 2.5,
        timeout: float = 300,
    ) -> Dict[str, Any]:
        return self._start_and_wait(
            lambda: self.batch_scrape(urls, scrape_options),
            self.get_batch,
            poll_interval,
            timeout,
        )

    def extract(self, urls: List[str], **options: Any) -> Dict[str, Any]:
        return self._request("POST", "/api/v1/extract", {"urls": urls, **options})

    def get_extract(self, job_id: str) -> Dict[str, Any]:
        return self._request("GET", f"/api/v1/extract/{job_id}")

    def extract_and_wait(
        self,
        urls: List[str],
        poll_interval: float = 2.5,
        timeout: float = 300,
        **options: Any,
    ) -> Dict[str, Any]:
        return self._start_and_wait(
            lambda: self.extract(urls, **options),
            self.get_extract,
            poll_interval,
            timeout,
        )

    def agent(self, prompt: str, **options: Any) -> Dict[str, Any]:
        return self._request("POST", "/api/v1/agent", {"prompt": prompt, **options})

    def get_agent(self, job_id: str) -> Dict[str, Any]:
        return self._request("GET", f"/api/v1/agent/{job_id}")

    def agent_and_wait(
        self,
        prompt: str,
        poll_interval: float = 2.5,
        timeout: float = 300,
        **options: Any,
    ) -> Dict[str, Any]:
        return self._start_and_wait(
            lambda: self.agent(prompt, **options),
            self.get_agent,
            poll_interval,
            timeout,
        )

    # ── Credits ─────────────────────────────────────────────────
    def credits(self) -> Dict[str, Any]:
        return self._request("GET", "/api/v1/credits")
