"""
Pydantic models used for API request/response validation and serialization.
"""
from datetime import datetime
from enum import Enum
from typing import Any, Optional

from pydantic import BaseModel, Field


class Platform(str, Enum):
    aliexpress = "aliexpress"
    amazon = "amazon"
    ebay = "ebay"


# ─────────────────────────── Search ───────────────────────────

class SearchProductsRequest(BaseModel):
    query: str = Field(..., min_length=1, description="Search keywords, e.g. 'wireless earbuds'")
    platforms: list[Platform] = Field(
        default_factory=lambda: [Platform.aliexpress, Platform.amazon, Platform.ebay],
        description="Which platforms to search",
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
    platform: Platform
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
    platform: Platform
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


# ─────────────────────────── Generic ───────────────────────────

class MessageResponse(BaseModel):
    success: bool
    message: str


class HealthResponse(BaseModel):
    status: str
    app_name: str
    version: str
    ollama_reachable: bool
