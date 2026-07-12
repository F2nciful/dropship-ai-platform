"""
Competitor Tracker — periodic price-check job + price-change alerts.

Mirrors shopify_scheduler.py's BackgroundScheduler singleton pattern exactly (own
scheduler, own job id, started/stopped from main.py's lifespan). No scraper exposes a
"fetch this exact URL" primitive — every built-in scraper is a keyword search — so this
re-runs a name search per active product (the same approach bulk_operations' "refresh_price"
action already uses in manager_agent.py) and diffs the top name-matched result's price
against what was last recorded, rather than tracking one exact competitor listing URL.

This module never imports manager_agent.py at module scope — see shopify_integration.py's
docstring for why (avoids circular imports; manager_agent imports us too, for the alert
bridge). It talks to manager_agent.Product/_run_scraper via a local import inside the job.
"""
import logging

from apscheduler.schedulers.background import BackgroundScheduler
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import Boolean, Column, DateTime, Float, ForeignKey, Integer, String
from sqlalchemy.orm import Session

from database import Base, SessionLocal, get_db, utcnow

logger = logging.getLogger("competitor_tracker")

router = APIRouter(prefix="/api/competitor", tags=["competitor"])

_JOB_ID = "competitor_price_check"
_ALERT_THRESHOLD_PERCENT = 5.0  # only alert on a meaningful move, not scrape noise
_scheduler: BackgroundScheduler | None = None


# ─────────────────────────── Database ───────────────────────────

class CompetitorListing(Base):
    """Last-known competitor price for a saved product, refreshed each scheduled run."""

    __tablename__ = "competitor_listings"

    id = Column(Integer, primary_key=True, index=True)
    product_id = Column(Integer, ForeignKey("products.id", ondelete="CASCADE"), nullable=False, index=True)
    competitor_name = Column(String, nullable=True)
    competitor_platform = Column(String, nullable=False)
    competitor_price = Column(Float, nullable=True)
    competitor_url = Column(String, nullable=True)
    last_checked_at = Column(DateTime, default=utcnow)


class CompetitorPriceHistory(Base):
    __tablename__ = "competitor_price_history"

    id = Column(Integer, primary_key=True, index=True)
    product_id = Column(Integer, ForeignKey("products.id", ondelete="CASCADE"), nullable=False, index=True)
    price = Column(Float, nullable=False)
    checked_at = Column(DateTime, default=utcnow)


class CompetitorAlert(Base):
    __tablename__ = "competitor_alerts"

    id = Column(Integer, primary_key=True, index=True)
    product_id = Column(Integer, ForeignKey("products.id", ondelete="CASCADE"), nullable=False, index=True)
    old_price = Column(Float, nullable=True)
    new_price = Column(Float, nullable=True)
    change_percent = Column(Float, nullable=True)
    created_at = Column(DateTime, default=utcnow)
    acknowledged = Column(Boolean, nullable=False, default=False)


class CompetitorTrackerConfig(Base):
    """Singleton row (id=1) — whether the periodic check is enabled and how often."""

    __tablename__ = "competitor_tracker_config"

    id = Column(Integer, primary_key=True, default=1)
    enabled = Column(Boolean, nullable=False, default=True)
    interval_hours = Column(Integer, nullable=False, default=12)


def _get_or_create_config(db: Session) -> CompetitorTrackerConfig:
    config = db.get(CompetitorTrackerConfig, 1)
    if config is None:
        config = CompetitorTrackerConfig(id=1)
        db.add(config)
        db.commit()
        db.refresh(config)
    return config


# ─────────────────────────── The job ───────────────────────────

def run_price_check_job() -> None:
    """Entry point APScheduler calls on its interval. Owns its own DB session since it
    doesn't run inside a request — never raises (a crash here would silently kill future
    scheduled runs); every per-product failure is logged and skipped instead."""
    import manager_agent  # local import — avoids circular import, see module docstring

    db = SessionLocal()
    try:
        products = db.query(manager_agent.Product).filter(manager_agent.Product.status == "active").all()
        for product in products:
            try:
                _check_one_product(db, manager_agent, product)
            except Exception:  # noqa: BLE001 - one product's scraper failure must not break the batch
                logger.exception("Competitor price check failed for product %s", product.id)
        db.commit()
    except Exception:  # noqa: BLE001 - a scheduled job must never crash the process or kill future runs
        logger.exception("Competitor tracker job failed")
    finally:
        db.close()


def _check_one_product(db: Session, manager_agent, product) -> None:
    platform_row = (
        db.query(manager_agent.PlatformDB)
        .filter(manager_agent.PlatformDB.name == product.platform)
        .first()
    )
    if not platform_row or not platform_row.is_active:
        return

    results = manager_agent._run_scraper(platform_row, product.name, 3)
    match = results[0] if results else None
    if not match or match.get("price") is None:
        return
    new_price = match["price"]

    listing = db.query(CompetitorListing).filter(CompetitorListing.product_id == product.id).first()
    old_price = listing.competitor_price if listing else None
    if listing is None:
        listing = CompetitorListing(product_id=product.id, competitor_platform=product.platform)
        db.add(listing)

    listing.competitor_name = match.get("seller_name")
    listing.competitor_price = new_price
    listing.competitor_url = match.get("url")
    listing.last_checked_at = utcnow()
    db.add(CompetitorPriceHistory(product_id=product.id, price=new_price))

    if old_price is not None and old_price > 0:
        change_pct = round((new_price - old_price) / old_price * 100, 2)
        if abs(change_pct) >= _ALERT_THRESHOLD_PERCENT:
            db.add(CompetitorAlert(
                product_id=product.id, old_price=old_price, new_price=new_price, change_percent=change_pct,
            ))


# ─────────────────────────── APScheduler wiring (called from main.py's lifespan) ───────────────────────────

def start_scheduler() -> None:
    global _scheduler
    if _scheduler is not None:
        return
    _scheduler = BackgroundScheduler()

    db = SessionLocal()
    try:
        config = _get_or_create_config(db)
        interval = config.interval_hours if config.enabled else 12
    finally:
        db.close()

    _scheduler.add_job(run_price_check_job, "interval", hours=interval, id=_JOB_ID, replace_existing=True)
    _scheduler.start()


def stop_scheduler() -> None:
    global _scheduler
    if _scheduler is not None:
        _scheduler.shutdown(wait=False)
        _scheduler = None


# ─────────────────────────── Routes ───────────────────────────

class AlertOut(BaseModel):
    id: int
    product_id: int
    old_price: float | None
    new_price: float | None
    change_percent: float | None
    created_at: str
    acknowledged: bool


@router.get("/alerts", response_model=list[AlertOut], summary="List competitor price-change alerts")
def list_alerts(unacknowledged_only: bool = True, db: Session = Depends(get_db)):
    """Polled by the React dashboard the same way it already polls other endpoints on this
    service — the concrete cross-service bridge into the frontend's notification bell,
    rather than building real inter-service pub/sub."""
    query = db.query(CompetitorAlert)
    if unacknowledged_only:
        query = query.filter(CompetitorAlert.acknowledged.is_(False))
    rows = query.order_by(CompetitorAlert.created_at.desc()).limit(50).all()
    return [
        AlertOut(
            id=r.id, product_id=r.product_id, old_price=r.old_price, new_price=r.new_price,
            change_percent=r.change_percent, created_at=r.created_at.isoformat(), acknowledged=r.acknowledged,
        )
        for r in rows
    ]


@router.post("/alerts/{alert_id}/ack", summary="Acknowledge a competitor price-change alert")
def ack_alert(alert_id: int, db: Session = Depends(get_db)):
    alert = db.get(CompetitorAlert, alert_id)
    if alert:
        alert.acknowledged = True
        db.commit()
    return {"success": True}
