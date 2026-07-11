"""
Automation scheduler — periodically scans a user-maintained list of seed
search keywords across the built-in scrapers, ranks results as a "trending"
proxy (orders_count/rating), analyzes anything that clears the configured
margin bar through the same pipeline `/api/manager/analyze-product` uses,
and syncs it to Shopify as a **draft** (never auto-published — see
shopify_integration.py's module docstring for why manual vs. scheduled syncs
are treated differently).

Profitability gate: manager_agent's pricing model is cost-plus — it always
computes a selling price that *hits* whatever target margin you ask for, so
comparing a freshly-computed margin against a threshold would be tautological
(it always exactly equals the target). The honest, non-tautological version
of "sync if profitable (margin > threshold)" is checked once per run, before
touching any candidate: does the configured `pricing_strategy`'s fixed target
margin (50/100/150/200%, from manager_agent.STRATEGIES) clear
`margin_threshold`? If not, nothing in this run can be "profitable enough"
by definition, and the run logs a single skip instead of processing (and
mislabeling) every candidate.

This module never imports manager_agent.py or main.py at module scope — see
shopify_integration.py's docstring for why. It talks to the scrapers
directly (scraper_aliexpress/scraper_amazon/scraper_ebay), exactly like
main.py does, so there's no dependency on main.py either.
"""
import json
import logging
from datetime import datetime, timedelta

from apscheduler.schedulers.background import BackgroundScheduler
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import Boolean, Column, DateTime, Float, Integer, String, Text
from sqlalchemy.orm import Session

import scraper_aliexpress
import scraper_amazon
import scraper_ebay
from database import Base, SessionLocal, get_db, utcnow

logger = logging.getLogger("shopify_scheduler")

router = APIRouter(prefix="/api/scheduler", tags=["scheduler"])

_SCRAPERS = {"aliexpress": scraper_aliexpress.search, "amazon": scraper_amazon.search, "ebay": scraper_ebay.search}
_JOB_ID = "shopify_auto_sync"
_scheduler: BackgroundScheduler | None = None


# ─────────────────────────── Database ───────────────────────────

class ShopifySchedulerConfig(Base):
    """Singleton row (id=1) holding the automation schedule's settings."""

    __tablename__ = "shopify_scheduler_config"

    id = Column(Integer, primary_key=True, default=1)
    enabled = Column(Boolean, nullable=False, default=False)
    interval_hours = Column(Integer, nullable=False, default=24)  # one of 1/4/12/24
    seed_keywords_json = Column(Text, nullable=False, default="[]")
    platforms_json = Column(Text, nullable=False, default='["aliexpress", "amazon", "ebay"]')
    pricing_strategy = Column(String, nullable=False, default="mid")
    margin_threshold = Column(Float, nullable=False, default=30.0)
    max_candidates_per_keyword = Column(Integer, nullable=False, default=3)
    category_blacklist_json = Column(Text, nullable=False, default="[]")  # seed-keyword labels to skip
    last_run_at = Column(DateTime, nullable=True)
    next_run_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)

    def seed_keywords(self) -> list[str]:
        try:
            return json.loads(self.seed_keywords_json)
        except (TypeError, ValueError):
            return []

    def platforms(self) -> list[str]:
        try:
            return json.loads(self.platforms_json)
        except (TypeError, ValueError):
            return ["aliexpress", "amazon", "ebay"]

    def blacklist(self) -> list[str]:
        try:
            return json.loads(self.category_blacklist_json)
        except (TypeError, ValueError):
            return []


def _get_or_create_config(db: Session) -> ShopifySchedulerConfig:
    config = db.get(ShopifySchedulerConfig, 1)
    if config is None:
        config = ShopifySchedulerConfig(id=1)
        db.add(config)
        db.commit()
        db.refresh(config)
    return config


# ─────────────────────────── The job ───────────────────────────

def run_auto_sync_job() -> None:
    """Entry point APScheduler calls on its interval. Owns its own DB session
    since it doesn't run inside a request — never raises (a crash here would
    silently kill future scheduled runs), every failure is logged instead."""
    from manager_agent import STRATEGIES  # local import — see module docstring
    import shopify_integration as shopify

    db = SessionLocal()
    try:
        config = _get_or_create_config(db)
        config.last_run_at = utcnow()
        config.next_run_at = utcnow() + timedelta(hours=config.interval_hours)
        db.commit()

        if not config.enabled:
            return

        strategy_margin = STRATEGIES.get(config.pricing_strategy, STRATEGIES["mid"])["margin"]
        if strategy_margin < config.margin_threshold:
            shopify.log_action(
                db, "discover", "skipped",
                f"'{config.pricing_strategy}' strategy margin ({strategy_margin}%) is below "
                f"the configured threshold ({config.margin_threshold}%) — nothing can qualify this run",
            )
            return

        keywords = config.seed_keywords()
        if not keywords:
            shopify.log_action(db, "discover", "skipped", "No seed keywords configured")
            return

        blacklist = set(config.blacklist())
        platforms = [p for p in config.platforms() if p in _SCRAPERS]

        for keyword in keywords:
            if keyword in blacklist:
                continue
            _process_keyword(db, keyword, platforms, config, shopify)
    except Exception:  # noqa: BLE001 - a scheduled job must never crash the process or kill future runs
        logger.exception("Auto-sync job failed")
    finally:
        db.close()


def _process_keyword(db: Session, keyword: str, platforms: list[str], config: ShopifySchedulerConfig, shopify) -> None:
    from manager_agent import AnalyzeProductRequest, _run_analyze_pipeline  # local import

    candidates: list[dict] = []
    for platform in platforms:
        try:
            results = _SCRAPERS[platform](keyword, 10)
        except Exception as exc:  # noqa: BLE001 - one platform failing must not stop the scan
            logger.warning("Auto-sync scrape failed for %s/%s: %s", platform, keyword, exc)
            continue
        for item in results:
            if item.get("price"):
                item["platform"] = platform
                candidates.append(item)

    if not candidates:
        shopify.log_action(db, "discover", "skipped", f"No candidates found for '{keyword}'")
        return

    candidates.sort(key=lambda c: (c.get("orders_count") or 0, c.get("rating") or 0), reverse=True)
    top = candidates[: config.max_candidates_per_keyword]
    shopify.log_action(db, "discover", "success", f"Found {len(candidates)} candidate(s) for '{keyword}', analyzing top {len(top)}")

    for item in top:
        try:
            payload = AnalyzeProductRequest(
                name=item.get("name") or keyword,
                price=item.get("price"),
                currency=item.get("currency", "USD"),
                image_url=item.get("image_url"),
                url=item.get("url"),
                description=item.get("description"),
                rating=item.get("rating"),
                reviews_count=item.get("reviews_count"),
                orders_count=item.get("orders_count"),
                shipping_price=item.get("shipping_price"),
                seller_name=item.get("seller_name"),
                sku=item.get("sku"),
                platform=item["platform"],
                raw_data=item.get("raw_data") or {},
                search_query=keyword,
                initial_quantity=0,
                reorder_level=10,
                strategy=config.pricing_strategy,
            )
            product = _run_analyze_pipeline(payload, db)
            shopify.log_action(db, "analyze", "success", f"Analyzed '{product.name}'", manager_product_id=product.id, product_name=product.name)

            shopify.sync_product_to_shopify(db, product, publish=False)
        except Exception as exc:  # noqa: BLE001 - one candidate failing must not stop the batch
            logger.exception("Auto-sync candidate failed for keyword %r", keyword)
            shopify.log_action(db, "analyze", "failed", f"{type(exc).__name__}: {exc}", product_name=item.get("name"))


# ─────────────────────────── APScheduler wiring (called from main.py's lifespan) ───────────────────────────

def start_scheduler() -> None:
    global _scheduler
    if _scheduler is not None:
        return
    _scheduler = BackgroundScheduler()
    _scheduler.start()

    db = SessionLocal()
    try:
        config = _get_or_create_config(db)
        if config.enabled:
            _schedule_job(config.interval_hours)
    finally:
        db.close()


def stop_scheduler() -> None:
    global _scheduler
    if _scheduler is not None:
        _scheduler.shutdown(wait=False)
        _scheduler = None


def _schedule_job(interval_hours: int) -> None:
    if _scheduler is None:
        return
    _scheduler.add_job(run_auto_sync_job, "interval", hours=interval_hours, id=_JOB_ID, replace_existing=True)


def _unschedule_job() -> None:
    if _scheduler is not None and _scheduler.get_job(_JOB_ID):
        _scheduler.remove_job(_JOB_ID)


# ─────────────────────────── Schemas ───────────────────────────

class SchedulerConfigRequest(BaseModel):
    interval_hours: int = Field(default=24, description="One of 1, 4, 12, 24")
    seed_keywords: list[str] = Field(default_factory=list)
    platforms: list[str] = Field(default_factory=lambda: ["aliexpress", "amazon", "ebay"])
    pricing_strategy: str = Field(default="mid", description="budget|mid|premium|aggressive")
    margin_threshold: float = Field(default=30.0, ge=0)
    max_candidates_per_keyword: int = Field(default=3, ge=1, le=10)
    category_blacklist: list[str] = Field(default_factory=list)


class SchedulerConfigResponse(BaseModel):
    enabled: bool
    interval_hours: int
    seed_keywords: list[str]
    platforms: list[str]
    pricing_strategy: str
    margin_threshold: float
    max_candidates_per_keyword: int
    category_blacklist: list[str]
    last_run_at: datetime | None
    next_run_at: datetime | None


class SchedulerStatusResponse(BaseModel):
    config: SchedulerConfigResponse
    recent_log: list[dict]


class MessageResponse(BaseModel):
    success: bool
    message: str


def _to_config_response(config: ShopifySchedulerConfig) -> SchedulerConfigResponse:
    return SchedulerConfigResponse(
        enabled=config.enabled, interval_hours=config.interval_hours, seed_keywords=config.seed_keywords(),
        platforms=config.platforms(), pricing_strategy=config.pricing_strategy, margin_threshold=config.margin_threshold,
        max_candidates_per_keyword=config.max_candidates_per_keyword, category_blacklist=config.blacklist(),
        last_run_at=config.last_run_at, next_run_at=config.next_run_at,
    )


# ─────────────────────────── Routes ───────────────────────────

VALID_INTERVALS = {1, 4, 12, 24}


@router.get("/status", response_model=SchedulerStatusResponse, summary="Current schedule config + recent activity")
def scheduler_status(db: Session = Depends(get_db)):
    import shopify_integration as shopify  # local import — see module docstring

    config = _get_or_create_config(db)
    recent = (
        db.query(shopify.ShopifySyncLog)
        .filter(shopify.ShopifySyncLog.action.in_(["discover", "analyze"]))
        .order_by(shopify.ShopifySyncLog.created_at.desc())
        .limit(20)
        .all()
    )
    return SchedulerStatusResponse(
        config=_to_config_response(config),
        recent_log=[{"id": r.id, "action": r.action, "status": r.status, "message": r.message, "created_at": r.created_at.isoformat()} for r in recent],
    )


def _apply_config_fields(config: ShopifySchedulerConfig, payload: SchedulerConfigRequest) -> None:
    if payload.interval_hours not in VALID_INTERVALS:
        raise HTTPException(status_code=422, detail=f"interval_hours must be one of {sorted(VALID_INTERVALS)}")
    config.interval_hours = payload.interval_hours
    config.seed_keywords_json = json.dumps(payload.seed_keywords)
    config.platforms_json = json.dumps(payload.platforms)
    config.pricing_strategy = payload.pricing_strategy
    config.margin_threshold = payload.margin_threshold
    config.max_candidates_per_keyword = payload.max_candidates_per_keyword
    config.category_blacklist_json = json.dumps(payload.category_blacklist)


@router.put("/config", response_model=SchedulerConfigResponse, summary="Update the automation schedule's settings")
def update_config(payload: SchedulerConfigRequest, db: Session = Depends(get_db)):
    config = _get_or_create_config(db)
    _apply_config_fields(config, payload)
    db.commit()
    db.refresh(config)

    if config.enabled:
        _schedule_job(config.interval_hours)  # re-schedule with the new interval

    return _to_config_response(config)


@router.post("/start-auto-sync", response_model=SchedulerConfigResponse, summary="Enable the automation schedule")
def start_auto_sync(payload: SchedulerConfigRequest, db: Session = Depends(get_db)):
    if not payload.seed_keywords:
        raise HTTPException(status_code=422, detail="At least one seed keyword is required to start auto-sync")

    config = _get_or_create_config(db)
    _apply_config_fields(config, payload)
    config.enabled = True
    db.commit()
    db.refresh(config)

    if _scheduler is None:
        start_scheduler()
    _schedule_job(config.interval_hours)

    return _to_config_response(config)


@router.post("/stop-auto-sync", response_model=MessageResponse, summary="Disable the automation schedule")
def stop_auto_sync(db: Session = Depends(get_db)):
    config = _get_or_create_config(db)
    config.enabled = False
    db.commit()
    _unschedule_job()
    return MessageResponse(success=True, message="Auto-sync stopped")
