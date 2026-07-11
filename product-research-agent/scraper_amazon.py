"""
Amazon product search scraper.

Amazon sits behind Akamai's bot manager: a plain `requests` GET to /s almost
always comes back as a 200 OK containing a JS "interstitial challenge" page
(a proof-of-work script, not real results) rather than an HTTP error — which
means retrying the plain request doesn't help, only *executing* the
challenge's JavaScript does. Confirmed live while building this scraper.

So the real pipeline here is: try the cheap plain-HTTP request first (it
occasionally does get through), and if that comes back empty or is
recognizably the challenge page, fall back to driving a real (headless)
Chrome via Selenium, which executes the challenge JS like a browser would.
The Selenium path is opt-in via `settings.scrape_amazon_selenium_fallback`
and degrades to an empty result list (never raises) if Chrome/selenium/
webdriver-manager aren't available in the environment.

Scraping Amazon search pages is against Amazon's Conditions of Use even
though it isn't blocked by robots.txt — this exists for personal/research use
against light query volume with real rate limiting, not for bulk harvesting.
"""
import logging
import time
from urllib.parse import quote

from bs4 import BeautifulSoup

import scrape_utils
from config import settings

logger = logging.getLogger("scraper.amazon")

SEARCH_URL = "https://www.amazon.com/s"

_limiter = scrape_utils.RateLimiter(settings.scrape_rate_limit_seconds)
_driver_path: str | None = None

CHALLENGE_MARKERS = ("bm-verify", "akam-logo", "captcha", "robot check", "/errors/validateCaptcha")


def _is_challenge_page(html: str) -> bool:
    lowered = html.lower()
    return any(marker.lower() in lowered for marker in CHALLENGE_MARKERS)


def _has_results(html: str) -> bool:
    return "data-component-type=\"s-search-result\"" in html or "data-component-type='s-search-result'" in html


def _get_driver_path() -> str | None:
    """Lazily resolve (and cache) the chromedriver path so repeated searches in the
    same process don't re-resolve/download it every time."""
    global _driver_path
    if _driver_path is not None:
        return _driver_path
    try:
        from webdriver_manager.chrome import ChromeDriverManager
    except ImportError:
        return None
    try:
        _driver_path = ChromeDriverManager().install()
    except Exception as exc:  # noqa: BLE001 - driver resolution can fail many ways (no network, no Chrome, ...)
        logger.warning("Could not resolve a chromedriver for the Amazon Selenium fallback: %s", exc)
        return None
    return _driver_path


def _launch_selenium_driver():
    """Launch a headless Chrome instance for the Amazon fallback. Returns None (never
    raises) if selenium isn't installed, Chrome isn't available, or launch fails."""
    try:
        from selenium import webdriver
        from selenium.webdriver.chrome.options import Options
        from selenium.webdriver.chrome.service import Service
    except ImportError:
        logger.info("selenium is not installed; skipping the Amazon browser fallback")
        return None

    driver_path = _get_driver_path()
    if driver_path is None:
        return None

    options = Options()
    options.add_argument("--headless=new")
    options.add_argument("--disable-gpu")
    options.add_argument("--no-sandbox")
    options.add_argument("--window-size=1366,900")
    options.add_argument(f"user-agent={scrape_utils.random_user_agent()}")
    options.add_experimental_option("excludeSwitches", ["enable-automation"])
    options.add_argument("--disable-blink-features=AutomationControlled")

    try:
        driver = webdriver.Chrome(service=Service(driver_path), options=options)
        driver.set_page_load_timeout(settings.scrape_timeout)
        return driver
    except Exception as exc:  # noqa: BLE001 - browser automation can fail in many environment-specific ways
        logger.warning("Could not launch headless Chrome for the Amazon fallback: %s", exc)
        return None


def _selenium_fetch_page(driver, query: str, page_num: int) -> str | None:
    url = f"{SEARCH_URL}?k={quote(query)}"
    if page_num > 1:
        url += f"&page={page_num}"
    try:
        _limiter.wait()
        driver.get(url)
        time.sleep(2.5)  # let the challenge JS (if any) resolve and lazy content settle
        return driver.page_source
    except Exception as exc:  # noqa: BLE001 - a single page failing must not break the whole search
        logger.warning("Amazon Selenium fetch failed for page %s: %s", page_num, exc)
        return None


def _parse_results(html: str, max_results: int) -> list[dict]:
    soup = BeautifulSoup(html, "html.parser")
    results: list[dict] = []

    for card in soup.select("[data-component-type='s-search-result']"):
        if len(results) >= max_results:
            break

        asin = card.get("data-asin") or None
        name_span = card.select_one("h2 span")
        h2 = card.select_one("h2")
        name = name_span.get_text(strip=True) if name_span else (h2.get("aria-label") if h2 else None)
        if not name:
            continue

        price_el = card.select_one(".a-price .a-offscreen")
        if price_el is None:
            # Multi-variant "See options" listings have no single displayed price — Amazon
            # instead shows a "starting from" price under a secondary-offer-recipe block.
            price_el = card.select_one("[data-cy='secondary-offer-recipe'] span.a-color-base")
        price_text = price_el.get_text(strip=True) if price_el else None
        image_el = card.select_one("img.s-image")
        rating_el = card.select_one("[aria-label*='out of 5 stars']")
        reviews_el = card.select_one("[aria-label*='ratings']")
        sponsored = bool(card.select_one(".puis-sponsored-label-text, [data-component-type='sp-sponsored-result']"))

        url = f"https://www.amazon.com/dp/{asin}" if asin else None
        if not url:
            link_el = card.select_one("a[href*='/dp/']")
            url = scrape_utils.resolve_link("https://www.amazon.com", link_el.get("href")) if link_el else None

        results.append({
            "name": name,
            "price": scrape_utils.parse_number(price_text),
            "currency": scrape_utils.detect_currency(price_text),
            "image_url": image_el.get("src") if image_el else None,
            "url": url,
            "description": None,
            "rating": scrape_utils.parse_number(rating_el.get("aria-label")) if rating_el else None,
            "reviews_count": scrape_utils.parse_int(reviews_el.get("aria-label")) if reviews_el else None,
            "orders_count": None,
            "shipping_price": None,
            "seller_name": "Amazon",
            "in_stock": True,
            "platform": "amazon",
            "sku": asin,
            "raw_data": {"source": "amazon", "asin": asin, "sponsored": sponsored},
        })

    return results


def search(query: str, max_results: int = 10) -> list[dict]:
    """
    Search Amazon for `query` and return up to `max_results` normalized product dicts,
    fetching additional result pages as needed (up to settings.scrape_max_pages). Never
    raises — returns whatever was collected (possibly []) on any failure or block.
    """
    if not scrape_utils.is_allowed_by_robots(SEARCH_URL):
        logger.warning("robots.txt currently disallows %s; skipping Amazon search", SEARCH_URL)
        return []

    session = scrape_utils.new_session()
    results: list[dict] = []
    seen_asins: set[str] = set()
    selenium_driver = None

    try:
        for page_num in range(1, settings.scrape_max_pages + 1):
            if len(results) >= max_results:
                break

            params = {"k": query}
            if page_num > 1:
                params["page"] = page_num

            html = None
            response = scrape_utils.fetch_with_retry(
                session, SEARCH_URL, params=params, limiter=_limiter,
                max_retries=1, timeout=settings.scrape_timeout, platform_label="Amazon",
            )
            if response is not None and not _is_challenge_page(response.text) and _has_results(response.text):
                html = response.text
            elif response is not None and _is_challenge_page(response.text):
                logger.info("Amazon served a bot-detection challenge page for page %s", page_num)

            if html is None and settings.scrape_amazon_selenium_fallback:
                if selenium_driver is None:
                    selenium_driver = _launch_selenium_driver()
                if selenium_driver is not None:
                    html = _selenium_fetch_page(selenium_driver, query, page_num)

            if not html:
                break

            page_items = []
            for item in _parse_results(html, max_results - len(results)):
                if item["sku"] and item["sku"] in seen_asins:
                    continue
                if item["sku"]:
                    seen_asins.add(item["sku"])
                page_items.append(item)

            if not page_items:
                break
            results.extend(page_items)
    finally:
        if selenium_driver is not None:
            selenium_driver.quit()

    logger.info("Amazon search for %r returned %s results", query, len(results))
    return results
