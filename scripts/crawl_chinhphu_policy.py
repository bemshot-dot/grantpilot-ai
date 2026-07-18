"""
Crawl + filter articles from xaydungchinhsach.chinhphu.vn category pages.

The category page loads additional articles via a JS "Xem thêm" (load more)
button rather than static pagination (?page=2), so a plain requests.get()
only captures the first batch rendered in the initial HTML. This script
uses a real (headless) browser via Playwright to click the button
repeatedly, then filters the collected URLs by keyword relevance.

Setup:
    pip install playwright beautifulsoup4 requests
    playwright install chromium

Usage:
    python crawl_chinhphu_policy.py
"""

import json
import re
import sys
import time

import requests
from bs4 import BeautifulSoup
from playwright.sync_api import sync_playwright

# Windows console defaults to cp1252, which can't encode most Vietnamese
# diacritics -> crashes print() mid-run. Force utf-8 with a safe fallback.
sys.stdout.reconfigure(encoding="utf-8", errors="replace")

# Change this to whichever category/sub-category is actually most relevant
# to GrantPilot, e.g.:
#   https://xaydungchinhsach.chinhphu.vn/phat-trien-kinh-te-tu-nhan-va-doanh-nghiep-dan-toc.htm
#   https://xaydungchinhsach.chinhphu.vn/phat-trien-kinh-te-tu-nhan-va-doanh-nghiep-dan-toc/kinh-te-tu-nhan.htm
CATEGORY_URL = "https://xaydungchinhsach.chinhphu.vn/phat-trien-kinh-te-tu-nhan-va-doanh-nghiep-dan-toc.htm"

# chinhphu.vn article URLs end in "-<long numeric id>.htm"; category/hub
# pages (e.g. /chinh-sach-moi.htm) don't have that numeric id, so this
# regex is a decent filter to separate "real articles" from nav links.
ARTICLE_URL_RE = re.compile(r"-\d{10,}\.htm$")

# Keywords used to decide whether an article is relevant to a startup /
# FDI / policy-incentive assistant. Tune this list to your actual scope —
# narrower keywords = fewer false positives, which matters more than recall
# for a focused demo.
KEYWORDS = [
    "doanh nghiệp", "khởi nghiệp", "đầu tư", "ưu đãi", "miễn thuế",
    "giảm thuế", "khoa học công nghệ", "đổi mới sáng tạo", "startup",
    "FDI", "hỗ trợ vốn", "quỹ phát triển", "chuyển đổi số", "công nghệ cao",
]

OUTPUT_ALL_URLS = "chinhphu_all_urls.json"
OUTPUT_RELEVANT = "chinhphu_relevant_articles.json"


def crawl_all_urls(category_url: str, max_clicks: int = 200,
                    wait_after_click: float = 1.2) -> set:
    """Click 'Xem thêm' repeatedly and collect every article URL that appears."""
    urls = set()
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.goto(category_url, wait_until="networkidle")

        stale_rounds = 0
        for i in range(max_clicks):
            links = page.eval_on_selector_all("a[href]", "els => els.map(e => e.href)")
            before = len(urls)
            urls.update(u for u in links if ARTICLE_URL_RE.search(u))

            if len(urls) == before:
                stale_rounds += 1
            else:
                stale_rounds = 0
            # stop if 3 clicks in a row add nothing new (button likely gone/disabled)
            if stale_rounds >= 3:
                break

            btn = page.get_by_text("Xem thêm", exact=False).first
            if btn.count() == 0 or not btn.is_visible():
                break
            try:
                btn.click(timeout=3000)
            except Exception:
                break
            time.sleep(wait_after_click)

        browser.close()
    return urls


def is_relevant(title: str, sapo: str) -> bool:
    text = f"{title} {sapo}".lower()
    return any(kw.lower() in text for kw in KEYWORDS)


def fetch_and_filter(urls: set, delay: float = 1.0) -> list:
    """Fetch each article, pull title + sapo, keep the relevant ones.

    NOTE: verify the CSS selectors below against the site's actual markup
    before trusting the output — article templates can vary by section.
    """
    headers = {"User-Agent": "Mozilla/5.0 (compatible; policy-research-bot/1.0)"}
    relevant = []
    for i, u in enumerate(sorted(urls), 1):
        try:
            r = requests.get(u, headers=headers, timeout=10)
            r.raise_for_status()
            soup = BeautifulSoup(r.text, "html.parser")

            title_tag = soup.find("h1")
            title = title_tag.get_text(strip=True) if title_tag else ""

            sapo_tag = soup.find("h2", class_="sapo") or soup.find("div", class_="sapo") \
                or soup.find(attrs={"class": re.compile("sapo|summary|desc", re.I)})
            sapo = sapo_tag.get_text(strip=True) if sapo_tag else ""

            if is_relevant(title, sapo):
                relevant.append({"url": u, "title": title, "sapo": sapo})
                print(f"[{i}/{len(urls)}] MATCH: {title}")
            else:
                print(f"[{i}/{len(urls)}] skip:  {title[:60]}")
        except Exception as e:
            print(f"[{i}/{len(urls)}] ERROR {u}: {e}")
        time.sleep(delay)  # be polite to a government site — don't hammer it
    return relevant


if __name__ == "__main__":
    print(f"Crawling {CATEGORY_URL} ...")
    all_urls = crawl_all_urls(CATEGORY_URL)
    print(f"Collected {len(all_urls)} article URLs")
    with open(OUTPUT_ALL_URLS, "w", encoding="utf-8") as f:
        json.dump(sorted(all_urls), f, ensure_ascii=False, indent=2)

    print("Filtering for relevance ...")
    relevant = fetch_and_filter(all_urls)
    with open(OUTPUT_RELEVANT, "w", encoding="utf-8") as f:
        json.dump(relevant, f, ensure_ascii=False, indent=2)

    print(f"\nDone. {len(relevant)}/{len(all_urls)} articles matched the keyword filter.")
    print(f"See {OUTPUT_ALL_URLS} and {OUTPUT_RELEVANT}")
