"""
Amazon product search scraper (basic).

Amazon aggressively rate-limits and CAPTCHA-gates automated traffic, so this
is a best-effort, defensive scraper: on failure or a block page it simply
returns an empty list rather than raising.
"""
import logging
import re
import time

import requests
from bs4 import BeautifulSoup

from config import settings

logger = logging.getLogger("scraper.amazon")

SEARCH_URL = "https://www.amazon.com/s"

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
            logger.warning("Amazon fetch attempt %s/%s failed: %s", attempt, settings.scrape_max_retries, exc)
            time.sleep(min(2 ** attempt, 8))
    logger.error("Amazon fetch failed after %s attempts: %s", settings.scrape_max_retries, last_error)
    return None


def _parse_price(text: str | None) -> float | None:
    if not text:
        return None
    match = re.search(r"[\d,]+\.?\d*", text.replace(",", ""))
    return float(match.group()) if match else None


def search(query: str, max_results: int = 10) -> list[dict]:
    """Search Amazon for a query and return a list of normalized product dicts."""
    session = _session()
    response = _fetch(session, SEARCH_URL, params={"k": query})
    if response is None:
        return []

    soup = BeautifulSoup(response.text, "html.parser")
    results: list[dict] = []

    cards = soup.select("[data-component-type='s-search-result']")

    for card in cards:
        if len(results) >= max_results:
            break

        name_el = card.select_one("h2 span")
        link_el = card.select_one("h2 a")
        price_el = card.select_one(".a-price .a-offscreen")
        image_el = card.select_one("img.s-image")
        rating_el = card.select_one("[aria-label*='out of 5 stars']")
        reviews_el = card.select_one("[aria-label*='ratings'], .a-size-base.s-underline-text")

        if not name_el or not link_el:
            continue

        url = link_el.get("href", "")
        if url.startswith("/"):
            url = f"https://www.amazon.com{url}"

        rating = None
        if rating_el and rating_el.get("aria-label"):
            rating = _parse_price(rating_el["aria-label"])

        results.append(
            {
                "name": name_el.get_text(strip=True),
                "price": _parse_price(price_el.get_text(strip=True) if price_el else None),
                "currency": "USD",
                "image_url": image_el.get("src") if image_el else None,
                "url": url,
                "description": None,
                "rating": rating,
                "reviews_count": int(re.sub(r"[^\d]", "", reviews_el.get_text())) if reviews_el and re.sub(r"[^\d]", "", reviews_el.get_text()) else None,
                "orders_count": None,
                "shipping_price": None,
                "seller_name": "Amazon",
                "in_stock": True,
                "platform": "amazon",
                "sku": card.get("data-asin") or None,
                "raw_data": {"source": "amazon", "query": query},
            }
        )

    logger.info("Amazon search for %r returned %s results", query, len(results))
    return results
