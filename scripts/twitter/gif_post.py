"""Record an operation demo GIF of the app and post it to X.

Flow:
  1. Launch headless Chromium via Playwright
  2. Login with demo credentials
  3. Navigate through key screens, taking screenshots
  4. Stitch screenshots into an animated GIF (Pillow)
  5. Upload via X API v1.1 and tweet via v2

Env vars (scripts/twitter/.env):
  X_API_KEY, X_API_KEY_SECRET, X_ACCESS_TOKEN, X_ACCESS_TOKEN_SECRET
  APP_URL       - e.g. https://your-app.vercel.app
  DEMO_EMAIL    - test account email
  DEMO_PASSWORD - test account password
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
from playwright.sync_api import sync_playwright, Page, BrowserContext

logger = logging.getLogger(__name__)

FRAME_DELAY_MS = 700   # ms per frame in the GIF
GIF_WIDTH      = 960   # resize width
GIF_MAX_MB     = 14    # stay under X's 15 MB limit


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _shot(page: Page) -> Image.Image:
    return Image.open(io.BytesIO(page.screenshot(type="png"))).convert("RGB")


def _resize(img: Image.Image, width: int) -> Image.Image:
    return img.resize((width, int(img.height * width / img.width)), Image.LANCZOS)


def _scroll_and_shoot(page: Page, frames: list, steps: int = 4,
                      pixels: int = 250, delay: int = 700) -> None:
    for _ in range(steps):
        page.evaluate(f"window.scrollBy(0, {pixels})")
        page.wait_for_timeout(delay)
        frames.append(_shot(page))


def _click_tab(page: Page, label: str) -> bool:
    """Click a nav tab by its Japanese label. Returns True on success."""
    try:
        btn = page.locator("nav button").filter(has_text=label)
        if btn.count() > 0:
            btn.first.click()
            page.wait_for_timeout(1200)
            return True
    except Exception:
        pass
    return False


def _login(page: Page, app_url: str, email: str, password: str) -> bool:
    """Navigate to app and login. Returns True if login succeeded."""
    page.goto(app_url, wait_until="networkidle", timeout=30000)
    page.wait_for_timeout(1500)

    email_input = page.query_selector("input[type='email']")
    pass_input  = page.query_selector("input[type='password']")
    if not email_input or not pass_input:
        logger.warning("ログインフォームが見つかりません")
        return False

    email_input.fill(email)
    pass_input.fill(password)
    submit = page.query_selector("button[type='submit']")
    if submit:
        submit.click()

    # Wait for main content to appear (nav tab = logged in)
    try:
        page.wait_for_selector("nav button", timeout=12000)
        page.wait_for_load_state("networkidle")
        page.wait_for_timeout(2000)
        logger.info("ログイン成功")
        return True
    except Exception as e:
        logger.warning("ログイン待機タイムアウト: %s", e)
        return False


# ---------------------------------------------------------------------------
# Scenarios
# ---------------------------------------------------------------------------

def _scenario_overview(page: Page) -> list[Image.Image]:
    """Scroll through the summary dashboard."""
    frames: list[Image.Image] = []

    page.evaluate("window.scrollTo(0, 0)")
    page.wait_for_timeout(800)
    frames.append(_shot(page))

    _scroll_and_shoot(page, frames, steps=5, pixels=200, delay=700)

    # Scroll back to top
    page.evaluate("window.scrollTo(0, 0)")
    page.wait_for_timeout(600)
    frames.append(_shot(page))

    return frames


def _scenario_account_expand(page: Page) -> list[Image.Image]:
    """Click account cards to expand them and show the equity chart."""
    frames: list[Image.Image] = []

    # サマリータブに移動
    _click_tab(page, "サマリー")
    page.evaluate("window.scrollTo(0, 0)")
    page.wait_for_timeout(800)
    frames.append(_shot(page))

    # Find account cards (cursor-pointer divs = clickable card headers)
    cards = page.locator(".cursor-pointer").all()
    clicked = 0
    for card in cards[:3]:
        try:
            card.scroll_into_view_if_needed()
            card.click()
            page.wait_for_timeout(900)
            frames.append(_shot(page))
            clicked += 1
            if clicked >= 2:
                break
        except Exception:
            continue

    # Scroll down to see expanded content / charts
    _scroll_and_shoot(page, frames, steps=3, pixels=200, delay=700)

    return frames


def _scenario_trade_table(page: Page) -> list[Image.Image]:
    """Show the trade table tab and interact with filter dropdowns."""
    frames: list[Image.Image] = []

    # 全取引タブをクリック
    page.evaluate("window.scrollTo(0, 0)")
    page.wait_for_timeout(500)
    frames.append(_shot(page))

    if _click_tab(page, "全取引"):
        page.wait_for_timeout(800)
        frames.append(_shot(page))

        # Interact with the first filter dropdown
        selects = page.locator("select").all()
        if selects:
            selects[0].scroll_into_view_if_needed()
            frames.append(_shot(page))
            page.wait_for_timeout(500)

            # Open dropdown
            selects[0].select_option(index=1)
            page.wait_for_timeout(800)
            frames.append(_shot(page))

            # Reset dropdown
            page.wait_for_timeout(500)
            selects[0].select_option(index=0)
            page.wait_for_timeout(600)
            frames.append(_shot(page))

        # Scroll to show trade rows
        _scroll_and_shoot(page, frames, steps=2, pixels=200, delay=700)

    return frames


def _scenario_tabs_tour(page: Page) -> list[Image.Image]:
    """Navigate through all main tabs quickly."""
    frames: list[Image.Image] = []

    tab_labels = ["サマリー", "口座別成績", "全取引", "カレンダー"]
    for label in tab_labels:
        if _click_tab(page, label):
            page.evaluate("window.scrollTo(0, 0)")
            page.wait_for_timeout(600)
            frames.append(_shot(page))
            page.wait_for_timeout(800)
            frames.append(_shot(page))

    return frames


SCENARIOS = [
    _scenario_overview,
    _scenario_account_expand,
    _scenario_trade_table,
    _scenario_tabs_tour,
]

SCENARIO_CAPTIONS = {
    _scenario_overview:       "複数口座の成績を一画面で管理📊",
    _scenario_account_expand: "口座ごとのエクイティカーブを確認📈",
    _scenario_trade_table:    "取引履歴をフィルターで絞り込み🔍",
    _scenario_tabs_tour:      "サマリー・取引・カレンダーを一括管理📅",
}


# ---------------------------------------------------------------------------
# GIF generation
# ---------------------------------------------------------------------------

def _make_gif(frames: list[Image.Image], out_path: str) -> None:
    if not frames:
        raise ValueError("No frames captured")

    resized = [_resize(f, GIF_WIDTH) for f in frames]
    palette = [f.convert("P", palette=Image.ADAPTIVE, colors=200) for f in resized]

    palette[0].save(
        out_path,
        save_all=True,
        append_images=palette[1:],
        optimize=True,
        duration=FRAME_DELAY_MS,
        loop=0,
    )

    size_mb = Path(out_path).stat().st_size / (1024 ** 2)
    logger.info("GIF生成完了: %.1f MB (%d frames)", size_mb, len(frames))
    if size_mb > GIF_MAX_MB:
        logger.warning("GIFが %.1f MB 超です。フレーム数を減らしてください。", GIF_MAX_MB)


def _build_tweet_text(scenario_fn) -> str:
    caption = SCENARIO_CAPTIONS.get(scenario_fn, "MT4 Report Viewer デモ")
    return (
        f"MT4 Report Viewer — {caption}\n"
        "\n"
        "MT4/MT5のトレード成績をWebで管理できる無料ツールです。\n"
        "\n"
        "#MT4 #MT5 #FX #個人開発 #トレード管理"
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
    if not demo_email or not demo_password:
        logger.error(".env に DEMO_EMAIL / DEMO_PASSWORD が設定されていません")
        return False

    scenario_fn = random.choice(SCENARIOS)
    logger.info("シナリオ選択: %s", scenario_fn.__name__)

    with tempfile.NamedTemporaryFile(suffix=".gif", delete=False) as tmp:
        gif_path = tmp.name

    try:
        with sync_playwright() as pw:
            browser = pw.chromium.launch(headless=True)
            context: BrowserContext = browser.new_context(
                viewport={"width": 1280, "height": 800},
                locale="ja-JP",
                timezone_id="Asia/Tokyo",
            )
            page = context.new_page()

            if not _login(page, app_url, demo_email, demo_password):
                logger.error("ログインに失敗しました")
                context.close()
                browser.close()
                return False

            frames = scenario_fn(page)
            context.close()
            browser.close()

        if len(frames) < 2:
            logger.warning("フレームが少なすぎます (%d frames)", len(frames))
            return False

        _make_gif(frames, gif_path)

        # Upload via X API v1.1
        auth = tweepy.OAuth1UserHandler(
            api_key, api_key_secret, access_token, access_token_secret
        )
        api_v1 = tweepy.API(auth)
        media = api_v1.media_upload(filename=gif_path)

        client = tweepy.Client(
            consumer_key=api_key,
            consumer_secret=api_key_secret,
            access_token=access_token,
            access_token_secret=access_token_secret,
        )
        text = _build_tweet_text(scenario_fn)
        response = client.create_tweet(text=text, media_ids=[media.media_id])
        logger.info("GIF付き投稿成功: tweet_id=%s scenario=%s",
                    response.data["id"], scenario_fn.__name__)
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
