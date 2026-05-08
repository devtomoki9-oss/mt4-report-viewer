"""
Demo video generator for MT4 Report Viewer Pro.

Uses Playwright to record a WebM/MP4 demo video of the app.

Requirements:
  pip install playwright pillow python-dotenv
  playwright install chromium --with-deps
  (optional) ffmpeg in PATH for MP4 conversion

Usage:
  python scripts/create_demo_video.py
  python scripts/create_demo_video.py --url https://your-app.vercel.app --output demo.mp4

Env vars (scripts/twitter/.env or env):
  APP_URL        e.g. http://localhost:5173
  DEMO_EMAIL     demo account email
  DEMO_PASSWORD  demo account password
"""
from __future__ import annotations

import argparse
import logging
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

from dotenv import load_dotenv
from playwright.sync_api import sync_playwright, Page

logger = logging.getLogger(__name__)

DEMO_FILES = [
    Path(__file__).parent.parent / "public" / "demo" / "ScalpBot_Pro.json",
    Path(__file__).parent.parent / "public" / "demo" / "TrendEA_GBPUSD.json",
    Path(__file__).parent.parent / "public" / "demo" / "ManualTrader_JPY.json",
]

VIEWPORT = {"width": 1440, "height": 900}


# ---------------------------------------------------------------------------
# Smooth scroll helper
# ---------------------------------------------------------------------------

def smooth_scroll(page: Page, total_px: int, steps: int = 8, delay_ms: int = 120) -> None:
    step_px = total_px // steps
    for _ in range(steps):
        page.evaluate(f"window.scrollBy({{top: {step_px}, behavior: 'smooth'}})")
        page.wait_for_timeout(delay_ms)


def scroll_to_top(page: Page) -> None:
    page.evaluate("window.scrollTo({top: 0, behavior: 'smooth'})")
    page.wait_for_timeout(600)


def click_tab(page: Page, tab_key: str) -> bool:
    """Click a tab button by its text content (partial match)."""
    try:
        btn = page.locator("nav button").filter(has_text=tab_key).first
        if btn.count() > 0:
            btn.scroll_into_view_if_needed()
            btn.click()
            page.wait_for_timeout(1000)
            return True
    except Exception:
        pass
    # Fallback: header nav tabs (desktop)
    try:
        btn = page.locator("header nav button").filter(has_text=tab_key).first
        if btn.count() > 0:
            btn.click()
            page.wait_for_timeout(1000)
            return True
    except Exception:
        pass
    return False


# ---------------------------------------------------------------------------
# Scene 1: Landing page
# ---------------------------------------------------------------------------

def scene_landing(page: Page, app_url: str) -> None:
    logger.info("[Scene 1] Landing page")
    page.goto(app_url, wait_until="domcontentloaded", timeout=30000)
    page.wait_for_timeout(2000)

    scroll_to_top(page)
    page.wait_for_timeout(1500)

    # Scroll down slowly through the landing page
    smooth_scroll(page, 400, steps=6, delay_ms=150)
    page.wait_for_timeout(800)
    smooth_scroll(page, 500, steps=6, delay_ms=150)
    page.wait_for_timeout(800)
    smooth_scroll(page, 500, steps=6, delay_ms=150)
    page.wait_for_timeout(800)
    smooth_scroll(page, 400, steps=6, delay_ms=150)
    page.wait_for_timeout(1200)

    # Scroll back to top then click CTA
    scroll_to_top(page)
    page.wait_for_timeout(1000)


# ---------------------------------------------------------------------------
# Scene 2: Login
# ---------------------------------------------------------------------------

def scene_login(page: Page, email: str, password: str) -> bool:
    logger.info("[Scene 2] Login")

    # Click "Login" button on landing page
    try:
        login_btn = page.locator("button").filter(has_text="Login").first
        if login_btn.count() == 0:
            login_btn = page.locator("button").filter(has_text="ログイン").first
        if login_btn.count() > 0:
            login_btn.click()
            page.wait_for_timeout(1500)
    except Exception:
        pass

    # Wait for login form
    try:
        page.wait_for_selector("input[type='email']", timeout=10000)
    except Exception:
        logger.warning("Login form not found")
        return False

    page.wait_for_timeout(500)
    page.locator("input[type='email']").first.fill(email)
    page.wait_for_timeout(400)
    page.locator("input[type='password']").first.fill(password)
    page.wait_for_timeout(400)

    submit = page.locator("button[type='submit']").first
    if submit.count() > 0:
        submit.click()
    page.wait_for_timeout(3000)

    # Check if logged in (header appears)
    try:
        page.wait_for_selector("header", timeout=10000)
        page.wait_for_timeout(2000)
        logger.info("Login succeeded")
        return True
    except Exception:
        logger.warning("Login may have failed")
        return False


# ---------------------------------------------------------------------------
# Scene 3: Upload demo data
# ---------------------------------------------------------------------------

def scene_upload(page: Page) -> bool:
    logger.info("[Scene 3] Upload demo files")

    # Check if setup screen (upload zone) is visible
    upload_zone = page.locator("input[type='file'][accept*='.json']").first
    if upload_zone.count() == 0:
        # Data already loaded (e.g. Supabase sync)
        logger.info("Data already loaded, skipping upload")
        return True

    valid_files = [str(f) for f in DEMO_FILES if f.exists()]
    if not valid_files:
        logger.error("Demo files not found in public/demo/")
        return False

    logger.info("Uploading %d demo files", len(valid_files))
    upload_zone.set_input_files(valid_files)

    # Wait for data to load
    try:
        page.wait_for_selector("header nav button", timeout=12000)
        page.wait_for_timeout(2000)
        logger.info("Data loaded successfully")
        return True
    except Exception:
        logger.warning("Data loading timeout")
        return False


# ---------------------------------------------------------------------------
# Scene 4: Overview dashboard
# ---------------------------------------------------------------------------

def scene_overview(page: Page) -> None:
    logger.info("[Scene 4] Overview")

    # Switch language to English if possible
    try:
        lang_btn = page.locator("button[aria-label*='lang'], button[aria-label*='Lang']").first
        if lang_btn.count() == 0:
            lang_btn = page.locator("button").filter(has_text="EN").first
        if lang_btn.count() == 0:
            lang_btn = page.locator("button").filter(has_text="日").first
        if lang_btn.count() > 0:
            lang_btn.click()
            page.wait_for_timeout(800)
    except Exception:
        pass

    scroll_to_top(page)
    page.wait_for_timeout(1000)

    # Show stat cards
    page.wait_for_timeout(1500)

    # Scroll to equity chart
    smooth_scroll(page, 350, steps=5, delay_ms=140)
    page.wait_for_timeout(1200)

    # Scroll to open positions
    smooth_scroll(page, 300, steps=5, delay_ms=140)
    page.wait_for_timeout(1200)

    # Scroll to account list
    smooth_scroll(page, 300, steps=5, delay_ms=140)
    page.wait_for_timeout(1200)

    # Hover over sort buttons
    sort_btns = page.locator("button").filter(has_text="Profit").all()
    if sort_btns:
        sort_btns[0].hover()
        page.wait_for_timeout(600)

    scroll_to_top(page)
    page.wait_for_timeout(800)


# ---------------------------------------------------------------------------
# Scene 5: Account card detail
# ---------------------------------------------------------------------------

def scene_account_card(page: Page) -> None:
    logger.info("[Scene 5] Account card")

    scroll_to_top(page)

    # Scroll down to account cards
    smooth_scroll(page, 600, steps=6, delay_ms=130)
    page.wait_for_timeout(800)

    # Click first account card to expand
    try:
        cards = page.locator("[data-testid='account-card'], .cursor-pointer").all()
        if cards:
            cards[0].scroll_into_view_if_needed()
            page.wait_for_timeout(400)
            cards[0].click()
            page.wait_for_timeout(1000)
            smooth_scroll(page, 200, steps=4, delay_ms=130)
            page.wait_for_timeout(1000)
    except Exception:
        pass

    scroll_to_top(page)
    page.wait_for_timeout(600)


# ---------------------------------------------------------------------------
# Scene 6: Trades tab
# ---------------------------------------------------------------------------

def scene_trades(page: Page) -> None:
    logger.info("[Scene 6] Trades tab")

    for label in ["Trades", "全取引", "Trades"]:
        if click_tab(page, label):
            break

    scroll_to_top(page)
    page.wait_for_timeout(1200)

    # Type in search box if present
    try:
        search = page.locator("input[type='text'][placeholder*='search' i], input[placeholder*='Search' i], input[placeholder*='検索' i]").first
        if search.count() > 0:
            search.click()
            page.wait_for_timeout(400)
            search.fill("EURUSD")
            page.wait_for_timeout(1000)
            search.fill("")
            page.wait_for_timeout(600)
    except Exception:
        pass

    # Scroll through trade table
    smooth_scroll(page, 300, steps=5, delay_ms=130)
    page.wait_for_timeout(1000)
    scroll_to_top(page)
    page.wait_for_timeout(600)


# ---------------------------------------------------------------------------
# Scene 7: Calendar tab
# ---------------------------------------------------------------------------

def scene_calendar(page: Page) -> None:
    logger.info("[Scene 7] Calendar tab")

    for label in ["Calendar", "カレンダー"]:
        if click_tab(page, label):
            break

    scroll_to_top(page)
    page.wait_for_timeout(1500)

    # Hover over some calendar cells
    try:
        cells = page.locator("td, [role='gridcell']").all()
        for cell in cells[10:15]:
            cell.hover()
            page.wait_for_timeout(300)
    except Exception:
        pass

    page.wait_for_timeout(1000)
    scroll_to_top(page)
    page.wait_for_timeout(600)


# ---------------------------------------------------------------------------
# Scene 8: Insight tab
# ---------------------------------------------------------------------------

def scene_insight(page: Page) -> None:
    logger.info("[Scene 8] Insight tab")

    for label in ["Insight", "分析", "インサイト"]:
        if click_tab(page, label):
            break

    scroll_to_top(page)
    page.wait_for_timeout(1500)

    smooth_scroll(page, 400, steps=5, delay_ms=140)
    page.wait_for_timeout(1200)

    smooth_scroll(page, 300, steps=5, delay_ms=140)
    page.wait_for_timeout(1200)

    scroll_to_top(page)
    page.wait_for_timeout(600)


# ---------------------------------------------------------------------------
# Scene 9: Date range filter
# ---------------------------------------------------------------------------

def scene_date_filter(page: Page) -> None:
    logger.info("[Scene 9] Date range filter")

    for label in ["Overview", "サマリー"]:
        if click_tab(page, label):
            break

    scroll_to_top(page)
    page.wait_for_timeout(800)

    # Find date inputs
    try:
        date_inputs = page.locator("input[type='date']").all()
        if len(date_inputs) >= 2:
            date_inputs[0].fill("2026-04-01")
            page.wait_for_timeout(600)
            date_inputs[1].fill("2026-04-30")
            page.wait_for_timeout(1200)

            # Show April filtered results
            page.wait_for_timeout(1500)

            # Clear filter
            date_inputs[0].fill("")
            date_inputs[1].fill("")
            page.wait_for_timeout(800)
    except Exception:
        pass

    scroll_to_top(page)
    page.wait_for_timeout(600)


# ---------------------------------------------------------------------------
# Scene 10: Upgrade CTA
# ---------------------------------------------------------------------------

def scene_upgrade_cta(page: Page) -> None:
    logger.info("[Scene 10] Upgrade CTA")

    scroll_to_top(page)
    page.wait_for_timeout(800)

    # Open user menu
    try:
        user_menu = page.locator("button[aria-haspopup='menu'], button[aria-label*='@'], button[aria-label*='menu' i]").first
        if user_menu.count() > 0:
            user_menu.click()
            page.wait_for_timeout(1000)

            # Look for Upgrade button in the dropdown
            upgrade_btn = page.locator("button").filter(has_text="Upgrade").first
            if upgrade_btn.count() == 0:
                upgrade_btn = page.locator("button").filter(has_text="アップグレード").first
            if upgrade_btn.count() > 0:
                upgrade_btn.hover()
                page.wait_for_timeout(800)

            # Close menu without navigating
            page.keyboard.press("Escape")
            page.wait_for_timeout(600)
    except Exception:
        pass

    scroll_to_top(page)
    page.wait_for_timeout(1500)


# ---------------------------------------------------------------------------
# Main recording loop
# ---------------------------------------------------------------------------

def record_demo(app_url: str, email: str, password: str, output_path: str) -> bool:
    video_dir = tempfile.mkdtemp()
    logger.info("Recording video to temp dir: %s", video_dir)

    try:
        with sync_playwright() as pw:
            browser = pw.chromium.launch(
                headless=True,
                args=["--no-sandbox", "--disable-dev-shm-usage"],
            )
            context = browser.new_context(
                viewport=VIEWPORT,
                record_video_dir=video_dir,
                record_video_size=VIEWPORT,
                locale="en-US",
                timezone_id="Asia/Tokyo",
            )
            page = context.new_page()

            is_demo_mode = "demo" in app_url

            if is_demo_mode:
                # Scene 1: Show landing page first (strip demo param)
                landing_url = app_url.split("?")[0]
                scene_landing(page, landing_url)

                # Transition: navigate to demo dashboard
                logger.info("[Demo mode] navigating to %s", app_url)
                page.goto(app_url, wait_until="domcontentloaded", timeout=30000)
                page.wait_for_timeout(4000)  # wait for demo data to load

                # Verify data loaded
                try:
                    page.wait_for_selector("header", timeout=8000)
                    logger.info("Demo dashboard loaded")
                    has_dashboard = True
                except Exception:
                    logger.warning("Dashboard not detected in demo mode")
                    has_dashboard = False

                if has_dashboard:
                    # Brief pause on initial state
                    scroll_to_top(page)
                    page.wait_for_timeout(1500)

                    scene_overview(page)
                    scene_account_card(page)
                    scene_date_filter(page)
                    scene_trades(page)
                    scene_calendar(page)
                    scene_insight(page)

                    # Final: back to overview
                    for label in ["Overview", "サマリー"]:
                        if click_tab(page, label):
                            break
                    scroll_to_top(page)
                    page.wait_for_timeout(2000)

            else:
                # Scene 1: Landing page
                scene_landing(page, app_url)

                logged_in = False
                if email and password:
                    # Scene 2: Login
                    logged_in = scene_login(page, email, password)

                if logged_in:
                    # Scene 3: Upload if needed
                    scene_upload(page)

                    scene_overview(page)
                    scene_account_card(page)
                    scene_date_filter(page)
                    scene_trades(page)
                    scene_calendar(page)
                    scene_insight(page)
                    scene_upgrade_cta(page)

                    for label in ["Overview", "サマリー"]:
                        if click_tab(page, label):
                            break
                    scroll_to_top(page)
                    page.wait_for_timeout(2000)

            # Close — Playwright writes the video file
            context.close()
            browser.close()

        # Find the recorded WebM
        webm_files = list(Path(video_dir).glob("*.webm"))
        if not webm_files:
            logger.error("No video file found in %s", video_dir)
            return False

        webm_path = str(webm_files[0])
        logger.info("WebM recorded: %s (%.1f MB)",
                    webm_path, Path(webm_path).stat().st_size / 1024 ** 2)

        # Convert to MP4 if ffmpeg is available
        if output_path.endswith(".mp4") and shutil.which("ffmpeg"):
            logger.info("Converting to MP4 with ffmpeg...")
            result = subprocess.run(
                ["ffmpeg", "-y", "-i", webm_path,
                 "-c:v", "libx264", "-preset", "fast", "-crf", "22",
                 "-c:a", "aac", output_path],
                capture_output=True, text=True,
            )
            if result.returncode == 0:
                logger.info("MP4 saved: %s (%.1f MB)",
                            output_path, Path(output_path).stat().st_size / 1024 ** 2)
                return True
            else:
                logger.error("ffmpeg failed: %s", result.stderr[-500:])
                # Fall back to WebM
                output_path = output_path.replace(".mp4", ".webm")

        # Copy WebM as output
        shutil.copy(webm_path, output_path.replace(".mp4", ".webm") if not output_path.endswith(".webm") else output_path)
        final = output_path if output_path.endswith(".webm") else output_path.replace(".mp4", ".webm")
        logger.info("WebM saved: %s", final)
        return True

    finally:
        shutil.rmtree(video_dir, ignore_errors=True)


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(description="Record MT4 Report Viewer demo video")
    parser.add_argument("--url",    default="", help="App URL (default: APP_URL env var)")
    parser.add_argument("--email",  default="", help="Demo login email")
    parser.add_argument("--password", default="", help="Demo login password")
    parser.add_argument("--output", default="demo.mp4", help="Output file (mp4 or webm)")
    args = parser.parse_args()

    load_dotenv(Path(__file__).parent / "twitter" / ".env")

    app_url  = args.url      or os.getenv("APP_URL", "http://localhost:5173")
    email    = args.email    or os.getenv("DEMO_EMAIL", "")
    password = args.password or os.getenv("DEMO_PASSWORD", "")

    if not email or not password:
        logger.warning(
            "No DEMO_EMAIL/DEMO_PASSWORD — only landing page will be recorded.\n"
            "Set env vars or pass --email / --password to include the full dashboard demo."
        )

    success = record_demo(app_url, email, password, args.output)
    sys.exit(0 if success else 1)


if __name__ == "__main__":
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(message)s",
        handlers=[logging.StreamHandler(sys.stdout)],
    )
    main()
