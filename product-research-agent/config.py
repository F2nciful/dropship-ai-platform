"""
Configuration and settings for the Product Research Agent.
Values are loaded from environment variables / a .env file, with sane defaults.
"""
from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # --- App ---
    app_name: str = "Product Research Agent"
    app_version: str = "1.0.0"
    debug: bool = True
    host: str = "0.0.0.0"
    port: int = 8000

    # --- Database ---
    database_url: str = "sqlite:///./products.db"

    # --- Ollama (AI summarization) ---
    ollama_host: str = "127.0.0.1:11435"
    ollama_model: str = "mistral:latest"
    ollama_timeout: int = 60

    # --- CORS (React frontend) ---
    cors_origins: str = "http://localhost:3000,http://127.0.0.1:3000"

    # --- eBay Browse API ---
    # eBay's robots.txt explicitly disallows crawling its search results page
    # (Disallow: /sch/i.html?_nkw=), and it live-blocks non-browser traffic there
    # with a 403 regardless. eBay provides a free official Browse API for exactly
    # this use case instead — get a client ID/secret at developer.ebay.com (free
    # tier) and set them here or in .env. Without them, eBay search returns [].
    ebay_client_id: str = ""
    ebay_client_secret: str = ""
    ebay_marketplace_id: str = "EBAY_US"

    # --- Scraping ---
    scrape_rate_limit_seconds: float = 1.5
    scrape_max_retries: int = 3
    scrape_timeout: int = 30
    scrape_user_agent: str = (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    )
    scrape_max_pages: int = 3
    # Amazon renders search results behind heavy bot detection; when the plain HTTP
    # request comes back blocked/empty, optionally fall back to a headless-Chrome
    # (Selenium) render of the same page before giving up. Off by default since it
    # requires Chrome + the `selenium`/`webdriver-manager` packages to be installed.
    scrape_amazon_selenium_fallback: bool = True
    # If real scraping fails outright (blocked, network error, timeout — NOT "found
    # zero real results"), optionally return clearly-labeled placeholder listings
    # instead of nothing, so a demo/offline environment still has something to show.
    # These are never mixed silently into real results — every mock item is tagged
    # raw_data.mock = true and name-prefixed "[DEMO]" so they can never be mistaken
    # for real market data that a sourcing decision could be based on. Off by default.
    scrape_mock_fallback: bool = False

    @property
    def ollama_base_url(self) -> str:
        host = self.ollama_host
        if not host.startswith("http://") and not host.startswith("https://"):
            host = f"http://{host}"
        return host

    @property
    def cors_origins_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
