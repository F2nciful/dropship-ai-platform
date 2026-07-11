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

import ollama_integration
import scraper_aliexpress
import scraper_amazon
import scraper_ebay
from config import settings
from database import Product, get_db, init_db
from models import (
    HealthResponse,
    MessageResponse,
    Platform,
    ProductCreate,
    ProductListResponse,
    ProductResponse,
    ScrapedProduct,
    SearchProductsRequest,
    SearchProductsResponse,
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("main")

SCRAPERS = {
    Platform.aliexpress: scraper_aliexpress.search,
    Platform.amazon: scraper_amazon.search,
    Platform.ebay: scraper_ebay.search,
}


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Initializing database...")
    init_db()
    logger.info("Product Research Agent ready on port %s", settings.port)
    yield


TAGS_METADATA = [
    {"name": "health", "description": "Service and dependency status."},
    {"name": "products", "description": "Search platforms for products and manage the saved product catalog."},
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
def search_products(payload: SearchProductsRequest):
    """
    Search AliExpress, Amazon, and/or eBay for `query` and return normalized results.

    A failure scraping one platform never fails the whole request — it's reported
    per-platform in the `errors` field, and results from the other platforms are
    still returned.
    """
    results: list[ScrapedProduct] = []
    errors: dict[str, str] = {}

    for platform in payload.platforms:
        scraper = SCRAPERS.get(platform)
        if not scraper:
            errors[platform.value] = "No scraper registered for this platform"
            continue
        try:
            raw_results = scraper(payload.query, payload.max_results)
            results.extend(ScrapedProduct(**item) for item in raw_results)
        except Exception as exc:  # noqa: BLE001 - a single platform failing must not break the search
            logger.exception("Scraper for %s failed", platform.value)
            errors[platform.value] = f"{type(exc).__name__}: {exc}"

    return SearchProductsResponse(query=payload.query, total_results=len(results), results=results, errors=errors)


# ─────────────────────────── Products CRUD ───────────────────────────

@app.get(
    "/api/products",
    response_model=ProductListResponse,
    tags=["products"],
    summary="List saved products",
)
def list_products(
    platform: Platform | None = Query(default=None, description="Filter by platform"),
    limit: int = Query(default=50, ge=1, le=200, description="Max rows to return (1-200)"),
    offset: int = Query(default=0, ge=0, description="Rows to skip, for pagination"),
    db: Session = Depends(get_db),
):
    """Return products previously saved to the database, newest first."""
    try:
        query = db.query(Product)
        if platform:
            query = query.filter(Product.platform == platform.value)

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
        platform=payload.platform.value,
        ai_summary=ai_summary,
        raw_data=json.dumps(payload.raw_data),
    )

    try:
        db.add(product)
        db.commit()
        db.refresh(product)
    except SQLAlchemyError as exc:
        db.rollback()
        logger.exception("Failed to save product %r", payload.name)
        raise HTTPException(status_code=500, detail=f"Database error while saving product: {exc}") from exc

    return _to_product_response(product)


@app.delete(
    "/api/product/{product_id}",
    response_model=MessageResponse,
    tags=["products"],
    summary="Delete a saved product",
    responses={404: {"description": "Product not found"}},
)
def delete_product(product_id: int, db: Session = Depends(get_db)):
    """Remove a saved product from the database by its id."""
    product = db.get(Product, product_id)
    if not product:
        raise HTTPException(status_code=404, detail=f"Product {product_id} not found")

    try:
        db.delete(product)
        db.commit()
    except SQLAlchemyError as exc:
        db.rollback()
        logger.exception("Failed to delete product %s", product_id)
        raise HTTPException(status_code=500, detail=f"Database error while deleting product: {exc}") from exc

    return MessageResponse(success=True, message=f"Product {product_id} deleted")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host=settings.host, port=settings.port, reload=settings.debug)
