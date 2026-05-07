"""Qiita auto-posting script."""
from __future__ import annotations

import json
import logging
import os
import sys
import urllib.request
from pathlib import Path

from dotenv import load_dotenv

from articles import ARTICLES

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
logger = logging.getLogger(__name__)

QIITA_API = "https://qiita.com/api/v2/items"
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


def _pick_article() -> tuple[int, dict]:
    history = _load_history()
    all_indices = list(range(len(ARTICLES)))
    unused = [i for i in all_indices if i not in history]
    if not unused:
        history = []
        unused = all_indices
    idx = unused[0]  # post in order
    history.append(idx)
    _save_history(history)
    return idx, ARTICLES[idx]


def post_article(token: str, article: dict) -> dict:
    payload = json.dumps({
        "title":   article["title"],
        "body":    article["body"],
        "tags":    article["tags"],
        "private": False,
        "tweet":   True,
    }).encode("utf-8")

    req = urllib.request.Request(
        QIITA_API,
        data=payload,
        method="POST",
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type":  "application/json",
        },
    )
    with urllib.request.urlopen(req, timeout=15) as resp:
        return json.loads(resp.read())


def main() -> None:
    load_dotenv(Path(__file__).parent / ".env")
    token = os.getenv("QIITA_TOKEN", "")
    if not token:
        logger.error("QIITA_TOKEN が設定されていません")
        sys.exit(1)

    idx, article = _pick_article()
    logger.info("記事 #%d「%s」を投稿します", idx, article["title"])

    try:
        result = post_article(token, article)
        logger.info("投稿成功: url=%s", result.get("url"))
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        logger.error("投稿失敗: %s %s", e.code, body)
        sys.exit(1)
    except Exception as e:
        logger.error("投稿失敗: %s", e)
        sys.exit(1)


if __name__ == "__main__":
    main()
