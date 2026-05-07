"""X (Twitter) text-only auto-posting script."""
from __future__ import annotations

import json
import logging
import os
import random
import sys
from datetime import date
from pathlib import Path

import tweepy
from dotenv import load_dotenv

from posts import POSTS

_handlers: list[logging.Handler] = [logging.StreamHandler(sys.stdout)]
_log_file = Path(__file__).parent / "post.log"
try:
    _handlers.append(logging.FileHandler(_log_file, encoding="utf-8"))
except Exception:
    pass

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
    handlers=_handlers,
)
logger = logging.getLogger(__name__)

HISTORY_PATH = Path(__file__).parent / "posted_history.json"


def _load_history() -> list[int]:
    if HISTORY_PATH.exists():
        try:
            return json.loads(HISTORY_PATH.read_text(encoding="utf-8"))
        except Exception:
            pass
    return []


def _save_history(history: list[int]) -> None:
    HISTORY_PATH.write_text(json.dumps(history), encoding="utf-8")


def _pick_post() -> tuple[int, str]:
    history = _load_history()
    all_indices = list(range(len(POSTS)))
    unused = [i for i in all_indices if i not in history]
    if not unused:
        history = []
        unused = all_indices
    idx = random.choice(unused)
    history.append(idx)
    _save_history(history)
    return idx, POSTS[idx]


def main() -> None:
    load_dotenv(Path(__file__).parent / ".env")

    api_key             = os.getenv("X_API_KEY", "")
    api_key_secret      = os.getenv("X_API_KEY_SECRET", "")
    access_token        = os.getenv("X_ACCESS_TOKEN", "")
    access_token_secret = os.getenv("X_ACCESS_TOKEN_SECRET", "")

    if not all([api_key, api_key_secret, access_token, access_token_secret]):
        logger.error(".env にキーが設定されていません")
        sys.exit(1)

    client = tweepy.Client(
        consumer_key=api_key,
        consumer_secret=api_key_secret,
        access_token=access_token,
        access_token_secret=access_token_secret,
    )

    idx, text = _pick_post()
    logger.info("投稿文 #%d を選択", idx)

    try:
        response = client.create_tweet(text=text)
        tweet_id = response.data["id"]
        logger.info("投稿成功: tweet_id=%s date=%s", tweet_id, date.today())
    except tweepy.TweepyException as e:
        msg = str(e)
        if "duplicate" in msg.lower():
            logger.warning("重複コンテンツのためスキップ: %s", e)
        else:
            logger.error("投稿失敗: %s", e)
            sys.exit(1)


if __name__ == "__main__":
    main()
