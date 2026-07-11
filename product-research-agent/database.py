"""
SQLite database setup (SQLAlchemy) for the Product Research Agent.
"""
import json
from datetime import datetime, timezone

from sqlalchemy import create_engine, Column, Integer, String, Float, Boolean, Text, DateTime
from sqlalchemy.orm import sessionmaker, declarative_base, Session

from config import settings

connect_args = {"check_same_thread": False} if "sqlite" in settings.database_url else {}
engine = create_engine(settings.database_url, connect_args=connect_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Product(Base):
    """Products table — includes fields useful for dropshipping research."""

    __tablename__ = "products"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)

    # Core fields
    name = Column(String, nullable=False, index=True)
    price = Column(Float, nullable=True)
    currency = Column(String, default="USD")
    image_url = Column(String, nullable=True)
    description = Column(Text, nullable=True)
    rating = Column(Float, nullable=True)
    platform = Column(String, nullable=False, index=True)
    raw_data = Column(Text, nullable=True)  # JSON-encoded original scrape payload

    # Dropshipping-relevant fields
    url = Column(String, nullable=True)
    reviews_count = Column(Integer, nullable=True)
    orders_count = Column(Integer, nullable=True)
    shipping_price = Column(Float, nullable=True)
    seller_name = Column(String, nullable=True)
    category = Column(String, nullable=True)
    sku = Column(String, nullable=True, index=True)
    in_stock = Column(Boolean, default=True)
    stock_quantity = Column(Integer, nullable=True)
    ai_summary = Column(Text, nullable=True)

    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)

    def raw_data_dict(self) -> dict:
        if not self.raw_data:
            return {}
        try:
            return json.loads(self.raw_data)
        except (TypeError, ValueError):
            return {}


def init_db() -> None:
    """Create all tables if they don't already exist."""
    Base.metadata.create_all(bind=engine)


def get_db():
    """FastAPI dependency that yields a scoped DB session."""
    db: Session = SessionLocal()
    try:
        yield db
    finally:
        db.close()
