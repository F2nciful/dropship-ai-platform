"""
AliExpress product search scraper.

NOTE: AliExpress renders most search results client-side via JavaScript, and
its markup/selectors change frequently. This scraper does a best-effort
parse of the server-rendered HTML and is intentionally defensive — it never
raises to the caller, it just returns whatever it could extract (possibly an
empty list) so a single flaky platform never breaks a combined search.
"""
import logging
import re
import time

import requests
from bs4 import BeautifulSoup

from config import settings

logger = logging.getLogger("scraper.aliexpress")

SEARCH_URL = "https://www.aliexpress.com/wholesale"

_last_request_time = 0.0


def _rate_limit() -> None:
    global _last_request_time
    elapsed = time.monotonic() - _last_request_time
    wait = settings.scrape_rate_limit_seconds - elapsed
    if wait > 0:
        time.sleep(wait)
    _last_request_time = time.monotonic()


def _session() -> requests.Session:
    session = requests.Session()
    session.headers.update(
        {
            "User-Agent": settings.scrape_user_agent,
            "Accept-Language": "en-US,en;q=0.9",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        }
    )
    return session


def _fetch(session: requests.Session, url: str, params: dict) -> requests.Response | None:
    last_error: Exception | None = None
    for attempt in range(1, settings.scrape_max_retries + 1):
        try:
            _rate_limit()
            response = session.get(url, params=params, timeout=settings.scrape_timeout)
            response.raise_for_status()
            return response
        except requests.RequestException as exc:
            last_error = exc
            logger.warning("AliExpress fetch attempt %s/%s failed: %s", attempt, settings.scrape_max_retries, exc)
            time.sleep(min(2 ** attempt, 8))
    logger.error("AliExpress fetch failed after %s attempts: %s", settings.scrape_max_retries, last_error)
    return None


def _parse_price(text: str | None) -> float | None:
    if not text:
        return None
    match = re.search(r"[\d,]+\.?\d*", text.replace(",", ""))
    return float(match.group()) if match else None


def search(query: str, max_results: int = 10) -> list[dict]:
    """Search AliExpress for a query and return a list of normalized product dicts."""
    session = _session()
    response = _fetch(session, SEARCH_URL, params={"SearchText": query})
    if response is None:
        return []

    soup = BeautifulSoup(response.text, "html.parser")
    results: list[dict] = []

    cards = soup.select("[class*='search-item-card'], [class*='product-card'], a[href*='/item/']")

    seen_urls: set[str] = set()
    for card in cards:
        if len(results) >= max_results:
            break

        link = card if card.name == "a" else card.select_one("a[href*='/item/']")
        if not link or not link.get("href"):
            continue
        url = link["href"]
        if url.startswith("//"):
            url = f"https:{url}"
        if url in seen_urls:
            continue
        seen_urls.add(url)

        name_el = card.select_one("[class*='title'], h1, h3")
        price_el = card.select_one("[class*='price']")
        image_el = card.select_one("img")
        rating_el = card.select_one("[class*='rating'], [class*='star']")

        name = name_el.get_text(strip=True) if name_el else link.get("title", "").strip()
        if not name:
            continue

        results.append(
            {
                "name": name,
                "price": _parse_price(price_el.get_text(strip=True) if price_el else None),
                "currency": "USD",
                "image_url": image_el.get("src") or image_el.get("data-src") if image_el else None,
                "url": url,
                "description": None,
                "rating": _parse_price(rating_el.get_text(strip=True)) if rating_el else None,
                "reviews_count": None,
                "orders_count": None,
                "shipping_price": None,
                "seller_name": None,
                "in_stock": True,
                "platform": "aliexpress",
                "sku": None,
                "raw_data": {"source": "aliexpress", "query": query},
            }
        )

    logger.info("AliExpress search for %r returned %s results", query, len(results))
    return results
