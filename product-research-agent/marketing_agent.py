"""
Marketing Agent — SEO description/keywords/marketing copy generation.

Wraps ollama_integration.analyze_product(), which already returns exactly the shape a
product listing needs (description, target_audience, keywords). This module is the single
place both manager_agent.py's automatic analyze-pipeline marketing sub-step and this
module's own manual "regenerate copy" endpoint go through, so there is one marketing-copy
code path, not two.
"""
import json

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

import ollama_integration
from database import get_db, utcnow

router = APIRouter(prefix="/api/marketing", tags=["marketing"])


def generate_marketing_copy(product_input: dict) -> dict | None:
    """product_input: {name, price, currency, description, rating, reviews_count, platform}.
    Returns {description, target_audience, keywords, generated_at} or None if Ollama is
    unreachable/unparseable — callers decide the fallback behavior."""
    ai_result = ollama_integration.analyze_product(product_input)
    if not ai_result:
        return None
    return {
        "description": ai_result.get("description"),
        "target_audience": ai_result.get("target_audience"),
        "keywords": ai_result.get("keywords") or [],
        "generated_at": utcnow().isoformat(),
    }


class RegenerateMarketingResponse(BaseModel):
    success: bool
    marketing: dict | None = None
    message: str | None = None


@router.post(
    "/product/{product_id}/regenerate",
    response_model=RegenerateMarketingResponse,
    responses={404: {"description": "Product not found"}},
    summary="Regenerate SEO/marketing copy for an already-saved product",
)
def regenerate_marketing(product_id: int, db: Session = Depends(get_db)):
    """Manual "refresh copy" action for a product that was already analyzed — unlike the
    analyze pipeline's automatic first pass, this re-runs marketing generation on demand
    and persists it the same way manager_agent.py's own pipeline does, for consistency."""
    import manager_agent  # local import — avoids circular import (manager_agent imports us too)

    product = manager_agent._get_product_or_404(db, product_id)
    marketing_input = {
        "name": product.name,
        "price": product.supplier_price,
        "currency": product.currency,
        "description": product.description,
        "rating": product.rating,
        "reviews_count": product.reviews,
        "platform": product.platform,
    }
    marketing = generate_marketing_copy(marketing_input)
    if not marketing:
        return RegenerateMarketingResponse(
            success=False, message="AI marketing unavailable — check Ollama is running."
        )

    product.marketing_json = json.dumps(marketing)
    manager_agent._log_history(db, product.id, "marketed", {
        "target_audience": marketing.get("target_audience"),
        "description_excerpt": (marketing.get("description") or "")[:200],
        "keywords": marketing.get("keywords"),
    })
    db.commit()
    return RegenerateMarketingResponse(success=True, marketing=marketing)
