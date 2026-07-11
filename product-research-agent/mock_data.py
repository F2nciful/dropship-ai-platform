"""
Clearly-labeled placeholder product listings, used only as an opt-in fallback
(`settings.scrape_mock_fallback`, off by default) when a platform's real
scrape fails outright — blocked, timed out, network error — not when it
succeeds with zero genuine matches, which is a real, honest result.

These are never mixed silently into real results: every mock item's name is
prefixed "[DEMO]" and its raw_data carries `"mock": true`, so a caller can
always tell mock and real data apart programmatically, and a person can't
mistake a demo listing for real market data a sourcing decision could be
based on.
"""
import random

_TEMPLATES = [
    {"name": "Wireless Bluetooth Earbuds", "price": 18.99, "rating": 4.3, "reviews_count": 812},
    {"name": "Adjustable Phone Stand", "price": 7.49, "rating": 4.6, "reviews_count": 340},
    {"name": "LED Desk Lamp with USB Charging Port", "price": 24.50, "rating": 4.4, "reviews_count": 1205},
    {"name": "Portable Mini Blender", "price": 15.75, "rating": 4.1, "reviews_count": 567},
    {"name": "Stainless Steel Water Bottle 32oz", "price": 12.99, "rating": 4.7, "reviews_count": 2301},
]

_PLATFORM_CURRENCY = {"aliexpress": "USD", "amazon": "USD", "ebay": "USD"}


def generate(platform: str, query: str, max_results: int) -> list[dict]:
    """Build up to `max_results` clearly-labeled placeholder listings for `platform`."""
    currency = _PLATFORM_CURRENCY.get(platform, "USD")
    count = min(max_results, len(_TEMPLATES))
    results = []
    for i in range(count):
        template = _TEMPLATES[i]
        jitter = round(random.uniform(0.9, 1.1), 2)
        results.append({
            "name": f"[DEMO] {template['name']} — {query}",
            "price": round(template["price"] * jitter, 2),
            "currency": currency,
            "image_url": None,
            "url": None,
            "description": "Placeholder listing — real scraping was unavailable for this search.",
            "rating": template["rating"],
            "reviews_count": template["reviews_count"],
            "orders_count": None,
            "shipping_price": 0.0,
            "seller_name": "Demo Seller",
            "in_stock": True,
            "platform": platform,
            "sku": None,
            "raw_data": {"source": platform, "mock": True, "query": query},
        })
    return results
