"""
Pydantic models used for API request/response validation and serialization.
"""
from datetime import datetime
from enum import Enum
from typing import Any, Optional

from pydantic import AnyHttpUrl, BaseModel, Field

# Platform identifiers are plain strings, not a fixed enum — the registry of
# searchable platforms is dynamic (built-ins seeded at startup, plus whatever
# custom platforms users add via /api/platforms), so it can't be a compile-time
# choice. Validity is checked at request time against the `platforms` table.


# ─────────────────────────── Search ───────────────────────────

class SearchProductsRequest(BaseModel):
    query: str = Field(..., min_length=1, description="Search keywords, e.g. 'wireless earbuds'")
    search_scope: str = Field(
        default="custom",
        description="'all' = every active registered platform (built-in + custom, regardless of "
                     "`platforms`); 'custom' = only the platforms listed in `platforms`; or a single "
                     "platform name (e.g. 'aliexpress') to search just that one.",
    )
    platforms: list[str] = Field(
        default_factory=lambda: ["aliexpress", "amazon", "ebay"],
        description="Which platform names to search when search_scope='custom' "
                     "(must be registered and active — see GET /api/platforms)",
    )
    max_results: int = Field(
        default=10, ge=1, le=1000,
        description="Max results fetched per platform into the cached pool (not the page size)",
    )
    page: int = Field(default=1, ge=1, description="1-indexed page of (filtered/sorted) results to return")
    page_size: int = Field(default=50, ge=1, le=100, description="Results per page")
    sort_by: Optional[str] = Field(
        default=None,
        description="One of: price_asc, price_desc, rating_desc, orders_desc, newest",
    )
    min_price: Optional[float] = Field(default=None, ge=0, description="Exclude results cheaper than this")
    max_price: Optional[float] = Field(default=None, ge=0, description="Exclude results pricier than this")
    min_rating: Optional[float] = Field(default=None, ge=0, le=5, description="Exclude results rated below this")
    in_stock_only: bool = Field(default=False, description="Exclude out-of-stock results")

    model_config = {
        "json_schema_extra": {
            "example": {
                "query": "wireless earbuds",
                "search_scope": "custom",
                "platforms": ["aliexpress", "amazon", "ebay"],
                "max_results": 200,
                "page": 1,
                "page_size": 50,
                "sort_by": "price_asc",
                "min_price": 5,
                "max_price": 50,
                "min_rating": 4,
                "in_stock_only": True,
            }
        }
    }


class ScrapedProduct(BaseModel):
    name: str
    price: Optional[float] = None
    currency: str = "USD"
    image_url: Optional[str] = None
    url: Optional[str] = None
    description: Optional[str] = None
    rating: Optional[float] = None
    reviews_count: Optional[int] = None
    orders_count: Optional[int] = None
    shipping_price: Optional[float] = None
    seller_name: Optional[str] = None
    in_stock: bool = True
    platform: str
    sku: Optional[str] = None
    raw_data: dict[str, Any] = Field(default_factory=dict)


class SearchProductsResponse(BaseModel):
    query: str
    total_results: int
    current_page: int
    total_pages: int
    has_next_page: bool
    results: list[ScrapedProduct]
    errors: dict[str, str] = Field(default_factory=dict, description="Per-platform errors, if any")
    platforms_searched: list[str] = Field(
        default_factory=list,
        description="The concrete platform names actually searched, after resolving search_scope "
                     "(e.g. every active platform, for scope='all')",
    )

    model_config = {
        "json_schema_extra": {
            "example": {
                "query": "wireless earbuds",
                "total_results": 1,
                "current_page": 1,
                "total_pages": 1,
                "has_next_page": False,
                "platforms_searched": ["aliexpress", "amazon", "ebay"],
                "results": [
                    {
                        "name": "Wireless Bluetooth Earbuds Pro",
                        "price": 19.99,
                        "currency": "USD",
                        "image_url": "https://example.com/image.jpg",
                        "url": "https://www.aliexpress.com/item/123456.html",
                        "description": None,
                        "rating": 4.5,
                        "reviews_count": 1200,
                        "orders_count": None,
                        "shipping_price": None,
                        "seller_name": None,
                        "in_stock": True,
                        "platform": "aliexpress",
                        "sku": None,
                        "raw_data": {},
                    }
                ],
                "errors": {"amazon": "HTTP 403"},
            }
        }
    }


# ─────────────────────────── Platforms ───────────────────────────

class ScraperType(str, Enum):
    built_in = "built_in"
    custom = "custom"


class PlatformConfig(BaseModel):
    """Optional scraping configuration, mainly for custom platforms."""

    search_url_template: Optional[str] = Field(
        default=None,
        description="URL template with a {query} placeholder, e.g. 'https://example.com/search?q={query}'. "
                     "If omitted, the platform's base URL is used with '?q=<query>'.",
    )
    selectors: dict[str, str] = Field(
        default_factory=dict,
        description="CSS selectors for scraping: 'item' (required to scrape) plus optional "
                     "'name', 'price', 'image', 'link', 'rating'.",
    )
    headers: dict[str, str] = Field(default_factory=dict, description="Extra HTTP headers to send")
    rate_limit_seconds: Optional[float] = Field(default=None, ge=0, description="Min seconds between requests")
    max_retries: Optional[int] = Field(default=None, ge=1, le=10)
    timeout: Optional[int] = Field(default=None, ge=1, le=120, description="Request timeout in seconds")

    model_config = {"extra": "allow"}


class PlatformCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=50, description="Unique platform identifier, e.g. 'shopify'")
    url: AnyHttpUrl = Field(..., description="Base URL of the platform/store")
    scraper_type: ScraperType = ScraperType.custom
    is_active: bool = True
    config: PlatformConfig = Field(default_factory=PlatformConfig)

    model_config = {
        "json_schema_extra": {
            "example": {
                "name": "my-shopify-store",
                "url": "https://my-store.myshopify.com",
                "scraper_type": "custom",
                "is_active": True,
                "config": {
                    "search_url_template": "https://my-store.myshopify.com/search?q={query}",
                    "selectors": {
                        "item": ".product-card",
                        "name": ".product-card__title",
                        "price": ".price",
                        "image": "img",
                        "link": "a",
                    },
                    "headers": {},
                    "rate_limit_seconds": 2.0,
                },
            }
        }
    }


class PlatformUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=50)
    url: Optional[AnyHttpUrl] = None
    scraper_type: Optional[ScraperType] = None
    is_active: Optional[bool] = None
    config: Optional[PlatformConfig] = None


class PlatformResponse(BaseModel):
    id: int
    name: str
    url: str
    scraper_type: str
    is_active: bool
    config: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime

    model_config = {"from_attributes": True}


class PlatformTestResponse(BaseModel):
    success: bool
    message: str
    results_count: int = 0
    sample_results: list[ScrapedProduct] = Field(default_factory=list)


# ─────────────────────────── AI (Ollama) ───────────────────────────

class AnalyzeProductRequest(BaseModel):
    name: str = Field(..., min_length=1)
    price: Optional[float] = None
    currency: str = "USD"
    description: Optional[str] = None
    rating: Optional[float] = None
    reviews_count: Optional[int] = None
    platform: Optional[str] = None

    model_config = {
        "json_schema_extra": {
            "example": {
                "name": "Wireless Bluetooth Earbuds Pro",
                "price": 19.99,
                "currency": "USD",
                "rating": 4.5,
                "platform": "aliexpress",
            }
        }
    }


class SummarizeProductsRequest(BaseModel):
    products: list[AnalyzeProductRequest] = Field(..., min_length=1)


class SummarizeProductsResponse(BaseModel):
    success: bool
    summary: Optional[str] = None
    message: Optional[str] = Field(default=None, description="Explanation when success is false")


# ─────────────────────────── Generic ───────────────────────────

class MessageResponse(BaseModel):
    success: bool
    message: str


class HealthResponse(BaseModel):
    status: str
    app_name: str
    version: str
    ollama_reachable: bool
