"""
eBay product search scraper (basic).

eBay's search results page is largely server-rendered, which makes it more
scrape-friendly than Amazon/AliExpress, but selectors still drift over time —
this stays defensive and returns an empty list on failure rather than raising.
"""
import logging
import re
import time

import requests
from bs4 import BeautifulSoup

from config import settings

logger = logging.getLogger("scraper.ebay")

SEARCH_URL = "https://www.ebay.com/sch/i.html"

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
            logger.warning("eBay fetch attempt %s/%s failed: %s", attempt, settings.scrape_max_retries, exc)
            time.sleep(min(2 ** attempt, 8))
    logger.error("eBay fetch failed after %s attempts: %s", settings.scrape_max_retries, last_error)
    return None


def _parse_price(text: str | None) -> float | None:
    if not text:
        return None
    match = re.search(r"[\d,]+\.?\d*", text.replace(",", ""))
    return float(match.group()) if match else None


def search(query: str, max_results: int = 10) -> list[dict]:
    """Search eBay for a query and return a list of normalized product dicts."""
    session = _session()
    response = _fetch(session, SEARCH_URL, params={"_nkw": query})
    if response is None:
        return []

    soup = BeautifulSoup(response.text, "html.parser")
    results: list[dict] = []

    cards = soup.select("li.s-item")

    for card in cards:
        if len(results) >= max_results:
            break

        name_el = card.select_one(".s-item__title")
        link_el = card.select_one("a.s-item__link")
        price_el = card.select_one(".s-item__price")
        image_el = card.select_one(".s-item__image img")
        shipping_el = card.select_one(".s-item__shipping, .s-item__freeXDays")
        reviews_el = card.select_one(".s-item__reviews-count span")

        if not name_el or not link_el:
            continue

        name = name_el.get_text(strip=True)
        if name.lower() in {"shop on ebay", ""}:
            continue

        results.append(
            {
                "name": name,
                "price": _parse_price(price_el.get_text(strip=True) if price_el else None),
                "currency": "USD",
                "image_url": image_el.get("src") if image_el else None,
                "url": link_el.get("href"),
                "description": None,
                "rating": None,
                "reviews_count": int(re.sub(r"[^\d]", "", reviews_el.get_text())) if reviews_el and re.sub(r"[^\d]", "", reviews_el.get_text()) else None,
                "orders_count": None,
                "shipping_price": _parse_price(shipping_el.get_text(strip=True)) if shipping_el else 0.0,
                "seller_name": None,
                "in_stock": True,
                "platform": "ebay",
                "sku": None,
                "raw_data": {"source": "ebay", "query": query},
            }
        )

    logger.info("eBay search for %r returned %s results", query, len(results))
    return results
