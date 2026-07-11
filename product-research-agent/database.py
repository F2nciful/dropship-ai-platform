"""
SQLite database setup (SQLAlchemy) for the Product Research Agent.

The `products` / `product_history` / `pricing_strategy` / `inventory_forecast`
tables are owned by manager_agent.py (the unified Manager Agent) — this module
only keeps the engine/session/Base plumbing plus the `platforms` registry,
which is orthogonal to product data and shared by both the raw search
endpoint (main.py) and the Manager Agent.
"""
import json
from datetime import datetime, timezone

from sqlalchemy import create_engine, Column, Integer, String, Boolean, Text, DateTime
from sqlalchemy.orm import sessionmaker, declarative_base, Session

from config import settings

connect_args = {"check_same_thread": False} if "sqlite" in settings.database_url else {}
engine = create_engine(settings.database_url, connect_args=connect_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class PlatformDB(Base):
    """
    Registry of e-commerce platforms the search endpoint can scrape — the three
    built-in ones (AliExpress/Amazon/eBay) are seeded on startup, and users can
    add their own custom platforms on top via the /api/platforms endpoints.
    """

    __tablename__ = "platforms"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    name = Column(String, nullable=False, unique=True, index=True)
    url = Column(String, nullable=False)
    scraper_type = Column(String, nullable=False, default="custom")  # "built_in" | "custom"
    is_active = Column(Boolean, default=True)
    config = Column(Text, nullable=True)  # JSON-encoded: selectors, headers, rate limit, etc.
    created_at = Column(DateTime, default=utcnow)

    def config_dict(self) -> dict:
        if not self.config:
            return {}
        try:
            return json.loads(self.config)
        except (TypeError, ValueError):
            return {}


BUILTIN_PLATFORMS = [
    {"name": "aliexpress", "url": "https://www.aliexpress.com"},
    {"name": "amazon", "url": "https://www.amazon.com"},
    {"name": "ebay", "url": "https://www.ebay.com"},
]


def init_db() -> None:
    """Create all tables if they don't already exist."""
    Base.metadata.create_all(bind=engine)


def seed_builtin_platforms() -> None:
    """Idempotently register the built-in scrapers as rows in the platforms table."""
    db: Session = SessionLocal()
    try:
        existing_names = {name for (name,) in db.query(PlatformDB.name).all()}
        for entry in BUILTIN_PLATFORMS:
            if entry["name"] in existing_names:
                continue
            db.add(PlatformDB(
                name=entry["name"],
                url=entry["url"],
                scraper_type="built_in",
                is_active=True,
                config="{}",
            ))
        db.commit()
    finally:
        db.close()


def get_db():
    """FastAPI dependency that yields a scoped DB session."""
    db: Session = SessionLocal()
    try:
        yield db
    finally:
        db.close()
