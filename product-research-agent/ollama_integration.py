"""
Ollama integration — uses a local LLM to summarize and analyze scraped
products for dropshipping viability (target audience, selling points,
pricing sanity check, marketing copy).
"""
import json
import logging

import requests

from config import settings

logger = logging.getLogger("ollama_integration")

SUMMARY_SYSTEM_PROMPT = (
    "You are a dropshipping product research assistant. Given raw product data, "
    "write a concise 2-3 sentence summary covering: what the product is, who it "
    "would appeal to, and whether the price/rating suggest it's worth sourcing. "
    "Be direct and avoid filler."
)

ANALYSIS_SYSTEM_PROMPT = (
    "You are a dropshipping product analyst. Given raw product data, respond with "
    "ONLY a JSON object (no markdown fences, no commentary before or after) with "
    "exactly these keys:\n"
    '  "description": a rewritten, professional 2-3 sentence product description\n'
    '  "suggested_price": a number — a competitive retail price in the same currency\n'
    '  "profit_margin_percent": a number — estimated profit margin percent at that '
    "price versus the given cost\n"
    '  "target_audience": a short phrase describing who would buy this\n'
    '  "keywords": an array of 5-8 short marketing/SEO keyword strings\n'
    "If a cost/price isn't given, make a reasonable estimate based on the product type."
)

COMPARISON_SYSTEM_PROMPT = (
    "You are a dropshipping product analyst. Given a numbered list of products, write "
    "a concise 3-5 sentence comparison covering: which product looks like the best "
    "opportunity and why, any notable price or rating outliers, and one actionable "
    "recommendation. Be direct, no filler."
)


def _build_user_prompt(product: dict) -> str:
    parts = [f"Name: {product.get('name', 'Unknown')}"]
    if product.get("price") is not None:
        parts.append(f"Price: {product.get('currency', 'USD')} {product['price']}")
    if product.get("rating") is not None:
        parts.append(f"Rating: {product['rating']}")
    if product.get("reviews_count") is not None:
        parts.append(f"Reviews: {product['reviews_count']}")
    if product.get("platform"):
        parts.append(f"Platform: {product['platform']}")
    if product.get("description"):
        parts.append(f"Description: {product['description']}")
    return "\n".join(parts)


def _build_products_list_prompt(products: list[dict]) -> str:
    lines = []
    for i, p in enumerate(products, 1):
        parts = [p.get("name", "Unknown")]
        if p.get("price") is not None:
            parts.append(f"{p.get('currency', 'USD')} {p['price']}")
        if p.get("rating") is not None:
            parts.append(f"rating {p['rating']}")
        if p.get("platform"):
            parts.append(f"on {p['platform']}")
        lines.append(f"{i}. " + " — ".join(str(x) for x in parts))
    return "\n".join(lines)


def _extract_json(text: str) -> dict | None:
    """LLMs often wrap JSON in code fences or add stray commentary — try increasingly
    forgiving strategies before giving up."""
    text = text.strip()
    if text.startswith("```"):
        text = text.strip("`")
        if text[:4].lower() == "json":
            text = text[4:]
        text = text.strip()

    try:
        return json.loads(text)
    except (ValueError, TypeError):
        pass

    start, end = text.find("{"), text.rfind("}")
    if start != -1 and end != -1 and end > start:
        try:
            return json.loads(text[start:end + 1])
        except (ValueError, TypeError):
            return None
    return None


def _to_float(value) -> float | None:
    try:
        return float(value) if value is not None else None
    except (TypeError, ValueError):
        return None


def _chat(messages: list[dict], *, json_mode: bool = False) -> str | None:
    payload = {
        "model": settings.ollama_model,
        "messages": messages,
        "stream": False,
    }
    if json_mode:
        payload["format"] = "json"

    try:
        response = requests.post(
            f"{settings.ollama_base_url}/api/chat",
            json=payload,
            timeout=settings.ollama_timeout,
        )
        response.raise_for_status()
        data = response.json()
        return data.get("message", {}).get("content", "").strip() or None
    except requests.RequestException as exc:
        logger.error("Ollama request failed: %s", exc)
        return None
    except (KeyError, ValueError) as exc:
        logger.error("Ollama returned an unexpected response shape: %s", exc)
        return None


def is_healthy() -> bool:
    """Check whether Ollama is reachable."""
    try:
        response = requests.get(f"{settings.ollama_base_url}/api/tags", timeout=5)
        return response.ok
    except requests.RequestException as exc:
        logger.warning("Ollama health check failed: %s", exc)
        return False


def summarize_product(product: dict) -> str | None:
    """
    Ask Ollama to summarize a product dict. Returns None (never raises) if
    Ollama is unreachable or the request fails, so callers can gracefully
    skip the AI summary rather than fail the whole request.
    """
    return _chat([
        {"role": "system", "content": SUMMARY_SYSTEM_PROMPT},
        {"role": "user", "content": _build_user_prompt(product)},
    ])


def analyze_product(product: dict) -> dict | None:
    """
    Ask Ollama for a structured analysis: rewritten description, suggested price,
    profit margin estimate, target audience, and marketing keywords. Returns None
    (never raises) if Ollama is unreachable or the response can't be parsed.
    """
    content = _chat(
        [
            {"role": "system", "content": ANALYSIS_SYSTEM_PROMPT},
            {"role": "user", "content": _build_user_prompt(product)},
        ],
        json_mode=True,
    )
    if not content:
        return None

    parsed = _extract_json(content)
    if not parsed:
        logger.error("Could not parse AI analysis JSON: %r", content[:300])
        return None

    keywords = parsed.get("keywords")
    return {
        "description": parsed.get("description") or None,
        "suggested_price": _to_float(parsed.get("suggested_price")),
        "profit_margin_percent": _to_float(parsed.get("profit_margin_percent")),
        "target_audience": parsed.get("target_audience") or None,
        "keywords": [str(k) for k in keywords][:10] if isinstance(keywords, list) else [],
    }


def summarize_products(products: list[dict]) -> str | None:
    """
    Ask Ollama to compare a list of products and recommend the best opportunity.
    Returns None (never raises) if Ollama is unreachable, the list is empty, or
    the request fails.
    """
    if not products:
        return None
    return _chat([
        {"role": "system", "content": COMPARISON_SYSTEM_PROMPT},
        {"role": "user", "content": _build_products_list_prompt(products)},
    ])
