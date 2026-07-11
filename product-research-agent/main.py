"""
Product Research Agent — FastAPI entry point.

Searches AliExpress, Amazon, and eBay for products, optionally summarizes
them with a local Ollama model, and persists selected products to SQLite.
Designed to be consumed by the Nexus React dashboard.
"""
import json
import logging
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

import dynamic_scraper
import ollama_integration
import pricing_agent
import scraper_aliexpress
import scraper_amazon
import scraper_ebay
from config import settings
from database import PlatformDB, PriceHistory, Product, get_db, init_db, seed_builtin_platforms
from models import (
    AnalyzeProductRequest,
    HealthResponse,
    MessageResponse,
    PlatformCreate,
    PlatformResponse,
    PlatformTestResponse,
    PlatformUpdate,
    PriceHistoryEntry,
    PriceHistoryResponse,
    ProductAnalysisResponse,
    ProductCreate,
    ProductListResponse,
    ProductResponse,
    ProductUpdate,
    RefreshPriceResult,
    RefreshPricesResponse,
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
    logger.info("Product Research Agent ready on port %s", settings.port)
    yield


TAGS_METADATA = [
    {"name": "health", "description": "Service and dependency status."},
    {"name": "products", "description": "Search platforms for products and manage the saved product catalog."},
    {"name": "platforms", "description": "Manage which e-commerce platforms (built-in and custom) can be searched."},
    {"name": "ai", "description": "Ollama-powered product analysis and comparison."},
    {"name": "price-tracking", "description": "Price history and refresh for saved products."},
    {"name": "pricing", "description": "AI-assisted selling-price suggestions, profit margin calculations, and pricing history."},
]

app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    description=(
        "Multi-platform product research and scraping API for the Nexus dropshipping dashboard. "
        "Search AliExpress, Amazon, and eBay, optionally summarize results with a local Ollama model, "
        "and save selected products to SQLite for use in the storefront."
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

app.include_router(pricing_agent.router)


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    """Catch-all so callers always get a clean JSON error instead of a raw traceback."""
    logger.exception("Unhandled error on %s %s", request.method, request.url.path)
    return JSONResponse(
        status_code=500,
        content={"detail": "An unexpected error occurred. Please try again."},
    )


def _to_product_response(product: Product) -> ProductResponse:
    return ProductResponse(
        id=product.id,
        name=product.name,
        price=product.price,
        currency=product.currency,
        image_url=product.image_url,
        url=product.url,
        description=product.description,
        rating=product.rating,
        reviews_count=product.reviews_count,
        orders_count=product.orders_count,
        shipping_price=product.shipping_price,
        seller_name=product.seller_name,
        category=product.category,
        sku=product.sku,
        in_stock=product.in_stock,
        stock_quantity=product.stock_quantity,
        platform=product.platform,
        ai_summary=product.ai_summary,
        raw_data=product.raw_data_dict(),
        created_at=product.created_at,
        updated_at=product.updated_at,
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
    Search the requested platforms for `query` and return normalized results.

    Platforms can be any mix of built-ins (aliexpress/amazon/ebay) and custom
    platforms registered via /api/platforms — each is looked up in the platforms
    table and must exist and be active. A failure scraping one platform never
    fails the whole request: it's reported per-platform in `errors`, and results
    from the other platforms are still returned.
    """
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
        try:
            raw_results = _run_scraper(platform, payload.query, payload.max_results)
            results.extend(ScrapedProduct(**item) for item in raw_results)
        except Exception as exc:  # noqa: BLE001 - a single platform failing must not break the search
            logger.exception("Scraper for %s failed", platform_name)
            errors[platform_name] = f"{type(exc).__name__}: {exc}"

    results = _filter_and_sort_results(results, payload)

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


# ─────────────────────────── Products CRUD ───────────────────────────

@app.get(
    "/api/products",
    response_model=ProductListResponse,
    tags=["products"],
    summary="List saved products",
)
def list_products(
    platform: str | None = Query(default=None, description="Filter by platform name"),
    limit: int = Query(default=50, ge=1, le=200, description="Max rows to return (1-200)"),
    offset: int = Query(default=0, ge=0, description="Rows to skip, for pagination"),
    db: Session = Depends(get_db),
):
    """Return products previously saved to the database, newest first."""
    try:
        query = db.query(Product)
        if platform:
            query = query.filter(Product.platform == platform)

        total = query.count()
        products = query.order_by(Product.created_at.desc()).offset(offset).limit(limit).all()
    except SQLAlchemyError as exc:
        logger.exception("Failed to list products")
        raise HTTPException(status_code=500, detail=f"Database error while listing products: {exc}") from exc

    return ProductListResponse(total=total, products=[_to_product_response(p) for p in products])


@app.get(
    "/api/product/{product_id}",
    response_model=ProductResponse,
    tags=["products"],
    summary="Get a saved product",
    responses={404: {"description": "Product not found"}},
)
def get_product(product_id: int, db: Session = Depends(get_db)):
    """Fetch full details for a single saved product by its database id."""
    product = db.get(Product, product_id)
    if not product:
        raise HTTPException(status_code=404, detail=f"Product {product_id} not found")
    return _to_product_response(product)


@app.post(
    "/api/add-to-database",
    response_model=ProductResponse,
    status_code=201,
    tags=["products"],
    summary="Save a product",
)
def add_to_database(payload: ProductCreate, db: Session = Depends(get_db)):
    """
    Persist a product (typically one returned by `/api/search-products`) to the database.

    If `generate_ai_summary` is true, Ollama is asked for a short dropshipping-oriented
    summary first; if Ollama is unreachable or fails, the product is still saved without
    a summary rather than failing the whole request.
    """
    ai_summary = None
    if payload.generate_ai_summary:
        ai_summary = ollama_integration.summarize_product(payload.model_dump())
        if ai_summary is None:
            logger.warning("AI summary requested but unavailable for %r; saving without it", payload.name)

    product = Product(
        name=payload.name,
        price=payload.price,
        currency=payload.currency,
        image_url=payload.image_url,
        url=payload.url,
        description=payload.description,
        rating=payload.rating,
        reviews_count=payload.reviews_count,
        orders_count=payload.orders_count,
        shipping_price=payload.shipping_price,
        seller_name=payload.seller_name,
        category=payload.category,
        sku=payload.sku,
        in_stock=payload.in_stock,
        stock_quantity=payload.stock_quantity,
        platform=payload.platform,
        ai_summary=ai_summary,
        raw_data=json.dumps(payload.raw_data),
    )

    try:
        db.add(product)
        db.commit()
        db.refresh(product)
        if product.price is not None:
            db.add(PriceHistory(product_id=product.id, price=product.price, currency=product.currency))
            db.commit()
    except SQLAlchemyError as exc:
        db.rollback()
        logger.exception("Failed to save product %r", payload.name)
        raise HTTPException(status_code=500, detail=f"Database error while saving product: {exc}") from exc

    return _to_product_response(product)


@app.put(
    "/api/product/{product_id}",
    response_model=ProductResponse,
    tags=["products"],
    summary="Update a saved product",
    responses={404: {"description": "Product not found"}},
)
def update_product(product_id: int, payload: ProductUpdate, db: Session = Depends(get_db)):
    """
    Partially update a saved product — only fields provided in the body are changed.
    If `price` changes, a new price_history entry is recorded automatically.
    """
    product = db.get(Product, product_id)
    if not product:
        raise HTTPException(status_code=404, detail=f"Product {product_id} not found")

    updates = payload.model_dump(exclude_unset=True)
    price_changed = "price" in updates and updates["price"] != product.price

    for field, value in updates.items():
        setattr(product, field, value)

    try:
        if price_changed and product.price is not None:
            db.add(PriceHistory(product_id=product.id, price=product.price, currency=product.currency))
        db.commit()
        db.refresh(product)
    except SQLAlchemyError as exc:
        db.rollback()
        logger.exception("Failed to update product %s", product_id)
        raise HTTPException(status_code=500, detail=f"Database error while updating product: {exc}") from exc

    return _to_product_response(product)


@app.delete(
    "/api/product/{product_id}",
    response_model=MessageResponse,
    tags=["products"],
    summary="Delete a saved product",
    responses={404: {"description": "Product not found"}},
)
def delete_product(product_id: int, db: Session = Depends(get_db)):
    """Remove a saved product (and its price/pricing history) from the database by its id."""
    product = db.get(Product, product_id)
    if not product:
        raise HTTPException(status_code=404, detail=f"Product {product_id} not found")

    try:
        db.query(PriceHistory).filter(PriceHistory.product_id == product_id).delete()
        db.query(pricing_agent.PricingHistory).filter(
            pricing_agent.PricingHistory.product_id == product_id
        ).delete()
        db.delete(product)
        db.commit()
    except SQLAlchemyError as exc:
        db.rollback()
        logger.exception("Failed to delete product %s", product_id)
        raise HTTPException(status_code=500, detail=f"Database error while deleting product: {exc}") from exc

    return MessageResponse(success=True, message=f"Product {product_id} deleted")


# ─────────────────────────── Platforms ───────────────────────────

@app.get(
    "/api/platforms",
    response_model=list[PlatformResponse],
    tags=["platforms"],
    summary="List platforms",
)
def list_platforms(
    is_active: bool | None = Query(default=None, description="Filter by active status"),
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
    "/api/analyze-product",
    response_model=ProductAnalysisResponse,
    tags=["ai"],
    summary="AI-analyze a product",
)
def analyze_product_endpoint(payload: AnalyzeProductRequest):
    """
    Ask the local Ollama model for a structured analysis of a product: a rewritten
    description, a suggested retail price with profit margin, a target audience,
    and marketing keywords. Never raises — if Ollama is unreachable or its response
    can't be parsed, responds with `success: false` and an explanatory message
    instead of an HTTP error, since "AI unavailable" is an expected runtime state.
    """
    result = ollama_integration.analyze_product(payload.model_dump())
    if result is None:
        return ProductAnalysisResponse(
            success=False,
            message="AI analysis unavailable — check that Ollama is running and the configured model is installed.",
        )
    return ProductAnalysisResponse(success=True, **result)


@app.post(
    "/api/summarize-products",
    response_model=SummarizeProductsResponse,
    tags=["ai"],
    summary="AI-compare a list of products",
)
def summarize_products_endpoint(payload: SummarizeProductsRequest):
    """Ask Ollama to compare a list of products and recommend the best opportunity."""
    summary = ollama_integration.summarize_products([p.model_dump() for p in payload.products])
    if summary is None:
        return SummarizeProductsResponse(
            success=False,
            message="AI summary unavailable — check that Ollama is running and the configured model is installed.",
        )
    return SummarizeProductsResponse(success=True, summary=summary)


# ─────────────────────────── Price Tracking ───────────────────────────

@app.get(
    "/api/product/{product_id}/price-history",
    response_model=PriceHistoryResponse,
    tags=["price-tracking"],
    summary="Get a product's price history",
    responses={404: {"description": "Product not found"}},
)
def get_price_history(product_id: int, db: Session = Depends(get_db)):
    """Return every recorded price snapshot for a saved product, oldest first."""
    product = db.get(Product, product_id)
    if not product:
        raise HTTPException(status_code=404, detail=f"Product {product_id} not found")

    entries = (
        db.query(PriceHistory)
        .filter(PriceHistory.product_id == product_id)
        .order_by(PriceHistory.recorded_at.asc())
        .all()
    )

    first_price = entries[0].price if entries else None
    latest_price = entries[-1].price if entries else None
    change_percent = None
    if first_price and latest_price is not None and first_price != 0:
        change_percent = round((latest_price - first_price) / first_price * 100, 2)

    return PriceHistoryResponse(
        product_id=product.id,
        product_name=product.name,
        entries=[PriceHistoryEntry.model_validate(e) for e in entries],
        first_price=first_price,
        latest_price=latest_price,
        change_percent=change_percent,
    )


@app.post(
    "/api/products/refresh-prices",
    response_model=RefreshPricesResponse,
    tags=["price-tracking"],
    summary="Refresh prices for all saved products",
)
def refresh_prices(db: Session = Depends(get_db)):
    """
    Best-effort price refresh for every saved product: re-searches each product's
    platform by name and takes the closest match's price. This is a name-based
    re-search rather than an exact page re-fetch, since the scrapers are built for
    search-result pages, not single-listing pages — treat refreshed prices as an
    estimate, not a guaranteed exact match to the original listing.
    """
    products = db.query(Product).all()
    platforms_by_name = {p.name: p for p in db.query(PlatformDB).all()}

    results: list[RefreshPriceResult] = []
    updated_count = 0
    failed_count = 0

    for product in products:
        platform = platforms_by_name.get(product.platform)
        if not platform or not platform.is_active:
            failed_count += 1
            results.append(RefreshPriceResult(
                product_id=product.id, name=product.name, old_price=product.price,
                status="skipped — platform unavailable or inactive",
            ))
            continue

        try:
            raw_results = _run_scraper(platform, product.name, 3)
        except Exception as exc:  # noqa: BLE001 - one product failing must not break the batch
            logger.exception("Price refresh scrape failed for product %s", product.id)
            failed_count += 1
            results.append(RefreshPriceResult(
                product_id=product.id, name=product.name, old_price=product.price,
                status=f"failed — {type(exc).__name__}: {exc}",
            ))
            continue

        new_price = raw_results[0].get("price") if raw_results else None
        if new_price is None:
            failed_count += 1
            results.append(RefreshPriceResult(
                product_id=product.id, name=product.name, old_price=product.price,
                status="no match found",
            ))
            continue

        old_price = product.price
        changed = old_price is None or new_price != old_price
        if changed:
            product.price = new_price
            db.add(PriceHistory(product_id=product.id, price=new_price, currency=product.currency))

        updated_count += 1
        results.append(RefreshPriceResult(
            product_id=product.id, name=product.name, old_price=old_price, new_price=new_price,
            changed=changed, status="updated" if changed else "unchanged",
        ))

    try:
        db.commit()
    except SQLAlchemyError as exc:
        db.rollback()
        logger.exception("Failed to commit refreshed prices")
        raise HTTPException(status_code=500, detail=f"Database error while refreshing prices: {exc}") from exc

    return RefreshPricesResponse(updated_count=updated_count, failed_count=failed_count, results=results)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host=settings.host, port=settings.port, reload=settings.debug)
