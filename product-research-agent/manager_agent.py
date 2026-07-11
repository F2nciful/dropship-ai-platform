"""
Manager Agent — the single unified controller for product search, pricing,
inventory, and marketing. Consolidates what used to be three separate
modules (main.py's saved-product CRUD, pricing_agent.py, inventory_agent.py)
into one `products` table plus three supporting tables, and one route
surface under `/api/manager/*`.

Every decision that involves Ollama (pricing recommendation, demand
forecast, marketing copy, the general AI-recommendation endpoint) is
deterministic-first: the underlying math/heuristic always runs and always
produces a usable result, and Ollama is layered on top as an upgrade. If
Ollama is unreachable or its response can't be parsed, a deterministic
fallback is used instead — this module never fails a request just because
the AI assist is unavailable, mirroring the pattern already established by
ollama_integration.py, pricing_agent.py, and inventory_agent.py.

Exposes an APIRouter (`router`) meant to be included by main.py, and four
ORM models (`Product`, `ProductHistory`, `PricingStrategy`,
`InventoryForecast`) on the shared declarative `Base` from database.py —
main.py's existing `init_db()` (Base.metadata.create_all, idempotent) picks
them up automatically as long as this module is imported first.
"""
import json
import logging
from datetime import datetime, timedelta
from types import SimpleNamespace

import requests
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import Column, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

import dynamic_scraper
import ollama_integration
import scraper_aliexpress
import scraper_amazon
import scraper_ebay
from config import settings
from database import Base, PlatformDB, get_db, utcnow

logger = logging.getLogger("manager_agent")


# ─────────────────────────── Database ───────────────────────────

class Product(Base):
    """
    The single unified product record — replaces the old `products` table
    (search/catalog fields) and `inventory` table (stock fields) at once.
    Every saved product is implicitly inventory-tracked from creation
    (`quantity`/`reorder_level` always present, default 0/10) rather than
    inventory being an opt-in add-on as it was before.
    """

    __tablename__ = "products"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    name = Column(String, nullable=False, index=True)

    # Pricing
    supplier_price = Column(Float, nullable=True)   # cost basis (what we pay the source platform)
    selling_price = Column(Float, nullable=True)     # current listed price (AI-suggested or manually set)
    currency = Column(String, default="USD")

    # Inventory
    quantity = Column(Integer, nullable=False, default=0)
    reorder_level = Column(Integer, nullable=False, default=10)

    # Catalog / marketing
    description = Column(Text, nullable=True)
    category = Column(String, nullable=True, index=True)
    platform = Column(String, nullable=False, index=True)
    rating = Column(Float, nullable=True)
    reviews = Column(Integer, nullable=True)
    status = Column(String, nullable=False, default="active")  # lifecycle: active|draft|archived
    image_url = Column(String, nullable=True)
    url = Column(String, nullable=True)
    sku = Column(String, nullable=True, index=True)
    seller_name = Column(String, nullable=True)
    orders_count = Column(Integer, nullable=True)
    shipping_price = Column(Float, nullable=True)
    marketing_json = Column(Text, nullable=True)  # JSON: {description, target_audience, keywords, generated_at}
    raw_data = Column(Text, nullable=True)          # JSON-encoded original scrape payload

    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)

    def raw_data_dict(self) -> dict:
        if not self.raw_data:
            return {}
        try:
            return json.loads(self.raw_data)
        except (TypeError, ValueError):
            return {}

    def marketing_dict(self) -> dict | None:
        if not self.marketing_json:
            return None
        try:
            return json.loads(self.marketing_json)
        except (TypeError, ValueError):
            return None


class ProductHistory(Base):
    """
    A unified activity log — replaces the old price_history and stock_history
    tables. `action` is one of searched/priced/stocked/marketed; `details` is
    JSON text whose shape depends on the action (documented on each route),
    which is enough to reconstruct both the price-over-time and
    stock-change-over-time views the old dedicated tables provided.
    """

    __tablename__ = "product_history"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    product_id = Column(Integer, ForeignKey("products.id", ondelete="CASCADE"), nullable=False, index=True)
    action = Column(String, nullable=False, index=True)  # searched|priced|stocked|marketed
    details = Column(Text, nullable=True)
    date = Column(DateTime, default=utcnow, index=True)


class PricingStrategy(Base):
    """One row per pricing calculation applied to a product (rename of the old pricing_history table)."""

    __tablename__ = "pricing_strategy"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    product_id = Column(Integer, ForeignKey("products.id", ondelete="CASCADE"), nullable=False, index=True)
    cost = Column(Float, nullable=False)
    margin_percent = Column(Float, nullable=True)
    suggested_price = Column(Float, nullable=True)
    applied_price = Column(Float, nullable=True)
    strategy = Column(String, nullable=True)
    date = Column(DateTime, default=utcnow)


class InventoryForecast(Base):
    """One row per AI (or fallback) demand forecast produced for a product (rename of the old table)."""

    __tablename__ = "inventory_forecast"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    product_id = Column(Integer, ForeignKey("products.id", ondelete="CASCADE"), nullable=False, index=True)
    forecasted_demand = Column(Integer, nullable=True)
    confidence = Column(Float, nullable=True)
    date = Column(DateTime, default=utcnow)


# ─────────────────────────── Pricing rules (ported from pricing_agent.py) ───────────────────────────

PLATFORM_FEES: dict[str, float] = {
    "aliexpress": 0.05,
    "amazon": 0.15,
    "ebay": 0.1325,
    "default": 0.10,
}

STRATEGIES: dict[str, dict] = {
    "budget": {"label": "Budget", "margin": 50.0, "description": "Low margin, high volume — competitive pricing to win price-sensitive buyers."},
    "mid": {"label": "Mid-Range", "margin": 100.0, "description": "Balanced markup — the standard dropshipping margin for steady profit."},
    "premium": {"label": "Premium", "margin": 150.0, "description": "Higher markup for differentiated or branded listings with strong perceived value."},
    "aggressive": {"label": "Aggressive", "margin": 200.0, "description": "Maximum markup — best for unique or hard-to-find items with low price sensitivity."},
}

LOW_MARGIN_WARNING_THRESHOLD = 30.0
HIGH_MARGIN_WARNING_THRESHOLD = 400.0

# ─────────────────────────── Inventory rules (ported from inventory_agent.py) ───────────────────────────

OVERSTOCK_MULTIPLIER = 3.0
SLOW_MOVING_DAYS = 30
TURNOVER_WINDOW_DAYS = 90


def _fee_rate(platform: str | None) -> float:
    return PLATFORM_FEES.get((platform or "").lower(), PLATFORM_FEES["default"])


def _resolve_margin(strategy: str | None, profit_margin_percent: float | None) -> tuple[float, str]:
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
    fee_rate = min(fee_rate, 0.95)
    price = cost_price * (1 + margin_percent / 100) / (1 - fee_rate)
    return round(price, 2)


def _margin_for_price(cost_price: float | None, price: float | None, fee_rate: float) -> float | None:
    if not cost_price or cost_price <= 0 or price is None:
        return None
    net_profit = price * (1 - fee_rate) - cost_price
    return round(net_profit / cost_price * 100, 2)


def _compute_stock_status(quantity: int, reorder_level: int) -> str:
    if quantity <= 0:
        return "out-of-stock"
    if reorder_level > 0 and quantity < reorder_level:
        return "low-stock"
    if reorder_level > 0 and quantity > reorder_level * OVERSTOCK_MULTIPLIER:
        return "overstocked"
    return "in-stock"


# ─────────────────────────── History helpers ───────────────────────────

def _log_history(db: Session, product_id: int, action: str, details: dict) -> None:
    db.add(ProductHistory(product_id=product_id, action=action, details=json.dumps(details, default=str)))


def _parse_details(row: ProductHistory) -> dict:
    if not row.details:
        return {}
    try:
        return json.loads(row.details)
    except (TypeError, ValueError):
        return {}


def _get_stocked_events(
    db: Session, product_id: int, *, since: datetime | None = None, only_outbound: bool = False, limit: int | None = None
) -> list[SimpleNamespace]:
    """Reconstruct signed stock-change events from product_history — the equivalent of a
    direct StockHistory query, now backed by the unified `action="stocked"` log."""
    query = db.query(ProductHistory).filter(ProductHistory.product_id == product_id, ProductHistory.action == "stocked")
    if since is not None:
        query = query.filter(ProductHistory.date >= since)
    query = query.order_by(ProductHistory.date.desc())
    if limit:
        query = query.limit(limit)

    events = []
    for row in query.all():
        details = _parse_details(row)
        qty_change = details.get("quantity_change", 0)
        if only_outbound and qty_change >= 0:
            continue
        events.append(SimpleNamespace(date=row.date, quantity_change=qty_change, reason=details.get("reason")))
    return events


def _turnover_rate(db: Session, product_id: int, quantity: int, days: int = TURNOVER_WINDOW_DAYS) -> float | None:
    if quantity <= 0:
        return None
    cutoff = utcnow() - timedelta(days=days)
    events = _get_stocked_events(db, product_id, since=cutoff, only_outbound=True)
    units_sold = sum(-e.quantity_change for e in events)
    return round(units_sold / quantity, 2)


# ─────────────────────────── Competitor analysis (ported from pricing_agent.py) ───────────────────────────

def _find_competitor_prices(db: Session, product: Product) -> list[float]:
    """Offline competitor-price proxy: other saved products' *selling* prices with a similar name."""
    words = [w for w in (product.name or "").split() if len(w) > 2][:2]
    if not words:
        return []
    query = db.query(Product).filter(Product.id != product.id)
    for word in words:
        query = query.filter(Product.name.ilike(f"%{word}%"))
    rows = query.limit(25).all()
    return [r.selling_price for r in rows if r.selling_price is not None]


class CompetitorPrices(BaseModel):
    avg: float | None = None
    min: float | None = None
    max: float | None = None
    sample_size: int = 0


def _competitor_stats(prices: list[float]) -> CompetitorPrices:
    valid = [p for p in prices if p is not None and p > 0]
    if not valid:
        return CompetitorPrices()
    return CompetitorPrices(
        avg=round(sum(valid) / len(valid), 2), min=round(min(valid), 2),
        max=round(max(valid), 2), sample_size=len(valid),
    )


# ─────────────────────────── Warnings ───────────────────────────

def _build_full_pricing_warnings(margin_percent: float, cost_price: float | None, suggested_price: float, competitor: CompetitorPrices) -> list[str]:
    """The heavier, competitor-aware warning set — used only at analyze-product time."""
    warnings: list[str] = []
    if cost_price is None or cost_price <= 0:
        warnings.append("Cost price is missing or zero — pricing suggestions may be unreliable.")
    if margin_percent < LOW_MARGIN_WARNING_THRESHOLD:
        warnings.append(f"Profit margin ({margin_percent:.1f}%) is below {LOW_MARGIN_WARNING_THRESHOLD:.0f}% — may not cover returns, ads, or overhead.")
    if margin_percent > HIGH_MARGIN_WARNING_THRESHOLD:
        warnings.append(f"Profit margin ({margin_percent:.1f}%) is above {HIGH_MARGIN_WARNING_THRESHOLD:.0f}% — price may be uncompetitive and hurt conversion.")
    if competitor.avg is not None:
        if competitor.max and suggested_price > competitor.max * 1.1:
            warnings.append(f"Suggested price (${suggested_price:.2f}) is well above the competitor max (${competitor.max:.2f}).")
        elif competitor.min and suggested_price < competitor.min * 0.7:
            warnings.append(f"Suggested price (${suggested_price:.2f}) is well below the competitor min (${competitor.min:.2f}) — check you're not underpricing.")
    else:
        warnings.append("No competitor price data available — comparison is based on cost-plus calculation only.")
    return warnings


def _build_pricing_warnings(margin_percent: float | None, supplier_price: float | None) -> list[str]:
    """A cheap warning set used for read-time detail/list responses (no competitor rescan)."""
    warnings: list[str] = []
    if supplier_price is None or supplier_price <= 0:
        warnings.append("Supplier price is missing or zero — pricing may be unreliable.")
    if margin_percent is not None:
        if margin_percent < LOW_MARGIN_WARNING_THRESHOLD:
            warnings.append(f"Profit margin ({margin_percent:.1f}%) is below {LOW_MARGIN_WARNING_THRESHOLD:.0f}% — may not cover returns, ads, or overhead.")
        if margin_percent > HIGH_MARGIN_WARNING_THRESHOLD:
            warnings.append(f"Profit margin ({margin_percent:.1f}%) is above {HIGH_MARGIN_WARNING_THRESHOLD:.0f}% — price may be uncompetitive.")
    return warnings


def _build_inventory_warnings(db: Session, product: Product, stock_status: str) -> list[str]:
    warnings: list[str] = []
    if stock_status == "out-of-stock":
        warnings.append(f"{product.name} is out of stock — restock to avoid lost sales.")
    elif stock_status == "low-stock":
        warnings.append(f"Stock ({product.quantity}) is below the reorder level ({product.reorder_level}).")
    elif stock_status == "overstocked":
        warnings.append(f"Stock ({product.quantity}) is well above the reorder level ({product.reorder_level}) — consider a promotion to move excess inventory.")

    if product.quantity > 0:
        cutoff = utcnow() - timedelta(days=SLOW_MOVING_DAYS)
        recent = _get_stocked_events(db, product.id, since=cutoff, only_outbound=True, limit=1)
        if not recent:
            warnings.append(f"No outbound movement in the last {SLOW_MOVING_DAYS} days — possibly slow-moving.")
    return warnings


# ─────────────────────────── AI: pricing recommendation ───────────────────────────

PRICING_SYSTEM_PROMPT = (
    "You are a dropshipping pricing strategist. Given a product's cost, a calculated "
    "selling price, target profit margin, selling platform, and competitor price data, "
    "write a concise 2-4 sentence recommendation: whether the price is well-positioned, "
    "and one concrete adjustment if needed. Be direct, no filler, no markdown."
)


def _ask_ai_pricing_recommendation(context: dict) -> str | None:
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
            f"min: {context['currency']} {context['competitor_min']:.2f}, max: {context['currency']} {context['competitor_max']:.2f}"
        )
    else:
        lines.append("Competitor prices: no data available")
    if context.get("warnings"):
        lines.append("Warnings: " + "; ".join(context["warnings"]))

    payload = {
        "model": settings.ollama_model,
        "messages": [{"role": "system", "content": PRICING_SYSTEM_PROMPT}, {"role": "user", "content": "\n".join(lines)}],
        "stream": False,
    }
    try:
        response = requests.post(f"{settings.ollama_base_url}/api/chat", json=payload, timeout=settings.ollama_timeout)
        response.raise_for_status()
        return response.json().get("message", {}).get("content", "").strip() or None
    except requests.RequestException as exc:
        logger.warning("Ollama pricing recommendation request failed: %s", exc)
        return None
    except (KeyError, ValueError) as exc:
        logger.warning("Ollama returned an unexpected response shape: %s", exc)
        return None


def _fallback_pricing_recommendation(context: dict) -> str:
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


# ─────────────────────────── AI: demand forecast ───────────────────────────

FORECAST_SYSTEM_PROMPT = (
    "You are an inventory demand forecasting analyst for a dropshipping business. Given a "
    "product's category, current stock, reorder level, and recent sales history, respond with "
    "ONLY a JSON object (no markdown fences, no commentary before or after) with exactly these keys:\n"
    '  "forecasted_demand": integer — predicted units that will sell over the given forecast period\n'
    '  "confidence_level": number between 0 and 1 — how confident you are in this estimate\n'
    '  "suggested_reorder_quantity": integer — units to reorder now to avoid a stockout (0 if none needed)\n'
    '  "recommendation": a concise 2-3 sentence explanation and recommendation\n'
    "If historical sales data is sparse or absent, make a reasonable estimate based on the product "
    "category and note the lower confidence in the recommendation."
)


def _extract_json(text: str) -> dict | None:
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


def _build_forecast_prompt(product: Product, category: str | None, recent_sales: list[SimpleNamespace], period_days: int) -> str:
    lines = [
        f"Product: {product.name}",
        f"Category: {category or 'Unknown'}",
        f"Current stock: {product.quantity}",
        f"Reorder level: {product.reorder_level}",
        f"Forecast period: {period_days} days",
    ]
    if recent_sales:
        lines.append("Recent sales history (most recent first):")
        for sale in recent_sales[:10]:
            lines.append(f"  {sale.date.date().isoformat()}: {-sale.quantity_change} units sold")
    else:
        lines.append("No recorded sales history available.")
    return "\n".join(lines)


def _ask_ai_forecast(product: Product, category: str | None, recent_sales: list[SimpleNamespace], period_days: int) -> tuple[int, float, int, str] | None:
    payload = {
        "model": settings.ollama_model,
        "messages": [
            {"role": "system", "content": FORECAST_SYSTEM_PROMPT},
            {"role": "user", "content": _build_forecast_prompt(product, category, recent_sales, period_days)},
        ],
        "stream": False,
        "format": "json",
    }
    try:
        response = requests.post(f"{settings.ollama_base_url}/api/chat", json=payload, timeout=settings.ollama_timeout)
        response.raise_for_status()
        content = response.json().get("message", {}).get("content", "").strip()
    except requests.RequestException as exc:
        logger.warning("Ollama inventory forecast request failed: %s", exc)
        return None
    except (KeyError, ValueError) as exc:
        logger.warning("Ollama returned an unexpected response shape: %s", exc)
        return None

    if not content:
        return None
    parsed = _extract_json(content)
    if not parsed:
        logger.warning("Could not parse AI forecast JSON: %r", content[:300])
        return None
    try:
        forecasted_demand = max(int(parsed.get("forecasted_demand", 0)), 0)
        confidence = min(max(float(parsed.get("confidence_level", 0.5)), 0.0), 1.0)
        suggested_reorder = max(int(parsed.get("suggested_reorder_quantity", 0)), 0)
    except (TypeError, ValueError):
        return None
    recommendation = parsed.get("recommendation") or "No additional recommendation available."
    return forecasted_demand, confidence, suggested_reorder, recommendation


def _fallback_forecast(product: Product, recent_sales: list[SimpleNamespace], period_days: int) -> tuple[int, float, int, str]:
    total_sold = sum(-sale.quantity_change for sale in recent_sales)
    if recent_sales:
        span_days = max((recent_sales[0].date - recent_sales[-1].date).days, 1)
        daily_rate = total_sold / span_days
    else:
        daily_rate = 0.0

    forecasted_demand = round(daily_rate * period_days)
    confidence = 0.35 if recent_sales else 0.1
    suggested_reorder = max(forecasted_demand - product.quantity + product.reorder_level, 0)

    recommendation = (
        f"Based on recent sales velocity (~{daily_rate:.1f} units/day), expect roughly {forecasted_demand} "
        f"units sold over the next {period_days} days."
    )
    if suggested_reorder > 0:
        recommendation += f" Consider reordering {suggested_reorder} units to stay above the reorder level."
    else:
        recommendation += " Current stock looks sufficient for this period."
    if not recent_sales:
        recommendation += " (No sales history yet — this is a rough estimate; AI forecasting was also unavailable.)"
    return forecasted_demand, confidence, suggested_reorder, recommendation


# ─────────────────────────── AI: general recommendation (read-only) ───────────────────────────

MANAGER_RECOMMENDATION_SYSTEM_PROMPT = (
    "You are the AI assistant for a dropshipping product manager. Given a product's full "
    "current profile (pricing, inventory, marketing, recent activity) and a requested focus "
    "area, respond with ONLY a JSON object (no markdown fences, no commentary) with exactly "
    "these keys:\n"
    '  "recommendation": a concise 2-4 sentence recommendation centered on the requested focus\n'
    '  "suggested_actions": an array of 1-4 short actionable strings\n'
    "Be direct and specific to the numbers given, not generic advice."
)


def _ask_manager_recommendation(context_text: str) -> tuple[str, list[str]] | None:
    payload = {
        "model": settings.ollama_model,
        "messages": [
            {"role": "system", "content": MANAGER_RECOMMENDATION_SYSTEM_PROMPT},
            {"role": "user", "content": context_text},
        ],
        "stream": False,
        "format": "json",
    }
    try:
        response = requests.post(f"{settings.ollama_base_url}/api/chat", json=payload, timeout=settings.ollama_timeout)
        response.raise_for_status()
        content = response.json().get("message", {}).get("content", "").strip()
    except requests.RequestException as exc:
        logger.warning("Ollama manager-recommendation request failed: %s", exc)
        return None
    except (KeyError, ValueError) as exc:
        logger.warning("Ollama returned an unexpected response shape: %s", exc)
        return None

    if not content:
        return None
    parsed = _extract_json(content)
    if not parsed or not parsed.get("recommendation"):
        return None
    actions = parsed.get("suggested_actions")
    return parsed["recommendation"], [str(a) for a in actions][:6] if isinstance(actions, list) else []


def _fallback_manager_recommendation(product: Product, stock_status: str, margin_percent: float | None, focus: str) -> tuple[str, list[str]]:
    parts = [f"AI assistant is currently unreachable — here's a quick heuristic summary for {product.name}."]
    actions: list[str] = []

    if focus in ("pricing", "general"):
        if margin_percent is not None:
            parts.append(f"Current margin is {margin_percent:.1f}%.")
            if margin_percent < LOW_MARGIN_WARNING_THRESHOLD:
                actions.append("Raise the selling price — margin is thin")
        else:
            parts.append("No margin can be computed yet — set a selling price.")
            actions.append("Set a selling price")

    if focus in ("inventory", "general"):
        parts.append(f"Stock is currently {stock_status} ({product.quantity} units, reorder level {product.reorder_level}).")
        if stock_status in ("low-stock", "out-of-stock"):
            actions.append("Reorder stock soon")
        elif stock_status == "overstocked":
            actions.append("Consider a promotion to move excess stock")

    if focus in ("marketing", "general") and not product.marketing_json:
        parts.append("No AI-generated marketing copy has been created for this product yet.")
        actions.append("Generate marketing copy once AI is available")

    return " ".join(parts), actions


# ─────────────────────────── Scraper dispatch (for refresh_price bulk op) ───────────────────────────

_BUILTIN_SCRAPERS = {
    "aliexpress": scraper_aliexpress.search,
    "amazon": scraper_amazon.search,
    "ebay": scraper_ebay.search,
}


def _run_scraper(platform_row: PlatformDB, query: str, max_results: int) -> list[dict]:
    if platform_row.scraper_type == "built_in" and platform_row.name in _BUILTIN_SCRAPERS:
        return _BUILTIN_SCRAPERS[platform_row.name](query, max_results)
    return dynamic_scraper.search(query, max_results, platform_row.name, platform_row.url, platform_row.config_dict())


# ─────────────────────────── Schemas ───────────────────────────

class AnalyzeProductRequest(BaseModel):
    name: str = Field(..., min_length=1)
    price: float | None = Field(default=None, ge=0, description="Supplier/cost price — required")
    currency: str = "USD"
    image_url: str | None = None
    url: str | None = None
    description: str | None = None
    rating: float | None = None
    reviews_count: int | None = None
    orders_count: int | None = None
    shipping_price: float | None = None
    seller_name: str | None = None
    sku: str | None = None
    platform: str
    category: str | None = None
    raw_data: dict = Field(default_factory=dict)
    search_query: str | None = Field(default=None, description="The query that surfaced this product, for provenance")
    initial_quantity: int = Field(default=0, ge=0)
    reorder_level: int = Field(default=10, ge=0)
    strategy: str | None = Field(default="mid", description="One of: budget, mid, premium, aggressive")
    profit_margin_percent: float | None = Field(default=None, ge=0)
    sync_to_shopify: bool = Field(default=False, description="If true, also push the analyzed product to Shopify")


class PricingSummary(BaseModel):
    cost: float | None
    suggested_price: float | None
    applied_price: float | None
    margin_percent: float | None
    strategy: str | None
    ai_recommendation: str | None = None


class ForecastSummary(BaseModel):
    forecasted_demand: int | None
    confidence: float | None
    date: datetime | None


class MarketingSummary(BaseModel):
    description: str | None = None
    target_audience: str | None = None
    keywords: list[str] = Field(default_factory=list)
    generated_at: str | None = None


class HistoryEntryOut(BaseModel):
    id: int
    action: str
    details: dict
    date: datetime


class ManagerProductDetail(BaseModel):
    id: int
    name: str
    description: str | None
    category: str | None
    platform: str
    status: str
    stock_status: str
    image_url: str | None
    url: str | None
    sku: str | None
    seller_name: str | None
    rating: float | None
    reviews: int | None
    orders_count: int | None
    shipping_price: float | None
    currency: str
    supplier_price: float | None
    selling_price: float | None
    quantity: int
    reorder_level: int
    total_inventory_value: float
    turnover_rate: float | None
    pricing: PricingSummary
    forecast: ForecastSummary | None
    marketing: MarketingSummary | None
    warnings: list[str] = Field(default_factory=list)
    history: list[HistoryEntryOut] = Field(default_factory=list)
    raw_data: dict = Field(default_factory=dict)
    created_at: datetime
    updated_at: datetime | None
    shopify_product_id: str | None = Field(default=None, description="Set once this product has been synced to Shopify")
    shopify_sync_status: str | None = Field(default=None, description="pending|draft|active|failed, if ever synced")


class ManagerProductSummary(BaseModel):
    id: int
    name: str
    platform: str
    category: str | None
    image_url: str | None
    supplier_price: float | None
    selling_price: float | None
    quantity: int
    reorder_level: int
    stock_status: str
    rating: float | None
    status: str
    updated_at: datetime | None


class ManagerProductListResponse(BaseModel):
    total: int
    products: list[ManagerProductSummary]


class ManagerProductUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    category: str | None = None
    status: str | None = Field(default=None, description="Lifecycle: active|draft|archived")
    selling_price: float | None = Field(default=None, ge=0)
    quantity_change: int | None = Field(default=None, description="Signed delta")
    stock_reason: str | None = None
    reorder_level: int | None = Field(default=None, ge=0)


class BulkOperationsRequest(BaseModel):
    operation: str = Field(..., description="delete|update_stock|update_status|apply_pricing|refresh_price")
    product_ids: list[int] = Field(..., min_length=1)
    quantity_change: int | None = None
    reason: str | None = None
    status: str | None = None
    strategy: str | None = None
    profit_margin_percent: float | None = None


class BulkOperationsResultItem(BaseModel):
    product_id: int
    success: bool
    message: str


class BulkOperationsResponse(BaseModel):
    operation: str
    updated_count: int
    failed_count: int
    results: list[BulkOperationsResultItem]


class ManagerDashboardResponse(BaseModel):
    total_products: int
    total_inventory_value: float
    average_margin_percent: float | None
    low_stock_count: int
    out_of_stock_count: int
    overstocked_count: int
    in_stock_count: int
    status_breakdown: dict[str, int]
    recent_activity: list[dict]


class AiRecommendationResponse(BaseModel):
    product_id: int
    focus: str
    recommendation: str
    suggested_actions: list[str] = Field(default_factory=list)


class MessageResponse(BaseModel):
    success: bool
    message: str


# ─────────────────────────── Response builders ───────────────────────────

def _build_summary(product: Product) -> ManagerProductSummary:
    return ManagerProductSummary(
        id=product.id, name=product.name, platform=product.platform, category=product.category,
        image_url=product.image_url, supplier_price=product.supplier_price, selling_price=product.selling_price,
        quantity=product.quantity, reorder_level=product.reorder_level,
        stock_status=_compute_stock_status(product.quantity, product.reorder_level),
        rating=product.rating, status=product.status, updated_at=product.updated_at,
    )


def _build_product_detail(db: Session, product: Product) -> ManagerProductDetail:
    stock_status = _compute_stock_status(product.quantity, product.reorder_level)
    fee_rate = _fee_rate(product.platform)
    margin_percent = _margin_for_price(product.supplier_price, product.selling_price, fee_rate)

    history_rows = (
        db.query(ProductHistory)
        .filter(ProductHistory.product_id == product.id)
        .order_by(ProductHistory.date.asc())
        .all()
    )
    history = [HistoryEntryOut(id=r.id, action=r.action, details=_parse_details(r), date=r.date) for r in history_rows]

    latest_pricing = next((h for h in reversed(history) if h.action == "priced"), None)
    latest_forecast_row = (
        db.query(InventoryForecast)
        .filter(InventoryForecast.product_id == product.id)
        .order_by(InventoryForecast.date.desc())
        .first()
    )

    pricing_summary = PricingSummary(
        cost=product.supplier_price,
        suggested_price=latest_pricing.details.get("suggested_price") if latest_pricing else None,
        applied_price=product.selling_price,
        margin_percent=margin_percent if margin_percent is not None else (latest_pricing.details.get("margin_percent") if latest_pricing else None),
        strategy=latest_pricing.details.get("strategy") if latest_pricing else None,
        ai_recommendation=latest_pricing.details.get("ai_recommendation") if latest_pricing else None,
    )

    forecast_summary = None
    if latest_forecast_row is not None:
        forecast_summary = ForecastSummary(
            forecasted_demand=latest_forecast_row.forecasted_demand,
            confidence=latest_forecast_row.confidence,
            date=latest_forecast_row.date,
        )

    marketing_data = product.marketing_dict()
    marketing_summary = MarketingSummary(**marketing_data) if marketing_data else None

    warnings = _build_pricing_warnings(margin_percent, product.supplier_price) + _build_inventory_warnings(db, product, stock_status)

    shopify_product_id, shopify_sync_status = None, None
    try:
        import shopify_integration  # local import — see shopify_integration.py's module docstring
        shopify_row = db.query(shopify_integration.ShopifySync).filter(
            shopify_integration.ShopifySync.manager_product_id == product.id
        ).first()
        if shopify_row:
            shopify_product_id, shopify_sync_status = shopify_row.shopify_product_id, shopify_row.sync_status
    except ImportError:
        pass  # Shopify integration isn't installed/loaded — fine, these fields just stay None

    return ManagerProductDetail(
        id=product.id, name=product.name, description=product.description, category=product.category,
        platform=product.platform, status=product.status, stock_status=stock_status,
        image_url=product.image_url, url=product.url, sku=product.sku, seller_name=product.seller_name,
        rating=product.rating, reviews=product.reviews, orders_count=product.orders_count,
        shipping_price=product.shipping_price, currency=product.currency or "USD",
        supplier_price=product.supplier_price, selling_price=product.selling_price,
        quantity=product.quantity, reorder_level=product.reorder_level,
        total_inventory_value=round((product.supplier_price or 0.0) * product.quantity, 2),
        turnover_rate=_turnover_rate(db, product.id, product.quantity),
        pricing=pricing_summary, forecast=forecast_summary, marketing=marketing_summary,
        warnings=warnings, history=history, raw_data=product.raw_data_dict(),
        created_at=product.created_at, updated_at=product.updated_at,
        shopify_product_id=shopify_product_id, shopify_sync_status=shopify_sync_status,
    )


def _get_product_or_404(db: Session, product_id: int) -> Product:
    product = db.get(Product, product_id)
    if not product:
        raise HTTPException(status_code=404, detail=f"Product {product_id} not found")
    return product


# ─────────────────────────── Routes ───────────────────────────

router = APIRouter(prefix="/api/manager", tags=["manager"])


def _run_analyze_pipeline(payload: AnalyzeProductRequest, db: Session) -> Product:
    """
    The full analyze pipeline, extracted from the `/analyze-product` route so
    shopify_scheduler.py's automation job can run the exact same pipeline
    directly (rather than duplicating it or calling back over HTTP). Persists
    the product, computes a fee-aware suggested selling price with an AI
    recommendation, produces an initial demand forecast, generates AI
    marketing copy, and logs every step to `product_history`. Never fails
    outright on an Ollama sub-step — only a real database error rolls back
    the whole save.
    """
    if payload.price is None:
        raise HTTPException(status_code=422, detail="A supplier/cost price is required to analyze a product")

    product = Product(
        name=payload.name, supplier_price=payload.price, currency=payload.currency,
        quantity=payload.initial_quantity, reorder_level=payload.reorder_level,
        description=payload.description, category=payload.category, platform=payload.platform,
        rating=payload.rating, reviews=payload.reviews_count, status="active",
        image_url=payload.image_url, url=payload.url, sku=payload.sku, seller_name=payload.seller_name,
        orders_count=payload.orders_count, shipping_price=payload.shipping_price,
        raw_data=json.dumps(payload.raw_data),
    )
    db.add(product)
    db.flush()  # assigns product.id without committing

    _log_history(db, product.id, "searched", {
        "query": payload.search_query, "platform": payload.platform, "source_price": payload.price,
    })

    # ── Pricing sub-step ──
    fee_rate = _fee_rate(payload.platform)
    margin_target, strategy_label = _resolve_margin(payload.strategy, payload.profit_margin_percent)
    suggested_price = _price_for_margin(payload.price, margin_target, fee_rate)
    achieved_margin = _margin_for_price(payload.price, suggested_price, fee_rate) or margin_target
    competitor = _competitor_stats(_find_competitor_prices(db, product))
    pricing_warnings = _build_full_pricing_warnings(achieved_margin, payload.price, suggested_price, competitor)
    price_ctx = {
        "product_name": product.name, "cost_price": payload.price, "suggested_price": suggested_price,
        "profit_margin_percent": achieved_margin, "platform": payload.platform, "fee_rate": fee_rate,
        "strategy": strategy_label, "currency": payload.currency,
        "competitor_avg": competitor.avg, "competitor_min": competitor.min, "competitor_max": competitor.max,
        "warnings": pricing_warnings,
    }
    ai_recommendation = _ask_ai_pricing_recommendation(price_ctx) or _fallback_pricing_recommendation(price_ctx)

    product.selling_price = suggested_price
    db.add(PricingStrategy(
        product_id=product.id, cost=payload.price, suggested_price=suggested_price,
        applied_price=suggested_price, margin_percent=achieved_margin, strategy=strategy_label,
    ))
    _log_history(db, product.id, "priced", {
        "cost": payload.price, "suggested_price": suggested_price, "applied_price": suggested_price,
        "margin_percent": achieved_margin, "strategy": strategy_label, "ai_recommendation": ai_recommendation,
    })

    # ── Inventory sub-step ──
    if payload.initial_quantity > 0:
        _log_history(db, product.id, "stocked", {
            "quantity_change": payload.initial_quantity, "reason": "initial stock", "new_quantity": payload.initial_quantity,
        })
    forecast_result = _ask_ai_forecast(product, payload.category, [], 30) or _fallback_forecast(product, [], 30)
    forecasted_demand, confidence, _suggested_reorder, _forecast_recommendation = forecast_result
    db.add(InventoryForecast(product_id=product.id, forecasted_demand=forecasted_demand, confidence=confidence))

    # ── Marketing sub-step ──
    marketing_input = {
        "name": product.name, "price": payload.price, "currency": payload.currency,
        "description": payload.description, "rating": payload.rating,
        "reviews_count": payload.reviews_count, "platform": payload.platform,
    }
    ai_marketing = ollama_integration.analyze_product(marketing_input)
    if ai_marketing:
        product.marketing_json = json.dumps({
            "description": ai_marketing.get("description"),
            "target_audience": ai_marketing.get("target_audience"),
            "keywords": ai_marketing.get("keywords") or [],
            "generated_at": utcnow().isoformat(),
        })
        _log_history(db, product.id, "marketed", {
            "target_audience": ai_marketing.get("target_audience"),
            "description_excerpt": (ai_marketing.get("description") or "")[:200],
            "keywords": ai_marketing.get("keywords") or [],
        })
    else:
        _log_history(db, product.id, "marketed", {"note": "AI marketing unavailable"})

    try:
        db.commit()
    except SQLAlchemyError as exc:
        db.rollback()
        logger.exception("Failed to save analyzed product %r", payload.name)
        raise HTTPException(status_code=500, detail=f"Database error while saving product: {exc}") from exc

    db.refresh(product)
    return product


@router.post(
    "/analyze-product",
    response_model=ManagerProductDetail,
    status_code=201,
    summary="Full product analysis pipeline (search + price + inventory + marketing)",
    responses={422: {"description": "A supplier/cost price is required"}},
)
def analyze_product(payload: AnalyzeProductRequest, db: Session = Depends(get_db)):
    """
    Takes a product (typically a search result the user picked) and runs the full pipeline in
    one transaction: persists it, computes a fee-aware suggested selling price with an AI
    recommendation, produces an initial demand forecast, generates AI marketing copy, and logs
    every step to `product_history`. Never fails outright on an Ollama sub-step — only a real
    database error rolls back the whole save.

    If `sync_to_shopify` is set, also pushes the analyzed product to Shopify immediately
    (manual path — respects Shopify's default publish behavior, unlike the scheduler's
    automation job which always syncs as a draft). A Shopify failure never fails this
    endpoint — it's logged and reflected in the response's `shopify_sync_status`.
    """
    product = _run_analyze_pipeline(payload, db)

    if payload.sync_to_shopify:
        import shopify_integration  # local import — see shopify_integration.py's module docstring
        shopify_integration.sync_product_to_shopify(db, product, publish=True)

    return _build_product_detail(db, product)


@router.get("/products", response_model=ManagerProductListResponse, summary="List all products")
def list_products(
    search: str | None = Query(default=None, description="Filter by product name"),
    category: str | None = Query(default=None),
    platform: str | None = Query(default=None),
    status: str | None = Query(default=None, description="Lifecycle: active|draft|archived"),
    stock_status: str | None = Query(default=None, description="in-stock|low-stock|out-of-stock|overstocked"),
    sort_by: str | None = Query(default=None, description="name|quantity|value|updated_at|margin"),
    sort_dir: str = Query(default="desc", description="asc|desc"),
    limit: int = Query(default=200, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
):
    query = db.query(Product)
    if search:
        query = query.filter(Product.name.ilike(f"%{search}%"))
    if category:
        query = query.filter(Product.category == category)
    if platform:
        query = query.filter(Product.platform == platform)
    if status:
        query = query.filter(Product.status == status)

    summaries = [_build_summary(p) for p in query.all()]
    if stock_status:
        summaries = [s for s in summaries if s.stock_status == stock_status]

    sort_keys = {
        "name": lambda s: (s.name or "").lower(),
        "quantity": lambda s: s.quantity,
        "value": lambda s: (s.supplier_price or 0) * s.quantity,
        "updated_at": lambda s: s.updated_at or datetime.min,
        "margin": lambda s: _margin_for_price(s.supplier_price, s.selling_price, _fee_rate(s.platform)) if _margin_for_price(s.supplier_price, s.selling_price, _fee_rate(s.platform)) is not None else -1e9,
    }
    key_fn = sort_keys.get(sort_by)
    if key_fn:
        summaries.sort(key=key_fn, reverse=(sort_dir != "asc"))

    total = len(summaries)
    return ManagerProductListResponse(total=total, products=summaries[offset:offset + limit])


@router.get(
    "/product/{product_id}",
    response_model=ManagerProductDetail,
    summary="Get one product's full profile",
    responses={404: {"description": "Product not found"}},
)
def get_product(product_id: int, db: Session = Depends(get_db)):
    product = _get_product_or_404(db, product_id)
    return _build_product_detail(db, product)


@router.put(
    "/product/{product_id}",
    response_model=ManagerProductDetail,
    summary="Update a product (any field)",
    responses={404: {"description": "Product not found"}, 422: {"description": "Resulting quantity would be negative"}},
)
def update_product(product_id: int, payload: ManagerProductUpdate, db: Session = Depends(get_db)):
    """
    Partial update. `selling_price` logs a manual `action="priced"` entry; `quantity_change`
    (a signed delta, not an absolute value) logs an `action="stocked"` entry. Plain fields
    (name/description/category/status/reorder_level) are applied directly with no history row.
    """
    product = _get_product_or_404(db, product_id)

    if payload.name is not None:
        product.name = payload.name
    if payload.description is not None:
        product.description = payload.description
    if payload.category is not None:
        product.category = payload.category
    if payload.status is not None:
        product.status = payload.status
    if payload.reorder_level is not None:
        product.reorder_level = payload.reorder_level

    if payload.selling_price is not None:
        fee_rate = _fee_rate(product.platform)
        margin = _margin_for_price(product.supplier_price, payload.selling_price, fee_rate)
        product.selling_price = payload.selling_price
        db.add(PricingStrategy(
            product_id=product.id, cost=product.supplier_price or 0.0, suggested_price=None,
            applied_price=payload.selling_price, margin_percent=margin, strategy="manual",
        ))
        _log_history(db, product.id, "priced", {
            "cost": product.supplier_price, "suggested_price": None, "applied_price": payload.selling_price,
            "margin_percent": margin, "strategy": "manual",
        })

    if payload.quantity_change is not None:
        new_quantity = product.quantity + payload.quantity_change
        if new_quantity < 0:
            raise HTTPException(
                status_code=422,
                detail=f"Insufficient stock: {product.quantity} on hand, cannot reduce by {abs(payload.quantity_change)}",
            )
        product.quantity = new_quantity
        _log_history(db, product.id, "stocked", {
            "quantity_change": payload.quantity_change, "reason": payload.stock_reason or "adjustment", "new_quantity": new_quantity,
        })

    try:
        db.commit()
        db.refresh(product)
    except SQLAlchemyError as exc:
        db.rollback()
        logger.exception("Failed to update product %s", product_id)
        raise HTTPException(status_code=500, detail=f"Database error while updating product: {exc}") from exc

    return _build_product_detail(db, product)


@router.post("/bulk-operations", response_model=BulkOperationsResponse, summary="Run a bulk action across multiple products")
def bulk_operations(payload: BulkOperationsRequest, db: Session = Depends(get_db)):
    """
    `operation` selects the action applied to every id in `product_ids`: `delete`,
    `update_stock` (quantity_change/reason), `update_status` (status), `apply_pricing`
    (strategy/profit_margin_percent against current supplier_price), or `refresh_price`
    (re-scrapes each product's source platform for a fresh supplier price — the bulk
    replacement for the old standalone price-refresh endpoint). One item failing never
    blocks the rest of the batch.
    """
    results: list[BulkOperationsResultItem] = []
    updated = 0
    failed = 0

    for pid in payload.product_ids:
        product = db.get(Product, pid)
        if not product:
            failed += 1
            results.append(BulkOperationsResultItem(product_id=pid, success=False, message="Product not found"))
            continue

        try:
            if payload.operation == "delete":
                db.query(ProductHistory).filter(ProductHistory.product_id == pid).delete()
                db.query(PricingStrategy).filter(PricingStrategy.product_id == pid).delete()
                db.query(InventoryForecast).filter(InventoryForecast.product_id == pid).delete()
                db.delete(product)
                message = "Deleted"

            elif payload.operation == "update_stock":
                if payload.quantity_change is None:
                    raise ValueError("quantity_change is required")
                new_qty = product.quantity + payload.quantity_change
                if new_qty < 0:
                    raise ValueError(f"Insufficient stock: {product.quantity} on hand")
                product.quantity = new_qty
                _log_history(db, product.id, "stocked", {
                    "quantity_change": payload.quantity_change, "reason": payload.reason or "bulk adjustment", "new_quantity": new_qty,
                })
                message = f"Quantity now {new_qty}"

            elif payload.operation == "update_status":
                if not payload.status:
                    raise ValueError("status is required")
                product.status = payload.status
                message = f"Status set to {payload.status}"

            elif payload.operation == "apply_pricing":
                if product.supplier_price is None:
                    raise ValueError("No supplier price on record")
                fee_rate = _fee_rate(product.platform)
                margin_target, strategy_label = _resolve_margin(payload.strategy, payload.profit_margin_percent)
                new_price = _price_for_margin(product.supplier_price, margin_target, fee_rate)
                margin = _margin_for_price(product.supplier_price, new_price, fee_rate)
                product.selling_price = new_price
                db.add(PricingStrategy(
                    product_id=product.id, cost=product.supplier_price, suggested_price=new_price,
                    applied_price=new_price, margin_percent=margin, strategy=strategy_label,
                ))
                _log_history(db, product.id, "priced", {
                    "cost": product.supplier_price, "suggested_price": new_price, "applied_price": new_price,
                    "margin_percent": margin, "strategy": strategy_label,
                })
                message = f"Priced at {new_price}"

            elif payload.operation == "refresh_price":
                platform_row = db.query(PlatformDB).filter(PlatformDB.name == product.platform).first()
                if not platform_row or not platform_row.is_active:
                    raise ValueError("Source platform is unavailable or inactive")
                raw_results = _run_scraper(platform_row, product.name, 3)
                new_price = raw_results[0].get("price") if raw_results else None
                if new_price is None:
                    raise ValueError("No match found while refreshing price")
                old_price = product.supplier_price
                product.supplier_price = new_price
                _log_history(db, product.id, "priced", {"cost": new_price, "note": "refreshed from source", "previous_cost": old_price})
                message = f"Supplier price refreshed to {new_price}"

            else:
                raise ValueError(f"Unknown operation {payload.operation!r}")

            updated += 1
            results.append(BulkOperationsResultItem(product_id=pid, success=True, message=message))
        except ValueError as exc:
            failed += 1
            results.append(BulkOperationsResultItem(product_id=pid, success=False, message=str(exc)))
        except Exception as exc:  # noqa: BLE001 - one item's scraper/db surprise must not break the batch
            failed += 1
            logger.exception("Bulk operation %s failed for product %s", payload.operation, pid)
            results.append(BulkOperationsResultItem(product_id=pid, success=False, message=f"{type(exc).__name__}: {exc}"))

    try:
        db.commit()
    except SQLAlchemyError as exc:
        db.rollback()
        logger.exception("Failed to commit bulk operation %s", payload.operation)
        raise HTTPException(status_code=500, detail=f"Database error during bulk operation: {exc}") from exc

    return BulkOperationsResponse(operation=payload.operation, updated_count=updated, failed_count=failed, results=results)


@router.get("/dashboard", response_model=ManagerDashboardResponse, summary="Aggregate stats for the Product Management dashboard")
def get_dashboard(db: Session = Depends(get_db)):
    products = db.query(Product).all()
    status_breakdown = {"active": 0, "draft": 0, "archived": 0}
    stock_breakdown = {"in-stock": 0, "low-stock": 0, "out-of-stock": 0, "overstocked": 0}
    margins: list[float] = []
    total_value = 0.0

    for p in products:
        status_breakdown[p.status] = status_breakdown.get(p.status, 0) + 1
        stock_breakdown[_compute_stock_status(p.quantity, p.reorder_level)] += 1
        total_value += (p.supplier_price or 0.0) * p.quantity
        margin = _margin_for_price(p.supplier_price, p.selling_price, _fee_rate(p.platform))
        if margin is not None:
            margins.append(margin)

    recent_rows = (
        db.query(ProductHistory, Product.name)
        .join(Product, Product.id == ProductHistory.product_id)
        .order_by(ProductHistory.date.desc())
        .limit(15)
        .all()
    )
    recent_activity = [
        {"product_id": hist.product_id, "product_name": name, "action": hist.action, "details": _parse_details(hist), "date": hist.date.isoformat()}
        for hist, name in recent_rows
    ]

    return ManagerDashboardResponse(
        total_products=len(products),
        total_inventory_value=round(total_value, 2),
        average_margin_percent=round(sum(margins) / len(margins), 2) if margins else None,
        low_stock_count=stock_breakdown["low-stock"],
        out_of_stock_count=stock_breakdown["out-of-stock"],
        overstocked_count=stock_breakdown["overstocked"],
        in_stock_count=stock_breakdown["in-stock"],
        status_breakdown=status_breakdown,
        recent_activity=recent_activity,
    )


@router.get(
    "/ai-recommendation",
    response_model=AiRecommendationResponse,
    summary="Read-only AI recommendation for a product",
    responses={404: {"description": "Product not found"}},
)
def get_ai_recommendation(
    product_id: int = Query(...),
    focus: str = Query(default="general", description="general|pricing|inventory|marketing"),
    db: Session = Depends(get_db),
):
    """
    A cheap, read-only "refresh AI insight" call for an already-saved product — unlike
    `analyze-product`, this never writes a new pricing_strategy/inventory_forecast/
    product_history row. Builds its context from the product's *current* state so the AI
    always reasons over full, up-to-date context regardless of focus area.
    """
    product = _get_product_or_404(db, product_id)
    if focus not in ("general", "pricing", "inventory", "marketing"):
        focus = "general"

    stock_status = _compute_stock_status(product.quantity, product.reorder_level)
    fee_rate = _fee_rate(product.platform)
    margin_percent = _margin_for_price(product.supplier_price, product.selling_price, fee_rate)
    marketing_data = product.marketing_dict()

    lines = [
        f"Product: {product.name}",
        f"Category: {product.category or 'Unknown'}",
        f"Platform: {product.platform}",
        f"Supplier price: {product.currency} {product.supplier_price:.2f}" if product.supplier_price is not None else "Supplier price: unknown",
        f"Selling price: {product.currency} {product.selling_price:.2f}" if product.selling_price is not None else "Selling price: not set",
        f"Current margin: {margin_percent:.1f}%" if margin_percent is not None else "Current margin: unknown",
        f"Stock: {product.quantity} units ({stock_status}), reorder level {product.reorder_level}",
    ]
    if marketing_data and marketing_data.get("keywords"):
        lines.append(f"Existing marketing keywords: {', '.join(marketing_data['keywords'][:5])}")
    lines.append(f"Focus area for this recommendation: {focus}")

    ai_result = _ask_manager_recommendation("\n".join(lines))
    if ai_result:
        recommendation, suggested_actions = ai_result
    else:
        recommendation, suggested_actions = _fallback_manager_recommendation(product, stock_status, margin_percent, focus)

    return AiRecommendationResponse(product_id=product.id, focus=focus, recommendation=recommendation, suggested_actions=suggested_actions)


@router.delete(
    "/product/{product_id}",
    response_model=MessageResponse,
    summary="Remove a product",
    responses={404: {"description": "Product not found"}},
)
def delete_product(product_id: int, db: Session = Depends(get_db)):
    product = _get_product_or_404(db, product_id)
    try:
        db.query(ProductHistory).filter(ProductHistory.product_id == product_id).delete()
        db.query(PricingStrategy).filter(PricingStrategy.product_id == product_id).delete()
        db.query(InventoryForecast).filter(InventoryForecast.product_id == product_id).delete()
        db.delete(product)
        db.commit()
    except SQLAlchemyError as exc:
        db.rollback()
        logger.exception("Failed to delete product %s", product_id)
        raise HTTPException(status_code=500, detail=f"Database error while deleting product: {exc}") from exc

    return MessageResponse(success=True, message=f"Product {product_id} deleted")
