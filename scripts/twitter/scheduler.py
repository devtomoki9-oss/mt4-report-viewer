"""X auto-posting scheduler. Runs daily at 08:00 and 21:00 JST.
GIF demo post takes priority; falls back to text-only if it fails.
"""
from __future__ import annotations

import logging
import sys
import time
from pathlib import Path

import schedule
from dotenv import load_dotenv

sys.path.insert(0, str(Path(__file__).parent))
from gif_post import post_gif
from post import main as do_text_post

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
    handlers=[
        logging.FileHandler(Path(__file__).parent / "scheduler.log", encoding="utf-8"),
        logging.StreamHandler(sys.stdout),
    ],
)
logger = logging.getLogger(__name__)

load_dotenv(Path(__file__).parent / ".env")


def job() -> None:
    logger.info("定期投稿を開始します")
    posted = post_gif()
    if not posted:
        logger.info("GIF投稿失敗 → テキストのみ投稿にフォールバックします")
        try:
            do_text_post()
        except SystemExit:
            logger.error("テキスト投稿にも失敗しました")


schedule.every().day.at("08:00").do(job)
schedule.every().day.at("21:00").do(job)

logger.info("スケジューラー起動。毎日 08:00 と 21:00 に投稿します。")
logger.info("停止するにはこのウィンドウを閉じてください。")

while True:
    schedule.run_pending()
    time.sleep(30)
