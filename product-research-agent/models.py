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
    platforms: list[str] = Field(
        default_factory=lambda: ["aliexpress", "amazon", "ebay"],
        description="Which platform names to search (must be registered and active — see GET /api/platforms)",
    )
    max_results: int = Field(default=10, ge=1, le=50, description="Max results per platform")

    model_config = {
        "json_schema_extra": {
            "example": {
                "query": "wireless earbuds",
                "platforms": ["aliexpress", "amazon", "ebay"],
                "max_results": 10,
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
    results: list[ScrapedProduct]
    errors: dict[str, str] = Field(default_factory=dict, description="Per-platform errors, if any")

    model_config = {
        "json_schema_extra": {
            "example": {
                "query": "wireless earbuds",
                "total_results": 1,
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


# ─────────────────────────── Products (DB) ───────────────────────────

class ProductCreate(BaseModel):
    name: str = Field(..., min_length=1)
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
    category: Optional[str] = None
    sku: Optional[str] = None
    in_stock: bool = True
    stock_quantity: Optional[int] = None
    platform: str
    raw_data: dict[str, Any] = Field(default_factory=dict)
    generate_ai_summary: bool = Field(
        default=False, description="If true, call Ollama to generate an AI summary before saving"
    )

    model_config = {
        "json_schema_extra": {
            "example": {
                "name": "Wireless Bluetooth Earbuds Pro",
                "price": 19.99,
                "currency": "USD",
                "image_url": "https://example.com/image.jpg",
                "url": "https://www.aliexpress.com/item/123456.html",
                "rating": 4.5,
                "reviews_count": 1200,
                "in_stock": True,
                "platform": "aliexpress",
                "generate_ai_summary": False,
            }
        }
    }


class ProductResponse(BaseModel):
    id: int
    name: str
    price: Optional[float] = None
    currency: str
    image_url: Optional[str] = None
    url: Optional[str] = None
    description: Optional[str] = None
    rating: Optional[float] = None
    reviews_count: Optional[int] = None
    orders_count: Optional[int] = None
    shipping_price: Optional[float] = None
    seller_name: Optional[str] = None
    category: Optional[str] = None
    sku: Optional[str] = None
    in_stock: bool
    stock_quantity: Optional[int] = None
    platform: str
    ai_summary: Optional[str] = None
    raw_data: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime
    updated_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class ProductListResponse(BaseModel):
    total: int
    products: list[ProductResponse]


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


# ─────────────────────────── Generic ───────────────────────────

class MessageResponse(BaseModel):
    success: bool
    message: str


class HealthResponse(BaseModel):
    status: str
    app_name: str
    version: str
    ollama_reachable: bool
