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
    ollama_model: str = "llama3"
    ollama_timeout: int = 60

    # --- CORS (React frontend) ---
    cors_origins: str = "http://localhost:3000,http://127.0.0.1:3000"

    # --- Scraping ---
    scrape_rate_limit_seconds: float = 2.0
    scrape_max_retries: int = 3
    scrape_timeout: int = 15
    scrape_user_agent: str = (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    )

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
