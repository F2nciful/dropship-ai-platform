"""
Pricing AI Agent — profit-margin-based selling-price suggestions for saved
products.

The price math (margin targets, platform fee deductions, price ranges, risk
warnings) is fully deterministic and never depends on Ollama being reachable.
An AI-generated recommendation is layered on top as an advisory note — if
Ollama is unreachable or its response can't be parsed, a deterministic
fallback recommendation is used instead, so every response always includes
one (this mirrors the "AI unavailable is an expected runtime state, never
fail the request" approach used by ollama_integration.py).

Exposes an APIRouter (`router`) meant to be included by main.py, and a
`PricingHistory` ORM model on the shared declarative `Base` from database.py
— main.py's existing `init_db()` (Base.metadata.create_all, idempotent)
picks it up automatically as long as this module is imported first.
"""
import logging
from datetime import datetime

import requests
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import Column, DateTime, Float, ForeignKey, Integer, String
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from config import settings
from database import Base, PriceHistory, Product, get_db, utcnow

logger = logging.getLogger("pricing_agent")


# ─────────────────────────── Database ───────────────────────────

class PricingHistory(Base):
    """
    A record of every price calculation the Pricing AI Agent has produced for
    a product — both ones only *suggested* (analyze / suggest-price) and ones
    actually *applied* to the product (bulk-apply). `cost_price` is preserved
    here even after `applied_price` overwrites Product.price, so the cost
    basis behind a past decision is never lost.
    """

    __tablename__ = "pricing_history"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    # Nullable: ad-hoc /suggest-price calls (no product_id given) still get logged.
    product_id = Column(Integer, ForeignKey("products.id", ondelete="CASCADE"), nullable=True, index=True)
    cost_price = Column(Float, nullable=False)
    suggested_price = Column(Float, nullable=True)
    applied_price = Column(Float, nullable=True)
    profit_margin = Column(Float, nullable=True)
    strategy = Column(String, nullable=True)
    created_at = Column(DateTime, default=utcnow)


# ─────────────────────────── Pricing rules ───────────────────────────

# Selling-platform fee rates deducted from the sale price before profit is
# calculated. Approximate/representative rates (actual fees vary by category
# and seller tier) — good enough for a pricing *estimate*, not a guarantee.
PLATFORM_FEES: dict[str, float] = {
    "aliexpress": 0.05,    # marketplace commission
    "amazon": 0.15,        # referral fee
    "ebay": 0.1325,        # final value fee
    "default": 0.10,
}

STRATEGIES: dict[str, dict] = {
    "budget": {
        "label": "Budget",
        "margin": 50.0,
        "description": "Low margin, high volume — competitive pricing to win price-sensitive buyers.",
    },
    "mid": {
        "label": "Mid-Range",
        "margin": 100.0,
        "description": "Balanced markup — the standard dropshipping margin for steady profit.",
    },
    "premium": {
        "label": "Premium",
        "margin": 150.0,
        "description": "Higher markup for differentiated or branded listings with strong perceived value.",
    },
    "aggressive": {
        "label": "Aggressive",
        "margin": 200.0,
        "description": "Maximum markup — best for unique or hard-to-find items with low price sensitivity.",
    },
}

LOW_MARGIN_WARNING_THRESHOLD = 30.0
HIGH_MARGIN_WARNING_THRESHOLD = 400.0


def _fee_rate(platform: str | None) -> float:
    return PLATFORM_FEES.get((platform or "").lower(), PLATFORM_FEES["default"])


def _resolve_margin(strategy: str | None, profit_margin_percent: float | None) -> tuple[float, str]:
    """Return (target_margin_percent, strategy_label). An explicit margin overrides `strategy`."""
    if profit_margin_percent is not None:
        for key, info in STRATEGIES.items():
            if abs(info["margin"] - profit_margin_percent) < 1e-9:
                return profit_margin_percent, key
        return profit_margin_percent, "custom"
    key = (strategy or "mid").lower()
    if key not in STRATEGIES:
        key = "mid"
    return STRATEGIES[key]["margin"], key


def _price_for_margin(cost_price: float, margin_percent: float, fee_rate: float) -> float:
    """
    Selling price that nets `margin_percent` profit (relative to cost) after
    `fee_rate` platform fees are deducted:

        net_profit = price * (1 - fee_rate) - cost_price
        margin     = net_profit / cost_price
        =>  price  = cost_price * (1 + margin_percent / 100) / (1 - fee_rate)
    """
    fee_rate = min(fee_rate, 0.95)  # guard against a >=100% fee making this undefined
    price = cost_price * (1 + margin_percent / 100) / (1 - fee_rate)
    return round(price, 2)


def _margin_for_price(cost_price: float, price: float, fee_rate: float) -> float | None:
    if not cost_price or cost_price <= 0:
        return None
    net_profit = price * (1 - fee_rate) - cost_price
    return round(net_profit / cost_price * 100, 2)


# ─────────────────────────── Schemas ───────────────────────────

class PriceRange(BaseModel):
    min: float
    max: float


class CompetitorPrices(BaseModel):
    avg: float | None = None
    min: float | None = None
    max: float | None = None
    sample_size: int = 0


class PricingAnalysisResponse(BaseModel):
    success: bool
    product_id: int | None = None
    product_name: str
    cost_price: float
    suggested_price: float
    profit_margin_percent: float
    price_range: PriceRange
    competitor_prices: CompetitorPrices
    strategy: str
    ai_recommendation: str
    warnings: list[str] = Field(default_factory=list)


class PricingAnalyzeRequest(BaseModel):
    product_id: int = Field(..., description="A saved product's database id")
    strategy: str | None = Field(default="mid", description="One of: budget, mid, premium, aggressive")
    profit_margin_percent: float | None = Field(
        default=None, ge=0, description="Explicit target margin percent — overrides `strategy` if given"
    )
    platform: str | None = Field(
        default=None, description="Selling platform for fee calculation — defaults to the product's own platform"
    )
    competitor_prices: list[float] | None = Field(
        default=None, description="Optional known competitor prices — replaces auto-derived comparison"
    )


class PricingSuggestRequest(BaseModel):
    product_id: int | None = Field(default=None, description="A saved product's database id (optional)")
    product_name: str | None = Field(default=None, description="Required if product_id is omitted")
    cost_price: float | None = Field(
        default=None, ge=0, description="Required if product_id is omitted; overrides the saved price otherwise"
    )
    platform: str | None = Field(default=None, description="Selling platform for fee calculation")
    strategy: str | None = Field(default="mid", description="One of: budget, mid, premium, aggressive")
    profit_margin_percent: float | None = Field(default=None, ge=0)
    competitor_prices: list[float] | None = None


class BulkApplyItem(BaseModel):
    product_id: int
    applied_price: float | None = Field(default=None, ge=0, description="Explicit price to apply")
    strategy: str | None = Field(default=None, description="Used to compute a price if applied_price is omitted")
    profit_margin_percent: float | None = Field(default=None, ge=0)


class BulkApplyRequest(BaseModel):
    items: list[BulkApplyItem] = Field(..., min_length=1)
    default_strategy: str = Field(default="mid", description="Used for items that specify neither strategy nor margin")


class BulkApplyResultItem(BaseModel):
    product_id: int
    success: bool
    old_price: float | None = None
    applied_price: float | None = None
    profit_margin_percent: float | None = None
    message: str


class BulkApplyResponse(BaseModel):
    updated_count: int
    failed_count: int
    results: list[BulkApplyResultItem]


class PricingHistoryEntryOut(BaseModel):
    id: int
    product_id: int | None = None
    cost_price: float
    suggested_price: float | None = None
    applied_price: float | None = None
    profit_margin: float | None = None
    strategy: str | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class PricingHistoryResponse(BaseModel):
    product_id: int
    product_name: str
    entries: list[PricingHistoryEntryOut]


class StrategyInfo(BaseModel):
    key: str
    label: str
    profit_margin_percent: float
    description: str


class StrategiesResponse(BaseModel):
    strategies: list[StrategyInfo]
    platform_fees: dict[str, float]


# ─────────────────────────── Competitor analysis ───────────────────────────

def _find_competitor_prices(db: Session, product: Product) -> list[float]:
    """
    A lightweight competitor-price proxy: other *saved* products with a
    similar name, across any platform, excluding the product itself. This is
    not a live market scan (that's the job of /api/search-products) — it's a
    fast, offline comparison against whatever's already in the catalog.
    """
    words = [w for w in (product.name or "").split() if len(w) > 2][:2]
    if not words:
        return []
    query = db.query(Product).filter(Product.id != product.id)
    for word in words:
        query = query.filter(Product.name.ilike(f"%{word}%"))
    rows = query.limit(25).all()
    return [r.price for r in rows if r.price is not None]


def _competitor_stats(prices: list[float]) -> CompetitorPrices:
    valid = [p for p in prices if p is not None and p > 0]
    if not valid:
        return CompetitorPrices(avg=None, min=None, max=None, sample_size=0)
    return CompetitorPrices(
        avg=round(sum(valid) / len(valid), 2),
        min=round(min(valid), 2),
        max=round(max(valid), 2),
        sample_size=len(valid),
    )


# ─────────────────────────── Risk warnings ───────────────────────────

def _build_warnings(
    margin_percent: float, cost_price: float | None, suggested_price: float, competitor: CompetitorPrices
) -> list[str]:
    warnings: list[str] = []

    if cost_price is None or cost_price <= 0:
        warnings.append("Cost price is missing or zero — pricing suggestions may be unreliable.")
    if margin_percent < LOW_MARGIN_WARNING_THRESHOLD:
        warnings.append(
            f"Profit margin ({margin_percent:.1f}%) is below {LOW_MARGIN_WARNING_THRESHOLD:.0f}% — "
            "may not cover returns, ads, or overhead."
        )
    if margin_percent > HIGH_MARGIN_WARNING_THRESHOLD:
        warnings.append(
            f"Profit margin ({margin_percent:.1f}%) is above {HIGH_MARGIN_WARNING_THRESHOLD:.0f}% — "
            "price may be uncompetitive and hurt conversion."
        )

    if competitor.avg is not None:
        if competitor.max and suggested_price > competitor.max * 1.1:
            warnings.append(
                f"Suggested price (${suggested_price:.2f}) is well above the competitor max (${competitor.max:.2f})."
            )
        elif competitor.min and suggested_price < competitor.min * 0.7:
            warnings.append(
                f"Suggested price (${suggested_price:.2f}) is well below the competitor min "
                f"(${competitor.min:.2f}) — check you're not underpricing."
            )
    else:
        warnings.append("No competitor price data available — comparison is based on cost-plus calculation only.")

    return warnings


# ─────────────────────────── AI recommendation (Ollama) ───────────────────────────

PRICING_SYSTEM_PROMPT = (
    "You are a dropshipping pricing strategist. Given a product's cost, a calculated "
    "selling price, target profit margin, selling platform, and competitor price data, "
    "write a concise 2-4 sentence recommendation: whether the price is well-positioned, "
    "and one concrete adjustment if needed. Be direct, no filler, no markdown."
)


def _ask_ai_recommendation(context: dict) -> str | None:
    """Ask Ollama for a qualitative pricing recommendation. Returns None (never raises) on any failure."""
    lines = [
        f"Product: {context['product_name']}",
        f"Cost price: {context['currency']} {context['cost_price']:.2f}",
        f"Suggested selling price: {context['currency']} {context['suggested_price']:.2f}",
        f"Target profit margin: {context['profit_margin_percent']:.1f}%",
        f"Selling platform: {context['platform']} (fee ~{context['fee_rate'] * 100:.1f}%)",
        f"Strategy: {context['strategy']}",
    ]
    if context.get("competitor_avg") is not None:
        lines.append(
            f"Competitor prices — avg: {context['currency']} {context['competitor_avg']:.2f}, "
            f"min: {context['currency']} {context['competitor_min']:.2f}, "
            f"max: {context['currency']} {context['competitor_max']:.2f}"
        )
    else:
        lines.append("Competitor prices: no data available")
    if context.get("warnings"):
        lines.append("Warnings: " + "; ".join(context["warnings"]))

    payload = {
        "model": settings.ollama_model,
        "messages": [
            {"role": "system", "content": PRICING_SYSTEM_PROMPT},
            {"role": "user", "content": "\n".join(lines)},
        ],
        "stream": False,
    }
    try:
        response = requests.post(f"{settings.ollama_base_url}/api/chat", json=payload, timeout=settings.ollama_timeout)
        response.raise_for_status()
        data = response.json()
        return data.get("message", {}).get("content", "").strip() or None
    except requests.RequestException as exc:
        logger.warning("Ollama pricing recommendation request failed: %s", exc)
        return None
    except (KeyError, ValueError) as exc:
        logger.warning("Ollama returned an unexpected response shape: %s", exc)
        return None


def _fallback_recommendation(context: dict) -> str:
    """Deterministic recommendation text used when Ollama is unreachable, so this field is never empty."""
    parts = [
        f"At a cost of {context['currency']} {context['cost_price']:.2f}, a selling price of "
        f"{context['currency']} {context['suggested_price']:.2f} nets an estimated "
        f"{context['profit_margin_percent']:.1f}% margin on {context['platform']} after "
        f"~{context['fee_rate'] * 100:.1f}% platform fees."
    ]
    if context.get("competitor_avg") is not None:
        parts.append(f"Competitors average {context['currency']} {context['competitor_avg']:.2f}.")
    if context.get("warnings"):
        parts.append("Review: " + " ".join(context["warnings"]))
    return " ".join(parts)


# ─────────────────────────── Core computation ───────────────────────────

def _build_analysis(
    db: Session,
    *,
    product: Product | None,
    product_name: str,
    cost_price: float,
    platform: str,
    strategy: str | None,
    profit_margin_percent: float | None,
    competitor_prices_override: list[float] | None,
) -> PricingAnalysisResponse:
    margin_target, strategy_label = _resolve_margin(strategy, profit_margin_percent)
    fee_rate = _fee_rate(platform)

    suggested_price = _price_for_margin(cost_price, margin_target, fee_rate)
    achieved_margin = _margin_for_price(cost_price, suggested_price, fee_rate)
    if achieved_margin is None:
        achieved_margin = margin_target

    budget_price = _price_for_margin(cost_price, STRATEGIES["budget"]["margin"], fee_rate)
    aggressive_price = _price_for_margin(cost_price, STRATEGIES["aggressive"]["margin"], fee_rate)
    price_range = PriceRange(min=min(budget_price, aggressive_price), max=max(budget_price, aggressive_price))

    if competitor_prices_override:
        competitor = _competitor_stats(competitor_prices_override)
    elif product is not None:
        competitor = _competitor_stats(_find_competitor_prices(db, product))
    else:
        competitor = _competitor_stats([])

    warnings = _build_warnings(achieved_margin, cost_price, suggested_price, competitor)

    currency = (product.currency if product else None) or "USD"
    ctx = {
        "product_name": product_name,
        "cost_price": cost_price,
        "suggested_price": suggested_price,
        "profit_margin_percent": achieved_margin,
        "platform": platform,
        "fee_rate": fee_rate,
        "strategy": strategy_label,
        "currency": currency,
        "competitor_avg": competitor.avg,
        "competitor_min": competitor.min,
        "competitor_max": competitor.max,
        "warnings": warnings,
    }
    ai_text = _ask_ai_recommendation(ctx) or _fallback_recommendation(ctx)

    return PricingAnalysisResponse(
        success=True,
        product_id=product.id if product else None,
        product_name=product_name,
        cost_price=round(cost_price, 2),
        suggested_price=suggested_price,
        profit_margin_percent=achieved_margin,
        price_range=price_range,
        competitor_prices=competitor,
        strategy=strategy_label,
        ai_recommendation=ai_text,
        warnings=warnings,
    )


def _log_history(
    db: Session, *, product_id: int | None, cost_price: float, suggested_price: float | None,
    applied_price: float | None, profit_margin: float | None, strategy: str | None,
) -> None:
    db.add(PricingHistory(
        product_id=product_id,
        cost_price=cost_price,
        suggested_price=suggested_price,
        applied_price=applied_price,
        profit_margin=profit_margin,
        strategy=strategy,
    ))


# ─────────────────────────── Routes ───────────────────────────

router = APIRouter(prefix="/api/pricing", tags=["pricing"])


@router.post(
    "/analyze",
    response_model=PricingAnalysisResponse,
    summary="Analyze a saved product's pricing",
    responses={404: {"description": "Product not found"}, 422: {"description": "Product has no recorded cost price"}},
)
def analyze_pricing(payload: PricingAnalyzeRequest, db: Session = Depends(get_db)):
    """
    Full pricing analysis for a saved product: suggested selling price, profit
    margin, a min/max price range across all strategies, a competitor price
    comparison, risk warnings, and an AI recommendation.
    """
    product = db.get(Product, payload.product_id)
    if not product:
        raise HTTPException(status_code=404, detail=f"Product {payload.product_id} not found")
    if product.price is None:
        raise HTTPException(status_code=422, detail="Product has no recorded cost price to analyze")

    platform = payload.platform or product.platform
    result = _build_analysis(
        db,
        product=product,
        product_name=product.name,
        cost_price=product.price,
        platform=platform,
        strategy=payload.strategy,
        profit_margin_percent=payload.profit_margin_percent,
        competitor_prices_override=payload.competitor_prices,
    )

    try:
        _log_history(
            db, product_id=product.id, cost_price=product.price, suggested_price=result.suggested_price,
            applied_price=None, profit_margin=result.profit_margin_percent, strategy=result.strategy,
        )
        db.commit()
    except SQLAlchemyError as exc:
        db.rollback()
        logger.exception("Failed to record pricing history for product %s", product.id)
        raise HTTPException(status_code=500, detail=f"Database error while recording pricing history: {exc}") from exc

    return result


@router.post(
    "/suggest-price",
    response_model=PricingAnalysisResponse,
    summary="Suggest a selling price",
    responses={404: {"description": "Product not found"}, 422: {"description": "No cost price available"}},
)
def suggest_price(payload: PricingSuggestRequest, db: Session = Depends(get_db)):
    """
    Suggest a selling price either for a saved product (`product_id`) or
    ad-hoc for a product that hasn't been saved yet (`product_name` +
    `cost_price`). Useful for pricing a product before deciding to add it.
    """
    product: Product | None = None
    if payload.product_id is not None:
        product = db.get(Product, payload.product_id)
        if not product:
            raise HTTPException(status_code=404, detail=f"Product {payload.product_id} not found")
        cost_price = payload.cost_price if payload.cost_price is not None else product.price
        product_name = payload.product_name or product.name
        platform = payload.platform or product.platform
    else:
        if payload.cost_price is None:
            raise HTTPException(status_code=422, detail="cost_price is required when product_id is not given")
        cost_price = payload.cost_price
        product_name = payload.product_name or "Unnamed product"
        platform = payload.platform or "default"

    if cost_price is None:
        raise HTTPException(
            status_code=422,
            detail="No cost price available — provide cost_price or use a product with a saved price",
        )

    result = _build_analysis(
        db,
        product=product,
        product_name=product_name,
        cost_price=cost_price,
        platform=platform,
        strategy=payload.strategy,
        profit_margin_percent=payload.profit_margin_percent,
        competitor_prices_override=payload.competitor_prices,
    )

    try:
        _log_history(
            db, product_id=product.id if product else None, cost_price=cost_price,
            suggested_price=result.suggested_price, applied_price=None,
            profit_margin=result.profit_margin_percent, strategy=result.strategy,
        )
        db.commit()
    except SQLAlchemyError as exc:
        db.rollback()
        logger.exception("Failed to record pricing history")
        raise HTTPException(status_code=500, detail=f"Database error while recording pricing history: {exc}") from exc

    return result


@router.post(
    "/bulk-apply",
    response_model=BulkApplyResponse,
    summary="Apply prices to multiple products",
)
def bulk_apply_prices(payload: BulkApplyRequest, db: Session = Depends(get_db)):
    """
    Apply a price to each listed product — either an explicit `applied_price`,
    or one computed from `strategy`/`profit_margin_percent` (falling back to
    `default_strategy`) against the product's current price as cost basis.
    A failure on one item never blocks the rest of the batch.

    Note: since the product schema has a single `price` field, applying a
    price here overwrites Product.price with the new selling price — the
    `cost_price` this was calculated from is preserved permanently in
    pricing_history, so the original cost basis is never lost even though
    Product.price moves forward.
    """
    results: list[BulkApplyResultItem] = []
    updated_count = 0
    failed_count = 0

    for item in payload.items:
        product = db.get(Product, item.product_id)
        if not product:
            failed_count += 1
            results.append(BulkApplyResultItem(product_id=item.product_id, success=False, message="Product not found"))
            continue

        cost_price = product.price
        fee_rate = _fee_rate(product.platform)

        if item.applied_price is not None:
            new_price = round(item.applied_price, 2)
            margin = _margin_for_price(cost_price, new_price, fee_rate) if cost_price else None
            strategy_label = "custom"
        else:
            if cost_price is None:
                failed_count += 1
                results.append(BulkApplyResultItem(
                    product_id=item.product_id, success=False,
                    message="No cost price on record and no applied_price given",
                ))
                continue
            strategy = item.strategy or payload.default_strategy
            margin_target, strategy_label = _resolve_margin(strategy, item.profit_margin_percent)
            new_price = _price_for_margin(cost_price, margin_target, fee_rate)
            margin = _margin_for_price(cost_price, new_price, fee_rate)

        old_price = product.price
        product.price = new_price
        db.add(PriceHistory(product_id=product.id, price=new_price, currency=product.currency))
        _log_history(
            db, product_id=product.id, cost_price=cost_price if cost_price is not None else new_price,
            suggested_price=new_price, applied_price=new_price, profit_margin=margin, strategy=strategy_label,
        )

        updated_count += 1
        results.append(BulkApplyResultItem(
            product_id=product.id, success=True, old_price=old_price, applied_price=new_price,
            profit_margin_percent=margin, message="Applied",
        ))

    try:
        db.commit()
    except SQLAlchemyError as exc:
        db.rollback()
        logger.exception("Failed to commit bulk price apply")
        raise HTTPException(status_code=500, detail=f"Database error while applying prices: {exc}") from exc

    return BulkApplyResponse(updated_count=updated_count, failed_count=failed_count, results=results)


@router.get(
    "/history/{product_id}",
    response_model=PricingHistoryResponse,
    summary="Get pricing history for a product",
    responses={404: {"description": "Product not found"}},
)
def get_pricing_history(product_id: int, db: Session = Depends(get_db)):
    """Every pricing calculation (suggested and/or applied) ever recorded for this product, oldest first."""
    product = db.get(Product, product_id)
    if not product:
        raise HTTPException(status_code=404, detail=f"Product {product_id} not found")

    entries = (
        db.query(PricingHistory)
        .filter(PricingHistory.product_id == product_id)
        .order_by(PricingHistory.created_at.asc())
        .all()
    )

    return PricingHistoryResponse(
        product_id=product.id,
        product_name=product.name,
        entries=[PricingHistoryEntryOut.model_validate(e) for e in entries],
    )


@router.get(
    "/strategies",
    response_model=StrategiesResponse,
    summary="List available pricing strategies",
)
def get_strategies():
    """The four built-in pricing strategies (with their target margins) and the platform fee rates used to compute them."""
    return StrategiesResponse(
        strategies=[
            StrategyInfo(key=key, label=info["label"], profit_margin_percent=info["margin"], description=info["description"])
            for key, info in STRATEGIES.items()
        ],
        platform_fees=dict(PLATFORM_FEES),
    )
