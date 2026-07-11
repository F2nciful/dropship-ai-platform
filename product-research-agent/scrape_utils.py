"""
Shared HTTP scraping utilities used by the built-in platform scrapers
(scraper_aliexpress.py / scraper_amazon.py / scraper_ebay.py): a rotating
desktop-browser user-agent pool, a per-scraper rate limiter, a retrying GET
with exponential backoff, and small text-parsing helpers (price/number/
currency) shared across all three sites' markup.

None of this bypasses CAPTCHA or bot-detection — it just avoids a single
static fingerprint tripping the most naive rate limiters. When a site
actively blocks automated traffic (Amazon in particular), the honest
behavior is to return an empty list, not to keep hammering it.
"""
import logging
import random
import re
import time
from urllib import robotparser
from urllib.parse import urlparse

import requests

logger = logging.getLogger("scraper.utils")

# A small pool of current desktop browser UAs across OS/browser combos. Real
# strings (not fabricated), current as of major versions in wide use in 2025.
USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36 Edg/123.0.0.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
]


def random_user_agent() -> str:
    return random.choice(USER_AGENTS)


class RateLimiter:
    """A minimum-interval limiter. Each scraper module keeps its own instance so one slow
    platform's backoff doesn't stall requests to another."""

    def __init__(self, min_interval_seconds: float):
        self.min_interval_seconds = min_interval_seconds
        self._last_request_time = 0.0

    def wait(self) -> None:
        elapsed = time.monotonic() - self._last_request_time
        remaining = self.min_interval_seconds - elapsed
        if remaining > 0:
            time.sleep(remaining)
        self._last_request_time = time.monotonic()


def new_session(extra_headers: dict | None = None) -> requests.Session:
    session = requests.Session()
    session.headers.update({
        "User-Agent": random_user_agent(),
        "Accept-Language": "en-US,en;q=0.9",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Encoding": "gzip, deflate, br",
        "Connection": "keep-alive",
        "Upgrade-Insecure-Requests": "1",
        **(extra_headers or {}),
    })
    return session


_robots_cache: dict[str, robotparser.RobotFileParser] = {}


def is_allowed_by_robots(url: str, user_agent: str = "*") -> bool:
    """
    Check a URL against the site's robots.txt (cached per host). Fails open
    (returns True) if robots.txt can't be fetched/parsed — an unreachable
    robots.txt shouldn't be the reason a search silently returns nothing.
    """
    parsed = urlparse(url)
    origin = f"{parsed.scheme}://{parsed.netloc}"
    parser = _robots_cache.get(origin)
    if parser is None:
        parser = robotparser.RobotFileParser()
        parser.set_url(f"{origin}/robots.txt")
        try:
            parser.read()
        except Exception as exc:  # noqa: BLE001 - robots.txt fetch failures must never block scraping
            logger.warning("Could not read robots.txt for %s: %s", origin, exc)
            _robots_cache[origin] = parser  # cache the empty parser too, avoid refetching every call
            return True
        _robots_cache[origin] = parser
    try:
        return parser.can_fetch(user_agent, url)
    except Exception:  # noqa: BLE001 - a malformed robots.txt must never block scraping
        return True


def fetch_with_retry(
    session: requests.Session,
    url: str,
    *,
    params: dict | None,
    limiter: RateLimiter,
    max_retries: int,
    timeout: float,
    platform_label: str,
    rotate_user_agent: bool = True,
) -> requests.Response | None:
    """GET with rate limiting and exponential backoff retries. Never raises — returns None
    (and logs why) on total failure so a single blocked platform never crashes a combined search."""
    last_error: Exception | None = None
    for attempt in range(1, max_retries + 1):
        try:
            limiter.wait()
            if rotate_user_agent:
                session.headers["User-Agent"] = random_user_agent()
            response = session.get(url, params=params, timeout=timeout)
            if response.status_code in (403, 429, 503):
                # Very likely a bot-detection / rate-limit page, not a transient network blip.
                logger.warning(
                    "%s responded HTTP %s (attempt %s/%s) — likely bot detection or rate limiting",
                    platform_label, response.status_code, attempt, max_retries,
                )
                last_error = requests.HTTPError(f"HTTP {response.status_code}")
                time.sleep(min(2 ** attempt, 8))
                continue
            response.raise_for_status()
            return response
        except requests.RequestException as exc:
            last_error = exc
            logger.warning("%s fetch attempt %s/%s failed: %s", platform_label, attempt, max_retries, exc)
            time.sleep(min(2 ** attempt, 8))
    logger.error("%s fetch failed after %s attempts: %s", platform_label, max_retries, last_error)
    return None


def parse_number(text: str | None) -> float | None:
    """Parse the first number out of a free-form string, e.g. '$19.99', '4.5 out of 5 stars', '1,234 sold'."""
    if not text:
        return None
    match = re.search(r"[\d,]+\.?\d*", text.replace(",", ""))
    if not match or match.group().strip(".") == "":
        return None
    return float(match.group())


def parse_int(text: str | None) -> int | None:
    value = parse_number(text)
    return int(value) if value is not None else None


CURRENCY_SYMBOLS = {
    "US $": "USD", "$": "USD", "€": "EUR", "£": "GBP", "¥": "JPY",
    "₹": "INR", "A$": "AUD", "C$": "CAD", "₩": "KRW", "R$": "BRL",
}


_ISO_CODE_PREFIX_RE = re.compile(r"^([A-Z]{3})\s?\d")


def detect_currency(text: str | None, default: str = "USD") -> str:
    if not text:
        return default
    stripped = text.strip()
    # Some sites prefix the price with a bare ISO code instead of a symbol
    # (e.g. "SAR 93.79", "AED 199") when the response is localized by IP.
    iso_match = _ISO_CODE_PREFIX_RE.match(stripped)
    if iso_match:
        return iso_match.group(1)
    for symbol, code in sorted(CURRENCY_SYMBOLS.items(), key=lambda kv: -len(kv[0])):
        if symbol in text:
            return code
    return default


def resolve_link(base_url: str, href: str | None) -> str | None:
    if not href:
        return None
    if href.startswith("http://") or href.startswith("https://"):
        return href
    if href.startswith("//"):
        return f"https:{href}"
    return base_url.rstrip("/") + "/" + href.lstrip("/")
