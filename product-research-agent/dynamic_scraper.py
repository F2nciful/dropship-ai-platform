"""
Generic, config-driven scraper for user-added custom platforms.

Unlike scraper_aliexpress.py/scraper_amazon.py/scraper_ebay.py (which hardcode
selectors for one specific site each), this module scrapes whatever platform
is described by a PlatformDB row's `config`: a search URL template and a set
of CSS selectors. Rate limiting and retries are tracked per platform name so
one slow/misbehaving custom platform doesn't affect another.
"""
import logging
import re
import time
from urllib.parse import quote

import requests
from bs4 import BeautifulSoup

from config import settings

logger = logging.getLogger("scraper.dynamic")

_last_request_by_platform: dict[str, float] = {}


def _rate_limit(platform_name: str, rate_limit_seconds: float) -> None:
    last = _last_request_by_platform.get(platform_name, 0.0)
    elapsed = time.monotonic() - last
    wait = rate_limit_seconds - elapsed
    if wait > 0:
        time.sleep(wait)
    _last_request_by_platform[platform_name] = time.monotonic()


def _parse_price(text: str | None) -> float | None:
    if not text:
        return None
    match = re.search(r"[\d,]+\.?\d*", text.replace(",", ""))
    return float(match.group()) if match else None


def _resolve_link(base_url: str, href: str | None) -> str | None:
    if not href:
        return None
    if href.startswith("http://") or href.startswith("https://"):
        return href
    if href.startswith("//"):
        return f"https:{href}"
    return base_url.rstrip("/") + "/" + href.lstrip("/")


def search(query: str, max_results: int, platform_name: str, base_url: str, config: dict) -> list[dict]:
    """
    Scrape a custom platform using its stored config. Never raises to the
    caller — returns [] (and logs why) on any failure, so one bad custom
    platform can't break a combined search.
    """
    selectors = config.get("selectors") or {}
    item_selector = selectors.get("item")
    if not item_selector:
        logger.warning("Platform %r has no selectors.item configured; skipping scrape", platform_name)
        return []

    search_url_template = config.get("search_url_template")
    rate_limit_seconds = config.get("rate_limit_seconds") or settings.scrape_rate_limit_seconds
    max_retries = int(config.get("max_retries") or settings.scrape_max_retries)
    timeout = config.get("timeout") or settings.scrape_timeout
    extra_headers = config.get("headers") or {}

    if search_url_template:
        search_url = search_url_template.format(query=quote(query))
        params = None
    else:
        search_url = base_url
        params = {"q": query}

    session = requests.Session()
    session.headers.update({"User-Agent": settings.scrape_user_agent, **extra_headers})

    response = None
    last_error: Exception | None = None
    for attempt in range(1, max_retries + 1):
        try:
            _rate_limit(platform_name, rate_limit_seconds)
            resp = session.get(search_url, params=params, timeout=timeout)
            resp.raise_for_status()
            response = resp
            break
        except requests.RequestException as exc:
            last_error = exc
            logger.warning("%s fetch attempt %s/%s failed: %s", platform_name, attempt, max_retries, exc)
            time.sleep(min(2 ** attempt, 8))

    if response is None:
        logger.error("%s fetch failed after %s attempts: %s", platform_name, max_retries, last_error)
        return []

    soup = BeautifulSoup(response.text, "html.parser")
    results: list[dict] = []

    for card in soup.select(item_selector):
        if len(results) >= max_results:
            break

        name_el = card.select_one(selectors["name"]) if selectors.get("name") else None
        price_el = card.select_one(selectors["price"]) if selectors.get("price") else None
        image_el = card.select_one(selectors["image"]) if selectors.get("image") else None
        link_el = card.select_one(selectors["link"]) if selectors.get("link") else None
        rating_el = card.select_one(selectors["rating"]) if selectors.get("rating") else None

        name = name_el.get_text(strip=True) if name_el else None
        if not name:
            continue

        image_url = None
        if image_el:
            image_url = image_el.get("src") or image_el.get("data-src")
            image_url = _resolve_link(base_url, image_url)

        results.append(
            {
                "name": name,
                "price": _parse_price(price_el.get_text(strip=True)) if price_el else None,
                "currency": "USD",
                "image_url": image_url,
                "url": _resolve_link(base_url, link_el.get("href")) if link_el else None,
                "description": None,
                "rating": _parse_price(rating_el.get_text(strip=True)) if rating_el else None,
                "reviews_count": None,
                "orders_count": None,
                "shipping_price": None,
                "seller_name": None,
                "in_stock": True,
                "platform": platform_name,
                "sku": None,
                "raw_data": {"source": platform_name, "query": query},
            }
        )

    logger.info("%s search for %r returned %s results", platform_name, query, len(results))
    return results
