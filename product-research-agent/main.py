"""
Product Research Agent — FastAPI entry point.

Searches AliExpress, Amazon, and eBay for products (optionally summarizing
raw results with a local Ollama model), and delegates everything about a
*saved* product — pricing, inventory, marketing, and the saved-product
catalog itself — to the unified Manager Agent (manager_agent.py).
Shopify sync (shopify_integration.py) and its automation scheduler
(shopify_scheduler.py) build on top of that same product catalog.
Designed to be consumed by the Nexus React dashboard.
"""
import json
import logging
import time
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

import dynamic_scraper
import manager_agent
import mock_data
import ollama_integration
import scraper_aliexpress
import scraper_amazon
import scraper_ebay
import shopify_integration
import shopify_scheduler
from config import settings
from database import PlatformDB, get_db, init_db, seed_builtin_platforms
from models import (
    HealthResponse,
    MessageResponse,
    PlatformCreate,
    PlatformResponse,
    PlatformTestResponse,
    PlatformUpdate,
    ScrapedProduct,
    SearchProductsRequest,
    SearchProductsResponse,
    SummarizeProductsRequest,
    SummarizeProductsResponse,
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("main")

# Built-in platforms have hand-tuned scrapers; anything else registered in the
# `platforms` table is scraped generically via dynamic_scraper using its config.
BUILTIN_SCRAPERS = {
    "aliexpress": scraper_aliexpress.search,
    "amazon": scraper_amazon.search,
    "ebay": scraper_ebay.search,
}


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Initializing database...")
    init_db()
    seed_builtin_platforms()
    shopify_scheduler.start_scheduler()
    logger.info("Product Research Agent ready on port %s", settings.port)
    yield
    shopify_scheduler.stop_scheduler()


TAGS_METADATA = [
    {"name": "health", "description": "Service and dependency status."},
    {"name": "products", "description": "Search platforms for products."},
    {"name": "platforms", "description": "Manage which e-commerce platforms (built-in and custom) can be searched."},
    {"name": "ai", "description": "Ollama-powered product comparison."},
    {"name": "manager", "description": "The unified Manager Agent: product search analysis, pricing, inventory, and marketing — all in one place."},
    {"name": "shopify", "description": "Sync analyzed products to a Shopify store and keep price/inventory in sync."},
    {"name": "scheduler", "description": "Automated discovery — scans seed keywords on a schedule and auto-syncs profitable finds to Shopify as drafts."},
]

app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    description=(
        "Multi-platform product research and scraping API for the Nexus dropshipping dashboard. "
        "Search AliExpress, Amazon, and eBay, then hand a chosen result to the Manager Agent "
        "(/api/manager/*) for full AI-assisted pricing, inventory, and marketing analysis."
    ),
    lifespan=lifespan,
    openapi_tags=TAGS_METADATA,
)

# The Nexus dashboard runs on :3000 during development; both localhost and 127.0.0.1
# are listed explicitly (browsers treat them as distinct origins), and "*" is kept as
# a fallback so the API also works from other hosts/ports without extra config.
# Starlette's CORSMiddleware correctly echoes back the actual request origin (instead
# of a literal "*") whenever allow_credentials=True, so this combination is safe to
# use with credentialed requests.
CORS_ORIGINS = list(dict.fromkeys([
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    *settings.cors_origins_list,
    "*",
]))

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(manager_agent.router)
app.include_router(shopify_integration.router)
app.include_router(shopify_scheduler.router)


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    """Catch-all so callers always get a clean JSON error instead of a raw traceback."""
    logger.exception("Unhandled error on %s %s", request.method, request.url.path)
    return JSONResponse(
        status_code=500,
        content={"detail": "An unexpected error occurred. Please try again."},
    )


def _to_platform_response(platform: PlatformDB) -> PlatformResponse:
    return PlatformResponse(
        id=platform.id,
        name=platform.name,
        url=platform.url,
        scraper_type=platform.scraper_type,
        is_active=platform.is_active,
        config=platform.config_dict(),
        created_at=platform.created_at,
    )


def _run_scraper(platform: PlatformDB, query: str, max_results: int) -> list[dict]:
    """Dispatch to the hand-tuned built-in scraper if there is one, else the generic config-driven one."""
    if platform.scraper_type == "built_in" and platform.name in BUILTIN_SCRAPERS:
        return BUILTIN_SCRAPERS[platform.name](query, max_results)
    return dynamic_scraper.search(query, max_results, platform.name, platform.url, platform.config_dict())


# ─────────────────────────── Health ───────────────────────────

@app.get(
    "/api/health",
    response_model=HealthResponse,
    tags=["health"],
    summary="Health check",
)
def health_check():
    """Report service status and whether the configured Ollama instance is reachable."""
    return HealthResponse(
        status="ok",
        app_name=settings.app_name,
        version=settings.app_version,
        ollama_reachable=ollama_integration.is_healthy(),
    )


# ─────────────────────────── Search ───────────────────────────

@app.post(
    "/api/search-products",
    response_model=SearchProductsResponse,
    tags=["products"],
    summary="Search products across platforms",
)
def search_products(payload: SearchProductsRequest, db: Session = Depends(get_db)):
    """
    Search the requested platforms for `query` and return normalized results — a raw
    multi-platform browse, not tied to the saved-product schema. Once the user picks one
    result to onboard, hand it to POST /api/manager/analyze-product for the full pipeline.

    Platforms can be any mix of built-ins (aliexpress/amazon/ebay) and custom
    platforms registered via /api/platforms — each is looked up in the platforms
    table and must exist and be active. A failure scraping one platform never
    fails the whole request: it's reported per-platform in `errors`, and results
    from the other platforms are still returned.

    If `settings.scrape_mock_fallback` is enabled and a platform comes back with
    no real results (blocked, timed out, errored — or genuinely found nothing),
    clearly-labeled placeholder listings fill in instead of leaving it empty.
    `errors` is still populated in that case so callers always know real
    scraping didn't succeed — mock data is never silently passed off as real.
    """
    start_time = time.monotonic()
    results: list[ScrapedProduct] = []
    errors: dict[str, str] = {}

    requested_names = set(payload.platforms)
    db_platforms = {
        p.name: p for p in db.query(PlatformDB).filter(PlatformDB.name.in_(requested_names)).all()
    }

    for platform_name in payload.platforms:
        platform = db_platforms.get(platform_name)
        if not platform:
            errors[platform_name] = "Unknown platform — register it via POST /api/platforms first"
            continue
        if not platform.is_active:
            errors[platform_name] = "Platform is inactive"
            continue
        if platform_name == "ebay" and not scraper_ebay.is_configured():
            errors[platform_name] = (
                "eBay Browse API credentials not configured — set ebay_client_id/ebay_client_secret "
                "(free at developer.ebay.com) to enable eBay search"
            )
            continue

        raw_results: list[dict] = []
        failure_reason: str | None = None
        platform_start = time.monotonic()
        try:
            raw_results = _run_scraper(platform, payload.query, payload.max_results)
        except Exception as exc:  # noqa: BLE001 - a single platform failing must not break the search
            logger.exception("Scraper for %s failed", platform_name)
            failure_reason = f"{type(exc).__name__}: {exc}"
        logger.info(
            "%s scrape for %r took %.1fs, %s result(s)",
            platform_name, payload.query, time.monotonic() - platform_start, len(raw_results),
        )

        if not raw_results and settings.scrape_mock_fallback:
            logger.info("No real results for %s — filling in labeled mock fallback data", platform_name)
            raw_results = mock_data.generate(platform_name, payload.query, payload.max_results)
            errors[platform_name] = (failure_reason or "No real results found") + " — showing labeled demo data"
        elif failure_reason:
            errors[platform_name] = failure_reason

        results.extend(ScrapedProduct(**item) for item in raw_results)

    results = _filter_and_sort_results(results, payload)
    logger.info(
        "Combined search for %r across %s platform(s) took %.1fs, %s total result(s)",
        payload.query, len(payload.platforms), time.monotonic() - start_time, len(results),
    )

    return SearchProductsResponse(query=payload.query, total_results=len(results), results=results, errors=errors)


def _filter_and_sort_results(
    results: list[ScrapedProduct], payload: SearchProductsRequest
) -> list[ScrapedProduct]:
    """Apply the request's price/rating/stock filters and sort order to scraped results."""
    if payload.min_price is not None:
        results = [r for r in results if r.price is not None and r.price >= payload.min_price]
    if payload.max_price is not None:
        results = [r for r in results if r.price is not None and r.price <= payload.max_price]
    if payload.min_rating is not None:
        results = [r for r in results if r.rating is not None and r.rating >= payload.min_rating]
    if payload.in_stock_only:
        results = [r for r in results if r.in_stock]

    sort_keys = {
        "price_asc": lambda r: (r.price is None, r.price or 0),
        "price_desc": lambda r: (r.price is None, -(r.price or 0)),
        "rating_desc": lambda r: (r.rating is None, -(r.rating or 0)),
        "orders_desc": lambda r: (r.orders_count is None, -(r.orders_count or 0)),
        # Freshly-scraped results have no timestamp — "newest" keeps scrape order.
        "newest": None,
    }
    sort_key = sort_keys.get(payload.sort_by)
    if sort_key:
        results = sorted(results, key=sort_key)

    return results


# ─────────────────────────── Platforms ───────────────────────────

@app.get(
    "/api/platforms",
    response_model=list[PlatformResponse],
    tags=["platforms"],
    summary="List platforms",
)
def list_platforms(
    is_active: bool | None = None,
    db: Session = Depends(get_db),
):
    """List every registered platform — built-in (seeded at startup) and custom."""
    query = db.query(PlatformDB)
    if is_active is not None:
        query = query.filter(PlatformDB.is_active == is_active)
    platforms = query.order_by(PlatformDB.scraper_type.desc(), PlatformDB.name).all()
    return [_to_platform_response(p) for p in platforms]


@app.post(
    "/api/platforms",
    response_model=PlatformResponse,
    status_code=201,
    tags=["platforms"],
    summary="Add a platform",
    responses={409: {"description": "A platform with this name already exists"}},
)
def create_platform(payload: PlatformCreate, db: Session = Depends(get_db)):
    """
    Register a new platform to search. `url` must be a valid http(s) URL.

    For a working custom scraper, set `config.selectors.item` at minimum (a CSS
    selector matching each product card) — without it, searches against this
    platform will simply return no results rather than failing.
    """
    existing = db.query(PlatformDB).filter(PlatformDB.name == payload.name).first()
    if existing:
        raise HTTPException(status_code=409, detail=f"Platform '{payload.name}' already exists")

    platform = PlatformDB(
        name=payload.name,
        url=str(payload.url),
        scraper_type=payload.scraper_type.value,
        is_active=payload.is_active,
        config=json.dumps(payload.config.model_dump()),
    )

    try:
        db.add(platform)
        db.commit()
        db.refresh(platform)
    except SQLAlchemyError as exc:
        db.rollback()
        logger.exception("Failed to create platform %r", payload.name)
        raise HTTPException(status_code=500, detail=f"Database error while creating platform: {exc}") from exc

    return _to_platform_response(platform)


@app.put(
    "/api/platforms/{platform_id}",
    response_model=PlatformResponse,
    tags=["platforms"],
    summary="Update a platform",
    responses={404: {"description": "Platform not found"}, 409: {"description": "Name already in use"}},
)
def update_platform(platform_id: int, payload: PlatformUpdate, db: Session = Depends(get_db)):
    """Update a platform's name, URL, active status, and/or scraping config. Only the fields provided are changed."""
    platform = db.get(PlatformDB, platform_id)
    if not platform:
        raise HTTPException(status_code=404, detail=f"Platform {platform_id} not found")

    if payload.name is not None and payload.name != platform.name:
        clash = db.query(PlatformDB).filter(PlatformDB.name == payload.name).first()
        if clash:
            raise HTTPException(status_code=409, detail=f"Platform '{payload.name}' already exists")
        platform.name = payload.name
    if payload.url is not None:
        platform.url = str(payload.url)
    if payload.scraper_type is not None:
        platform.scraper_type = payload.scraper_type.value
    if payload.is_active is not None:
        platform.is_active = payload.is_active
    if payload.config is not None:
        platform.config = json.dumps(payload.config.model_dump())

    try:
        db.commit()
        db.refresh(platform)
    except SQLAlchemyError as exc:
        db.rollback()
        logger.exception("Failed to update platform %s", platform_id)
        raise HTTPException(status_code=500, detail=f"Database error while updating platform: {exc}") from exc

    return _to_platform_response(platform)


@app.delete(
    "/api/platforms/{platform_id}",
    response_model=MessageResponse,
    tags=["platforms"],
    summary="Delete a platform",
    responses={404: {"description": "Platform not found"}},
)
def delete_platform(platform_id: int, db: Session = Depends(get_db)):
    """
    Remove a platform from the registry. This includes built-ins — deleting one
    just means it's no longer searchable until re-added via POST /api/platforms.
    """
    platform = db.get(PlatformDB, platform_id)
    if not platform:
        raise HTTPException(status_code=404, detail=f"Platform {platform_id} not found")

    try:
        db.delete(platform)
        db.commit()
    except SQLAlchemyError as exc:
        db.rollback()
        logger.exception("Failed to delete platform %s", platform_id)
        raise HTTPException(status_code=500, detail=f"Database error while deleting platform: {exc}") from exc

    return MessageResponse(success=True, message=f"Platform {platform_id} deleted")


@app.post(
    "/api/platforms/{platform_id}/test",
    response_model=PlatformTestResponse,
    tags=["platforms"],
    summary="Test a platform's scraper",
    responses={404: {"description": "Platform not found"}},
)
def test_platform(platform_id: int, db: Session = Depends(get_db)):
    """
    Run a small live search (query='test', max 3 results) against a platform to
    confirm its URL/selectors actually work. Never raises — a failed scrape is
    reported as `success: false` with a explanatory message, not an HTTP error,
    since "the scraper doesn't work yet" is an expected outcome while configuring
    a new custom platform, not a server error.
    """
    platform = db.get(PlatformDB, platform_id)
    if not platform:
        raise HTTPException(status_code=404, detail=f"Platform {platform_id} not found")

    try:
        results = _run_scraper(platform, "test", 3)
    except Exception as exc:  # noqa: BLE001 - report failure, don't crash the test endpoint
        logger.exception("Test scrape failed for platform %s", platform.name)
        return PlatformTestResponse(success=False, message=f"{type(exc).__name__}: {exc}", results_count=0)

    if not results:
        return PlatformTestResponse(
            success=False,
            message="Scraper ran but found no results — check the URL and CSS selectors in this platform's config.",
            results_count=0,
        )

    return PlatformTestResponse(
        success=True,
        message=f"Successfully scraped {len(results)} result(s).",
        results_count=len(results),
        sample_results=[ScrapedProduct(**r) for r in results],
    )


# ─────────────────────────── AI (Ollama) ───────────────────────────

@app.post(
    "/api/summarize-products",
    response_model=SummarizeProductsResponse,
    tags=["ai"],
    summary="AI-compare a list of products",
)
def summarize_products_endpoint(payload: SummarizeProductsRequest):
    """Ask Ollama to compare a list of raw (not-yet-saved) products and recommend the best opportunity."""
    summary = ollama_integration.summarize_products([p.model_dump() for p in payload.products])
    if summary is None:
        return SummarizeProductsResponse(
            success=False,
            message="AI summary unavailable — check that Ollama is running and the configured model is installed.",
        )
    return SummarizeProductsResponse(success=True, summary=summary)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host=settings.host, port=settings.port, reload=settings.debug)
