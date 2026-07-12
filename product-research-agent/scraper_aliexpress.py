"""
AliExpress product search scraper.

AliExpress server-renders its search results as a large JSON blob embedded in
a <script> tag (`window._dida_config_._init_data_ = { data: {...} }`) rather
than as plain HTML product cards — this scraper extracts and parses that JSON
directly, which is far more reliable than CSS-selector scraping against a
site whose class names are build-hashed and change on every deploy. A CSS-
selector fallback is kept for resilience in case AliExpress ever serves a
different page variant that doesn't include the JSON blob.

AliExpress actively bot-detects: bursts of requests (or unusual cookie/header
combinations) can trigger a CAPTCHA "punish" interstitial instead of real
results — confirmed live while building this scraper. That page is detected
explicitly and treated the same as any other failure: an empty list, logged,
never a crash, never fabricated data standing in for a real result.
"""
import json
import logging
import re

from bs4 import BeautifulSoup

import scrape_utils
from config import settings

logger = logging.getLogger("scraper.aliexpress")

SEARCH_URL = "https://www.aliexpress.com/wholesale"
ITEM_URL_TEMPLATE = "https://www.aliexpress.com/item/{product_id}.html"

_limiter = scrape_utils.RateLimiter(settings.scrape_rate_limit_seconds)
_INIT_DATA_RE = re.compile(r"window\._dida_config_\._init_data_\s*=\s*\{\s*data:\s*")


def _extract_balanced_json(text: str, start: int) -> str | None:
    """Extract a balanced {...} JSON object starting at `start` — the blob is a JS object
    literal embedded in HTML, not delimited by anything else JSON-parseable can key off."""
    depth = 0
    in_str = False
    esc = False
    str_char = ""
    i = start
    n = len(text)
    while i < n:
        c = text[i]
        if in_str:
            if esc:
                esc = False
            elif c == "\\":
                esc = True
            elif c == str_char:
                in_str = False
        else:
            if c in "\"'":
                in_str = True
                str_char = c
            elif c == "{":
                depth += 1
            elif c == "}":
                depth -= 1
                if depth == 0:
                    return text[start:i + 1]
        i += 1
    return None


def _is_captcha_page(html: str) -> bool:
    return '"action":"captcha"' in html or "_____tmd_____" in html


def _find_item_list(node) -> list[dict] | None:
    """Recursively search the parsed page-data tree for the product list — a list of dicts
    each carrying `productId` (most, but not all, also carry `prices` — some card variants,
    e.g. bundle/collection cards, omit it, so this only requires the id). Not a hardcoded
    path: AliExpress's component keys (e.g. 'cards2023_3722') carry version suffixes that
    change over time, so this looks for the shape of the data rather than a tree location."""
    if isinstance(node, dict):
        for value in node.values():
            found = _find_item_list(value)
            if found is not None:
                return found
    elif isinstance(node, list):
        if node and all(isinstance(item, dict) and "productId" in item for item in node):
            return node
        for item in node:
            found = _find_item_list(item)
            if found is not None:
                return found
    return None


def _extract_page_data(html: str) -> dict | None:
    match = _INIT_DATA_RE.search(html)
    if not match:
        return None
    json_text = _extract_balanced_json(html, match.end())
    if not json_text:
        return None
    try:
        return json.loads(json_text)
    except json.JSONDecodeError as exc:
        logger.warning("AliExpress page-data JSON failed to parse: %s", exc)
        return None


def _item_from_json(item: dict) -> dict | None:
    product_id = item.get("productId") or item.get("redirectedId")
    if not product_id:
        return None

    title = ((item.get("title") or {}).get("displayTitle") or "").strip()
    if not title:
        return None

    image = item.get("image") or {}
    image_url = image.get("imgUrl")
    if image_url and image_url.startswith("//"):
        image_url = f"https:{image_url}"

    prices = item.get("prices") or {}
    price_block = prices.get("salePrice") or prices.get("originalPrice") or {}
    price = price_block.get("minPrice")
    currency = price_block.get("currencyCode") or "USD"

    rating = (item.get("evaluation") or {}).get("starRating")

    orders_count = None
    trade_desc = (item.get("trade") or {}).get("tradeDesc")
    if trade_desc:
        orders_count = scrape_utils.parse_int(trade_desc)

    seller_name = None
    custom = ((item.get("trace") or {}).get("custom") or {}).get("p4pExtendParam")
    if custom:
        seller_match = re.search(r'"store_name"\s*:\s*"([^"]+)"', custom)
        if seller_match:
            seller_name = seller_match.group(1)

    return {
        "name": title,
        "price": float(price) if price is not None else None,
        "currency": currency,
        "image_url": image_url,
        "url": ITEM_URL_TEMPLATE.format(product_id=product_id),
        "description": None,
        "rating": float(rating) if rating is not None else None,
        "reviews_count": None,  # not present on search-result cards, only on the item's own page
        "orders_count": orders_count,
        "shipping_price": None,
        "seller_name": seller_name,
        "in_stock": True,
        "platform": "aliexpress",
        "sku": str(product_id),
        "raw_data": {"source": "aliexpress", "product_id": product_id},
    }


def _parse_html_fallback(html: str, max_results: int) -> list[dict]:
    """CSS-selector fallback for when the embedded JSON blob isn't found. Far less reliable
    than the JSON path (AliExpress's class names are build-hashed), kept only for resilience."""
    soup = BeautifulSoup(html, "html.parser")
    results: list[dict] = []
    seen_urls: set[str] = set()

    cards = soup.select("[class*='search-item-card'], [class*='product-card'], a[href*='/item/']")
    for card in cards:
        if len(results) >= max_results:
            break
        link = card if card.name == "a" else card.select_one("a[href*='/item/']")
        if not link or not link.get("href"):
            continue
        url = scrape_utils.resolve_link("https://www.aliexpress.com", link["href"])
        if url in seen_urls:
            continue
        seen_urls.add(url)

        name_el = card.select_one("[class*='title'], h1, h3")
        price_el = card.select_one("[class*='price']")
        image_el = card.select_one("img")
        rating_el = card.select_one("[class*='rating'], [class*='star']")

        name = name_el.get_text(strip=True) if name_el else (link.get("title") or "").strip()
        if not name:
            continue

        price_text = price_el.get_text(strip=True) if price_el else None
        results.append({
            "name": name,
            "price": scrape_utils.parse_number(price_text),
            "currency": scrape_utils.detect_currency(price_text),
            "image_url": (image_el.get("src") or image_el.get("data-src")) if image_el else None,
            "url": url,
            "description": None,
            "rating": scrape_utils.parse_number(rating_el.get_text(strip=True)) if rating_el else None,
            "reviews_count": None,
            "orders_count": None,
            "shipping_price": None,
            "seller_name": None,
            "in_stock": True,
            "platform": "aliexpress",
            "sku": None,
            "raw_data": {"source": "aliexpress", "fallback": "css"},
        })
    return results


def search(query: str, max_results: int = 10) -> list[dict]:
    """
    Search AliExpress for `query` and return up to `max_results` normalized product dicts,
    fetching additional result pages as needed (up to settings.scrape_max_pages). Never
    raises — returns whatever was collected (possibly []) on any failure or block.
    """
    session = scrape_utils.new_session()
    results: list[dict] = []
    seen_ids: set[str] = set()

    for page_num in range(1, settings.scrape_max_pages + 1):
        if len(results) >= max_results:
            break

        params = {"SearchText": query}
        if page_num > 1:
            params["page"] = page_num

        response = scrape_utils.fetch_with_retry(
            session, SEARCH_URL, params=params, limiter=_limiter,
            max_retries=settings.scrape_max_retries, timeout=settings.scrape_timeout,
            platform_label="AliExpress",
        )
        if response is None:
            break

        if _is_captcha_page(response.text):
            logger.warning("AliExpress served a CAPTCHA challenge — treating as blocked for this search")
            break

        page_data = _extract_page_data(response.text)
        page_items: list[dict] = []
        if page_data is not None:
            for raw_item in _find_item_list(page_data) or []:
                parsed = _item_from_json(raw_item)
                if parsed and parsed["sku"] not in seen_ids:
                    seen_ids.add(parsed["sku"])
                    page_items.append(parsed)
        else:
            page_items = _parse_html_fallback(response.text, max_results - len(results))

        if not page_items:
            break  # no more results, or an unrecognized page structure — stop rather than loop needlessly

        results.extend(page_items[: max_results - len(results)])

    logger.info("AliExpress search for %r returned %s results", query, len(results))
    return results


if __name__ == "__main__":
    results = search("iphone", max_results=100)
    print(f"Results count: {len(results)}")
    if results:
        print("First result:")
        print(results[0])
    else:
        print("No results found - Scraper is broken")
