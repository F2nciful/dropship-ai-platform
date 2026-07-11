"""
eBay product search — via eBay's official Browse API, not HTML scraping.

eBay's robots.txt explicitly disallows automated access to its search results
page (`Disallow: /sch/i.html?_nkw=`), and live testing while building this
confirmed an immediate 403 block from a plain request regardless of what
robots.txt says. Scraping that page anyway would be exactly the kind of
"ignore the site's stated automation policy" move this module is supposed to
avoid, so this uses eBay's free Browse API instead — it's built for exactly
this (product search), returns structured data (price, image, condition,
buying option, seller), and involves no HTML scraping at all.

Requires a free eBay Developer account: create an app at developer.ebay.com,
then set `ebay_client_id` / `ebay_client_secret` (config.py / .env). Without
credentials configured, search() returns [] (logged clearly) — the same
graceful-empty-result behavior as any other platform that's unreachable.

Note: this integration is implemented against the documented Browse API
response shape but has not been exercised against a live account (no test
credentials were available while building it) — every field access is
defensive (`.get()` with fallbacks) so an unexpected/renamed field degrades
to `None` rather than raising, but it's worth a real search once credentials
are added to confirm the field mapping still matches eBay's current API.
"""
import logging
import time

import requests

import scrape_utils
from config import settings

logger = logging.getLogger("scraper.ebay")

OAUTH_URL = "https://api.ebay.com/identity/v1/oauth2/token"
SEARCH_URL = "https://api.ebay.com/buy/browse/v1/item_summary/search"
ITEM_WEB_URL_FALLBACK = "https://www.ebay.com/itm/{item_id}"

_limiter = scrape_utils.RateLimiter(settings.scrape_rate_limit_seconds)
_token_cache: dict[str, float | str] = {"token": "", "expires_at": 0.0}


def is_configured() -> bool:
    """Whether eBay Browse API credentials are set — lets callers surface a clear
    'needs setup' message instead of an indistinguishable empty result list."""
    return bool(settings.ebay_client_id and settings.ebay_client_secret)


def _get_access_token() -> str | None:
    """Client-credentials OAuth flow, cached in-process until near expiry."""
    if not settings.ebay_client_id or not settings.ebay_client_secret:
        logger.info("eBay client_id/client_secret not configured — skipping eBay search")
        return None

    now = time.monotonic()
    cached_token = _token_cache["token"]
    if cached_token and now < _token_cache["expires_at"]:
        return cached_token  # type: ignore[return-value]

    try:
        response = requests.post(
            OAUTH_URL,
            auth=(settings.ebay_client_id, settings.ebay_client_secret),
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            data={"grant_type": "client_credentials", "scope": "https://api.ebay.com/oauth/api_scope"},
            timeout=settings.scrape_timeout,
        )
        response.raise_for_status()
        data = response.json()
    except requests.RequestException as exc:
        logger.error("eBay OAuth token request failed: %s", exc)
        return None
    except ValueError as exc:
        logger.error("eBay OAuth response was not valid JSON: %s", exc)
        return None

    token = data.get("access_token")
    expires_in = data.get("expires_in", 0)
    if not token:
        logger.error("eBay OAuth response had no access_token: %r", data)
        return None

    _token_cache["token"] = token
    _token_cache["expires_at"] = now + max(int(expires_in) - 60, 60)  # refresh a minute early
    return token


def _parse_item(item: dict) -> dict | None:
    title = item.get("title")
    if not title:
        return None

    price_block = item.get("price") or {}
    price = price_block.get("value")
    currency = price_block.get("currency") or "USD"

    item_id = item.get("itemId") or item.get("legacyItemId")
    url = item.get("itemWebUrl") or (ITEM_WEB_URL_FALLBACK.format(item_id=item_id) if item_id else None)

    buying_options = item.get("buyingOptions") or []
    is_auction = "AUCTION" in buying_options
    current_bid = (item.get("currentBidPrice") or {}).get("value")
    bid_count = item.get("bidCount")  # not always present, depends on listing/marketplace

    seller = item.get("seller") or {}
    shipping_options = item.get("shippingOptions") or []
    shipping_cost = None
    if shipping_options:
        shipping_cost = (shipping_options[0].get("shippingCost") or {}).get("value")

    condition = item.get("condition")
    effective_price = current_bid if (is_auction and current_bid is not None) else price

    return {
        "name": title,
        "price": float(effective_price) if effective_price is not None else None,
        "currency": currency,
        "image_url": (item.get("image") or {}).get("imageUrl"),
        "url": url,
        "description": condition,
        "rating": None,  # the Browse API doesn't expose per-item seller/product ratings
        "reviews_count": None,
        "orders_count": None,
        "shipping_price": float(shipping_cost) if shipping_cost is not None else 0.0,
        "seller_name": seller.get("username"),
        "in_stock": True,
        "platform": "ebay",
        "sku": str(item_id) if item_id else None,
        "raw_data": {
            "source": "ebay",
            "listing_type": "auction" if is_auction else "buy_it_now",
            "buying_options": buying_options,
            "bid_count": bid_count,
            "condition": condition,
        },
    }


def search(query: str, max_results: int = 10) -> list[dict]:
    """
    Search eBay for `query` via the official Browse API and return up to
    `max_results` normalized product dicts. Never raises — returns [] (logged)
    if credentials aren't configured or the request fails for any reason.
    """
    token = _get_access_token()
    if token is None:
        return []

    results: list[dict] = []
    offset = 0
    page_size = min(max_results, 50)  # API cap per page

    while len(results) < max_results:
        limit = min(page_size, max_results - len(results))
        _limiter.wait()
        try:
            response = requests.get(
                SEARCH_URL,
                headers={
                    "Authorization": f"Bearer {token}",
                    "X-EBAY-C-MARKETPLACE-ID": settings.ebay_marketplace_id,
                },
                params={"q": query, "limit": limit, "offset": offset},
                timeout=settings.scrape_timeout,
            )
            response.raise_for_status()
            data = response.json()
        except requests.RequestException as exc:
            logger.error("eBay Browse API search failed: %s", exc)
            break
        except ValueError as exc:
            logger.error("eBay Browse API response was not valid JSON: %s", exc)
            break

        items = data.get("itemSummaries") or []
        if not items:
            break

        for raw_item in items:
            parsed = _parse_item(raw_item)
            if parsed:
                results.append(parsed)
            if len(results) >= max_results:
                break

        total = data.get("total", 0)
        offset += len(items)
        if offset >= total or len(items) < limit:
            break

    logger.info("eBay search for %r returned %s results", query, len(results))
    return results
