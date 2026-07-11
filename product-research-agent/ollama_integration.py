"""
Ollama integration — uses a local LLM to summarize scraped products for
dropshipping viability (target audience, selling points, pricing sanity check).
"""
import logging

import requests

from config import settings

logger = logging.getLogger("ollama_integration")

SYSTEM_PROMPT = (
    "You are a dropshipping product research assistant. Given raw product data, "
    "write a concise 2-3 sentence summary covering: what the product is, who it "
    "would appeal to, and whether the price/rating suggest it's worth sourcing. "
    "Be direct and avoid filler."
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
    payload = {
        "model": settings.ollama_model,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": _build_user_prompt(product)},
        ],
        "stream": False,
    }

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
        logger.error("Ollama summarization failed: %s", exc)
        return None
    except (KeyError, ValueError) as exc:
        logger.error("Ollama returned an unexpected response shape: %s", exc)
        return None
