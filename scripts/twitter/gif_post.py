"""Record an operation demo GIF of the app and post it to X.

Flow:
  1. Launch a headless Chromium browser via Playwright
  2. Navigate through key app screens, taking screenshots
  3. Stitch screenshots into an animated GIF (Pillow)
  4. Upload GIF via X API v1.1 and tweet via v2

Env vars required (in .env):
  X_API_KEY, X_API_KEY_SECRET, X_ACCESS_TOKEN, X_ACCESS_TOKEN_SECRET
  APP_URL        - production or staging URL (e.g. https://your-app.vercel.app)
  DEMO_EMAIL     - test account email
  DEMO_PASSWORD  - test account password
"""
from __future__ import annotations

import io
import logging
import os
import random
import sys
import tempfile
from pathlib import Path

import tweepy
from dotenv import load_dotenv
from PIL import Image
from playwright.sync_api import sync_playwright, Page

logger = logging.getLogger(__name__)

FRAME_DELAY_MS = 600  # milliseconds per frame in the GIF
GIF_WIDTH = 900       # resize width (height is proportional)
GIF_MAX_MB = 14       # stay under X's 15 MB GIF limit


# ---------------------------------------------------------------------------
# Recording scenarios — each returns a list of PIL Image frames
# ---------------------------------------------------------------------------

def _scenario_dashboard(page: Page, app_url: str) -> list[Image.Image]:
    """Show the main account dashboard overview."""
    frames: list[Image.Image] = []

    page.goto(app_url, wait_until="networkidle")
    page.wait_for_timeout(2000)
    frames.append(_shot(page))

    # Scroll down slowly to reveal account cards
    for _ in range(4):
        page.evaluate("window.scrollBy(0, 220)")
        page.wait_for_timeout(600)
        frames.append(_shot(page))

    return frames


def _scenario_equity_chart(page: Page, app_url: str) -> list[Image.Image]:
    """Expand the equity curve chart for an account."""
    frames: list[Image.Image] = []

    page.goto(app_url, wait_until="networkidle")
    page.wait_for_timeout(2000)
    frames.append(_shot(page))

    # Click the first account card to expand details
    card = page.query_selector("[data-testid='account-card'], .account-card, [class*='AccountCard']")
    if card:
        card.click()
        page.wait_for_timeout(1000)
        frames.append(_shot(page))
        page.wait_for_timeout(500)
        frames.append(_shot(page))

    # Scroll to chart area
    chart = page.query_selector("canvas, [class*='EquityChart'], [class*='chart']")
    if chart:
        chart.scroll_into_view_if_needed()
        page.wait_for_timeout(800)
        frames.append(_shot(page))
        page.wait_for_timeout(500)
        frames.append(_shot(page))

    return frames


def _scenario_trade_table(page: Page, app_url: str) -> list[Image.Image]:
    """Show the trade table with the search filter in action."""
    frames: list[Image.Image] = []

    page.goto(app_url, wait_until="networkidle")
    page.wait_for_timeout(2000)
    frames.append(_shot(page))

    # Find and click the trade table tab if it exists
    tab = page.query_selector("button:has-text('取引'), button:has-text('Trade'), [role='tab']")
    if tab:
        tab.click()
        page.wait_for_timeout(1000)
        frames.append(_shot(page))

    # Type in a search box if present
    search = page.query_selector("input[placeholder*='検索'], input[placeholder*='search'], input[placeholder*='Search']")
    if search:
        search.click()
        page.wait_for_timeout(300)
        for char in "USDJPY":
            search.type(char, delay=80)
        page.wait_for_timeout(800)
        frames.append(_shot(page))
        page.wait_for_timeout(500)
        frames.append(_shot(page))

    return frames


SCENARIOS = [
    _scenario_dashboard,
    _scenario_equity_chart,
    _scenario_trade_table,
]

SCENARIO_CAPTIONS = {
    _scenario_dashboard:    "複数口座を一画面で管理📊",
    _scenario_equity_chart: "エクイティカーブをリアルタイム表示📈",
    _scenario_trade_table:  "取引履歴テーブルで素早く検索🔍",
}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _shot(page: Page) -> Image.Image:
    data = page.screenshot(type="png")
    return Image.open(io.BytesIO(data)).convert("RGB")


def _resize(img: Image.Image, width: int) -> Image.Image:
    ratio = width / img.width
    return img.resize((width, int(img.height * ratio)), Image.LANCZOS)


def _make_gif(frames: list[Image.Image], out_path: str) -> None:
    if not frames:
        raise ValueError("No frames captured")

    resized = [_resize(f, GIF_WIDTH) for f in frames]

    # Convert to P mode (palette) for smaller file size
    palette_frames = [f.convert("P", palette=Image.ADAPTIVE, colors=256) for f in resized]

    palette_frames[0].save(
        out_path,
        save_all=True,
        append_images=palette_frames[1:],
        optimize=True,
        duration=FRAME_DELAY_MS,
        loop=0,
    )

    size_mb = Path(out_path).stat().st_size / (1024 ** 2)
    logger.info("GIF生成完了: %.1f MB (%d frames)", size_mb, len(frames))
    if size_mb > GIF_MAX_MB:
        logger.warning("GIFが %.1f MB を超えています。フレーム数を減らしてください。", GIF_MAX_MB)


def _build_tweet_text(scenario_fn) -> str:
    caption = SCENARIO_CAPTIONS.get(scenario_fn, "MT4 Report Viewer デモ")
    return (
        f"MT4 Report Viewer — {caption}\n"
        f"\n"
        f"MT4/MT5のトレード成績をWebで管理できる無料ツールです。\n"
        f"\n"
        f"#MT4 #MT5 #FX #個人開発 #トレード管理"
    )


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def post_gif() -> bool:
    load_dotenv(Path(__file__).parent / ".env")

    api_key             = os.getenv("X_API_KEY", "")
    api_key_secret      = os.getenv("X_API_KEY_SECRET", "")
    access_token        = os.getenv("X_ACCESS_TOKEN", "")
    access_token_secret = os.getenv("X_ACCESS_TOKEN_SECRET", "")
    app_url             = os.getenv("APP_URL", "")
    demo_email          = os.getenv("DEMO_EMAIL", "")
    demo_password       = os.getenv("DEMO_PASSWORD", "")

    if not all([api_key, api_key_secret, access_token, access_token_secret]):
        logger.error(".env にX APIキーが設定されていません")
        return False

    if not app_url:
        logger.error(".env に APP_URL が設定されていません")
        return False

    scenario_fn = random.choice(SCENARIOS)
    logger.info("シナリオ選択: %s", scenario_fn.__name__)

    with tempfile.NamedTemporaryFile(suffix=".gif", delete=False) as tmp:
        gif_path = tmp.name

    try:
        with sync_playwright() as pw:
            browser = pw.chromium.launch(headless=True)
            context = browser.new_context(
                viewport={"width": 1280, "height": 800},
                locale="ja-JP",
            )
            page = context.new_page()

            # Login if credentials are provided
            if demo_email and demo_password:
                page.goto(app_url, wait_until="networkidle")
                page.wait_for_timeout(1500)

                email_input = page.query_selector("input[type='email']")
                pass_input  = page.query_selector("input[type='password']")
                if email_input and pass_input:
                    email_input.fill(demo_email)
                    pass_input.fill(demo_password)
                    submit = page.query_selector("button[type='submit']")
                    if submit:
                        submit.click()
                        page.wait_for_timeout(3000)

            frames = scenario_fn(page, app_url)
            context.close()
            browser.close()

        if not frames:
            logger.warning("フレームが取得できませんでした")
            return False

        _make_gif(frames, gif_path)

        # Upload via X API v1.1 (required for media)
        auth = tweepy.OAuth1UserHandler(
            api_key, api_key_secret, access_token, access_token_secret
        )
        api_v1 = tweepy.API(auth)
        media = api_v1.media_upload(filename=gif_path)
        media_id = media.media_id

        client = tweepy.Client(
            consumer_key=api_key,
            consumer_secret=api_key_secret,
            access_token=access_token,
            access_token_secret=access_token_secret,
        )
        text = _build_tweet_text(scenario_fn)
        response = client.create_tweet(text=text, media_ids=[media_id])
        tweet_id = response.data["id"]

        logger.info("GIF付き投稿成功: tweet_id=%s scenario=%s", tweet_id, scenario_fn.__name__)
        return True

    except Exception as e:
        logger.error("GIF付き投稿失敗: %s", e)
        return False
    finally:
        Path(gif_path).unlink(missing_ok=True)


if __name__ == "__main__":
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(message)s",
        handlers=[logging.StreamHandler(sys.stdout)],
    )
    success = post_gif()
    sys.exit(0 if success else 1)
