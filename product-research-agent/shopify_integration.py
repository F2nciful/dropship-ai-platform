"""
Shopify integration — pushes analyzed products from the Manager Agent's
`products` table to a Shopify store, keeps price/inventory in sync, and
receives Shopify webhooks for the reverse direction.

Design notes:
- This module never imports manager_agent.py at module scope, and
  manager_agent.py never imports this module at module scope either — every
  cross-reference is a *local* import inside the function that needs it.
  Both modules need each other (manager_agent triggers a sync; this module
  reads Product rows), and importing at top level in both directions would
  be a circular import. Local imports sidestep that safely since by the time
  either function actually runs, main.py's startup has already fully loaded
  both modules.
- The Shopify API access token is only ever read from `settings` (.env) and
  is never accepted from a request body or returned in a response — nothing
  here ever puts it in front of the frontend.
- Product images are passed through to Shopify as `{"src": url}` — Shopify's
  API fetches and hosts the image itself, so there's no need to download and
  re-upload image bytes here.
"""
import base64
import hashlib
import hmac
import json
import logging
import time
from datetime import datetime

import requests
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import Column, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from config import settings
from database import Base, get_db, utcnow
from scrape_utils import RateLimiter

logger = logging.getLogger("shopify_integration")

router = APIRouter(prefix="/api/shopify", tags=["shopify"])

_rate_limiter = RateLimiter(settings.shopify_rate_limit_seconds)
_location_id_cache: int | None = None


# ─────────────────────────── Database ───────────────────────────

class ShopifySync(Base):
    """One row per Manager Agent product that has ever been synced to Shopify.
    Only stores Shopify's own IDs — never the API token/secret."""

    __tablename__ = "shopify_sync"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    manager_product_id = Column(Integer, ForeignKey("products.id", ondelete="CASCADE"), nullable=False, unique=True, index=True)
    shopify_product_id = Column(String, nullable=True, index=True)
    shopify_variant_id = Column(String, nullable=True)
    shopify_inventory_item_id = Column(String, nullable=True)
    sync_status = Column(String, nullable=False, default="pending")  # pending|draft|active|failed
    last_price_sync = Column(DateTime, nullable=True)
    last_inventory_sync = Column(DateTime, nullable=True)
    last_error = Column(Text, nullable=True)
    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)


class ShopifySyncLog(Base):
    """Append-only action log — backs the dashboard's sync-history list and stats."""

    __tablename__ = "shopify_sync_log"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    action = Column(String, nullable=False, index=True)  # discover|analyze|sync|price_update|inventory_update|webhook
    manager_product_id = Column(Integer, nullable=True, index=True)
    shopify_product_id = Column(String, nullable=True)
    product_name = Column(String, nullable=True)
    status = Column(String, nullable=False)  # success|failed|skipped
    message = Column(Text, nullable=True)
    created_at = Column(DateTime, default=utcnow, index=True)


def log_action(
    db: Session, action: str, status: str, message: str, *,
    manager_product_id: int | None = None, shopify_product_id: str | None = None, product_name: str | None = None,
) -> None:
    db.add(ShopifySyncLog(
        action=action, status=status, message=message, manager_product_id=manager_product_id,
        shopify_product_id=shopify_product_id, product_name=product_name,
    ))
    db.commit()


# ─────────────────────────── Shopify REST client ───────────────────────────

class ShopifyAPIError(Exception):
    pass


def _base_url() -> str:
    return f"https://{settings.shopify_store_url}/admin/api/{settings.shopify_api_version}"


def _headers() -> dict:
    return {"X-Shopify-Access-Token": settings.shopify_api_token, "Content-Type": "application/json"}


def _shopify_request(method: str, path: str, *, params: dict | None = None, json_body: dict | None = None) -> dict:
    """Wraps requests.request with rate limiting, 429/Retry-After handling, and retry-with-
    backoff on network errors. Raises ShopifyAPIError with a clean message on total failure —
    callers are expected to catch this and log it, never let it become an unhandled 500."""
    if not settings.shopify_configured:
        raise ShopifyAPIError("Shopify is not configured — set SHOPIFY_STORE_URL and SHOPIFY_API_TOKEN in .env")

    url = f"{_base_url()}/{path.lstrip('/')}"
    last_error: Exception | None = None
    for attempt in range(1, settings.shopify_max_retries + 1):
        try:
            _rate_limiter.wait()
            response = requests.request(
                method, url, headers=_headers(), params=params, json=json_body, timeout=30,
            )
            if response.status_code == 429:
                retry_after = float(response.headers.get("Retry-After", 2))
                logger.warning("Shopify rate limited (attempt %s/%s) — retrying in %ss", attempt, settings.shopify_max_retries, retry_after)
                time.sleep(retry_after)
                continue
            if response.status_code in (401, 403):
                raise ShopifyAPIError(
                    f"Shopify authentication failed (HTTP {response.status_code}) — check SHOPIFY_API_TOKEN and its scopes"
                )
            if response.status_code == 404:
                raise ShopifyAPIError("Shopify resource not found (HTTP 404)")
            response.raise_for_status()
            return response.json() if response.content else {}
        except requests.RequestException as exc:
            last_error = exc
            logger.warning("Shopify request %s %s failed (attempt %s/%s): %s", method, path, attempt, settings.shopify_max_retries, exc)
            time.sleep(min(2 ** attempt, 8))
    raise ShopifyAPIError(f"Shopify request failed after {settings.shopify_max_retries} attempts: {last_error}")


def test_connection() -> dict:
    """GET shop.json — the cheapest possible call to confirm the store URL/token are valid."""
    data = _shopify_request("GET", "shop.json")
    return data.get("shop", {})


def find_product_by_sku(sku: str) -> dict | None:
    """Duplicate detection: look for an existing Shopify product whose variant SKU matches."""
    if not sku:
        return None
    data = _shopify_request("GET", "products.json", params={"limit": 50, "fields": "id,title,variants"})
    for product in data.get("products", []):
        for variant in product.get("variants", []):
            if variant.get("sku") == sku:
                return product
    return None


def create_product(payload: dict) -> dict:
    data = _shopify_request("POST", "products.json", json_body={"product": payload})
    return data.get("product", {})


def update_product(shopify_product_id: str, payload: dict) -> dict:
    data = _shopify_request("PUT", f"products/{shopify_product_id}.json", json_body={"product": payload})
    return data.get("product", {})


def update_variant_price(variant_id: str, price: float) -> dict:
    data = _shopify_request("PUT", f"variants/{variant_id}.json", json_body={"variant": {"id": variant_id, "price": str(price)}})
    return data.get("variant", {})


def get_or_cache_location_id() -> int:
    """Shopify's inventory API needs a location_id, not just a product id — there's almost
    always exactly one location for a small store, so cache the first one for the process
    lifetime rather than looking it up on every inventory update."""
    global _location_id_cache
    if _location_id_cache is not None:
        return _location_id_cache
    data = _shopify_request("GET", "locations.json")
    locations = data.get("locations", [])
    if not locations:
        raise ShopifyAPIError("Shopify store has no locations configured")
    _location_id_cache = locations[0]["id"]
    return _location_id_cache


def set_inventory_level(inventory_item_id: str, quantity: int) -> dict:
    location_id = get_or_cache_location_id()
    return _shopify_request("POST", "inventory_levels/set.json", json_body={
        "location_id": location_id, "inventory_item_id": inventory_item_id, "available": quantity,
    })


def list_shopify_products(limit: int = 50, page_info: str | None = None) -> dict:
    """Shopify's 2024-xx API is cursor-paginated (page_info), not page-numbered."""
    params = {"limit": limit}
    if page_info:
        params["page_info"] = page_info
    return _shopify_request("GET", "products.json", params=params)


def verify_webhook_hmac(body: bytes, hmac_header: str | None) -> bool:
    if not hmac_header or not settings.shopify_api_secret:
        return False
    digest = hmac.new(settings.shopify_api_secret.encode("utf-8"), body, hashlib.sha256).digest()
    computed_b64 = base64.b64encode(digest).decode()
    return hmac.compare_digest(computed_b64, hmac_header)


# ─────────────────────────── Product payload mapping ───────────────────────────

def _build_shopify_payload(product, *, publish: bool) -> dict:
    """Maps a manager_agent.Product row + its AI marketing copy to a Shopify product payload."""
    marketing = product.marketing_dict() or {}
    description = marketing.get("description") or product.description or product.name
    keywords = marketing.get("keywords") or []
    images = []
    if product.image_url:
        images.append({"src": product.image_url})

    return {
        "title": product.name,
        "body_html": f"<p>{description}</p>",
        "vendor": product.seller_name or product.platform,
        "product_type": product.category or "General",
        "tags": ", ".join(keywords[:10]),
        "status": "active" if publish else "draft",
        "images": images,
        "variants": [{
            "price": str(product.selling_price or product.supplier_price or 0),
            "sku": product.sku or f"nexus-{product.id}",
            "inventory_management": "shopify",
            "inventory_quantity": max(product.quantity, 0),
        }],
    }


def sync_product_to_shopify(db: Session, product, *, publish: bool) -> ShopifySync:
    """Core sync routine shared by /sync-product, /bulk-sync, and the scheduler's
    auto-sync job. Always upserts a ShopifySync row and logs the outcome — never
    raises past this function; failures are recorded on the row/log instead."""
    sync_row = db.query(ShopifySync).filter(ShopifySync.manager_product_id == product.id).first()
    if sync_row is None:
        sync_row = ShopifySync(manager_product_id=product.id, sync_status="pending")
        db.add(sync_row)
        db.flush()

    try:
        payload = _build_shopify_payload(product, publish=publish)
        existing = find_product_by_sku(payload["variants"][0]["sku"])
        if existing:
            shopify_product = update_product(str(existing["id"]), payload)
        else:
            shopify_product = create_product(payload)

        variant = (shopify_product.get("variants") or [{}])[0]
        sync_row.shopify_product_id = str(shopify_product.get("id"))
        sync_row.shopify_variant_id = str(variant.get("id")) if variant.get("id") else None
        sync_row.shopify_inventory_item_id = str(variant.get("inventory_item_id")) if variant.get("inventory_item_id") else None
        sync_row.sync_status = "active" if publish else "draft"
        sync_row.last_price_sync = utcnow()
        sync_row.last_inventory_sync = utcnow()
        sync_row.last_error = None
        db.commit()
        log_action(db, "sync", "success", f"Synced as {sync_row.sync_status}", manager_product_id=product.id,
             shopify_product_id=sync_row.shopify_product_id, product_name=product.name)
    except ShopifyAPIError as exc:
        sync_row.sync_status = "failed"
        sync_row.last_error = str(exc)
        db.commit()
        log_action(db, "sync", "failed", str(exc), manager_product_id=product.id, product_name=product.name)

    db.refresh(sync_row)
    return sync_row


# ─────────────────────────── Schemas ───────────────────────────

class ConnectResponse(BaseModel):
    connected: bool
    shop_name: str | None = None
    message: str


class StatusResponse(BaseModel):
    configured: bool
    connected: bool
    shop_name: str | None = None
    store_url: str | None = None


class SyncProductRequest(BaseModel):
    manager_product_id: int
    publish: bool = True


class BulkSyncRequest(BaseModel):
    manager_product_ids: list[int] = Field(..., min_length=1)
    publish: bool = True


class SyncResultItem(BaseModel):
    manager_product_id: int
    success: bool
    shopify_product_id: str | None = None
    sync_status: str
    message: str


class BulkSyncResponse(BaseModel):
    synced_count: int
    failed_count: int
    results: list[SyncResultItem]


class SyncLogEntry(BaseModel):
    id: int
    action: str
    manager_product_id: int | None
    shopify_product_id: str | None
    product_name: str | None
    status: str
    message: str | None
    created_at: datetime


class StatsResponse(BaseModel):
    products_synced: int
    active_count: int
    draft_count: int
    failed_count: int
    total_selling_value: float
    success_rate_percent: float


class MessageResponse(BaseModel):
    success: bool
    message: str


# ─────────────────────────── Routes ───────────────────────────

def _get_product_or_404(db: Session, manager_product_id: int):
    from manager_agent import Product  # local import — see module docstring
    product = db.get(Product, manager_product_id)
    if not product:
        raise HTTPException(status_code=404, detail=f"Product {manager_product_id} not found")
    return product


@router.post("/connect", response_model=ConnectResponse, summary="Validate the configured Shopify credentials")
def connect(db: Session = Depends(get_db)):
    """Never accepts a token from the request body — this only re-checks whatever is
    already configured in .env, so a Shopify access token is never sent from the browser."""
    if not settings.shopify_configured:
        return ConnectResponse(connected=False, message="Set SHOPIFY_STORE_URL and SHOPIFY_API_TOKEN in .env first")
    try:
        shop = test_connection()
        log_action(db, "sync", "success", f"Connected to {shop.get('name')}")
        return ConnectResponse(connected=True, shop_name=shop.get("name"), message="Connected")
    except ShopifyAPIError as exc:
        log_action(db, "sync", "failed", str(exc))
        return ConnectResponse(connected=False, message=str(exc))


@router.get("/status", response_model=StatusResponse, summary="Current connection status")
def status():
    if not settings.shopify_configured:
        return StatusResponse(configured=False, connected=False)
    try:
        shop = test_connection()
        return StatusResponse(configured=True, connected=True, shop_name=shop.get("name"), store_url=settings.shopify_store_url)
    except ShopifyAPIError:
        return StatusResponse(configured=True, connected=False, store_url=settings.shopify_store_url)


@router.post("/sync-product", response_model=SyncResultItem, summary="Push one analyzed product to Shopify")
def sync_product(payload: SyncProductRequest, db: Session = Depends(get_db)):
    product = _get_product_or_404(db, payload.manager_product_id)
    row = sync_product_to_shopify(db, product, publish=payload.publish)
    return SyncResultItem(
        manager_product_id=product.id, success=row.sync_status != "failed",
        shopify_product_id=row.shopify_product_id, sync_status=row.sync_status,
        message=row.last_error or f"Synced as {row.sync_status}",
    )


@router.post("/bulk-sync", response_model=BulkSyncResponse, summary="Push multiple analyzed products to Shopify")
def bulk_sync(payload: BulkSyncRequest, db: Session = Depends(get_db)):
    results: list[SyncResultItem] = []
    synced, failed = 0, 0
    for pid in payload.manager_product_ids:
        try:
            product = _get_product_or_404(db, pid)
            row = sync_product_to_shopify(db, product, publish=payload.publish)
            ok = row.sync_status != "failed"
            synced += 1 if ok else 0
            failed += 0 if ok else 1
            results.append(SyncResultItem(
                manager_product_id=pid, success=ok, shopify_product_id=row.shopify_product_id,
                sync_status=row.sync_status, message=row.last_error or f"Synced as {row.sync_status}",
            ))
        except HTTPException as exc:
            failed += 1
            results.append(SyncResultItem(manager_product_id=pid, success=False, sync_status="failed", message=str(exc.detail)))
    return BulkSyncResponse(synced_count=synced, failed_count=failed, results=results)


@router.put("/update-price/{manager_product_id}", response_model=SyncResultItem, summary="Push the current selling price to Shopify")
def update_price(manager_product_id: int, db: Session = Depends(get_db)):
    product = _get_product_or_404(db, manager_product_id)
    row = db.query(ShopifySync).filter(ShopifySync.manager_product_id == manager_product_id).first()
    if not row or not row.shopify_variant_id:
        raise HTTPException(status_code=422, detail="Product hasn't been synced to Shopify yet — use /sync-product first")
    try:
        update_variant_price(row.shopify_variant_id, product.selling_price or 0)
        row.last_price_sync = utcnow()
        row.last_error = None
        db.commit()
        log_action(db, "price_update", "success", f"Price updated to {product.selling_price}", manager_product_id=product.id, shopify_product_id=row.shopify_product_id)
        return SyncResultItem(manager_product_id=product.id, success=True, shopify_product_id=row.shopify_product_id, sync_status=row.sync_status, message="Price updated")
    except ShopifyAPIError as exc:
        row.last_error = str(exc)
        db.commit()
        log_action(db, "price_update", "failed", str(exc), manager_product_id=product.id, shopify_product_id=row.shopify_product_id)
        return SyncResultItem(manager_product_id=product.id, success=False, shopify_product_id=row.shopify_product_id, sync_status=row.sync_status, message=str(exc))


@router.put("/update-inventory/{manager_product_id}", response_model=SyncResultItem, summary="Push the current stock level to Shopify")
def update_inventory(manager_product_id: int, db: Session = Depends(get_db)):
    product = _get_product_or_404(db, manager_product_id)
    row = db.query(ShopifySync).filter(ShopifySync.manager_product_id == manager_product_id).first()
    if not row or not row.shopify_inventory_item_id:
        raise HTTPException(status_code=422, detail="Product hasn't been synced to Shopify yet — use /sync-product first")
    try:
        set_inventory_level(row.shopify_inventory_item_id, max(product.quantity, 0))
        row.last_inventory_sync = utcnow()
        row.last_error = None
        db.commit()
        log_action(db, "inventory_update", "success", f"Inventory updated to {product.quantity}", manager_product_id=product.id, shopify_product_id=row.shopify_product_id)
        return SyncResultItem(manager_product_id=product.id, success=True, shopify_product_id=row.shopify_product_id, sync_status=row.sync_status, message="Inventory updated")
    except ShopifyAPIError as exc:
        row.last_error = str(exc)
        db.commit()
        log_action(db, "inventory_update", "failed", str(exc), manager_product_id=product.id, shopify_product_id=row.shopify_product_id)
        return SyncResultItem(manager_product_id=product.id, success=False, shopify_product_id=row.shopify_product_id, sync_status=row.sync_status, message=str(exc))


@router.get("/products", summary="List products currently in the Shopify store")
def list_products(limit: int = 50):
    try:
        return list_shopify_products(limit=limit)
    except ShopifyAPIError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.get("/sync-log", response_model=list[SyncLogEntry], summary="Recent sync actions")
def sync_log(limit: int = 50, db: Session = Depends(get_db)):
    rows = db.query(ShopifySyncLog).order_by(ShopifySyncLog.created_at.desc()).limit(limit).all()
    return rows


@router.get("/stats", response_model=StatsResponse, summary="Sync statistics for the dashboard")
def stats(db: Session = Depends(get_db)):
    from manager_agent import Product  # local import — see module docstring

    rows = db.query(ShopifySync).all()
    active = sum(1 for r in rows if r.sync_status == "active")
    draft = sum(1 for r in rows if r.sync_status == "draft")
    failed = sum(1 for r in rows if r.sync_status == "failed")
    total = len(rows)

    synced_product_ids = [r.manager_product_id for r in rows if r.sync_status in ("active", "draft")]
    total_value = 0.0
    if synced_product_ids:
        products = db.query(Product).filter(Product.id.in_(synced_product_ids)).all()
        total_value = sum((p.selling_price or 0) * max(p.quantity, 0) for p in products)

    log_total = db.query(ShopifySyncLog).count()
    log_success = db.query(ShopifySyncLog).filter(ShopifySyncLog.status == "success").count()
    success_rate = round(log_success / log_total * 100, 1) if log_total else 100.0

    return StatsResponse(
        products_synced=total, active_count=active, draft_count=draft, failed_count=failed,
        total_selling_value=round(total_value, 2), success_rate_percent=success_rate,
    )


@router.post("/webhooks/{topic}", response_model=MessageResponse, summary="Shopify webhook receiver (HMAC-verified)")
async def webhook(topic: str, request: Request, db: Session = Depends(get_db)):
    """
    Verifies the X-Shopify-Hmac-Sha256 signature before processing. Built now so
    it's ready to wire up, but not yet registered with a live store — Shopify's
    servers need a public HTTPS URL to call, which localhost doesn't have.
    """
    body = await request.body()
    hmac_header = request.headers.get("X-Shopify-Hmac-Sha256")
    if not verify_webhook_hmac(body, hmac_header):
        raise HTTPException(status_code=401, detail="Invalid webhook signature")

    try:
        payload = json.loads(body)
    except (ValueError, TypeError):
        payload = {}

    if topic == "products/update":
        shopify_product_id = str(payload.get("id"))
        row = db.query(ShopifySync).filter(ShopifySync.shopify_product_id == shopify_product_id).first()
        if row:
            row.last_price_sync = utcnow()
            db.commit()
            log_action(db, "webhook", "success", f"Received {topic}", manager_product_id=row.manager_product_id, shopify_product_id=shopify_product_id)

    return MessageResponse(success=True, message=f"Processed {topic}")
