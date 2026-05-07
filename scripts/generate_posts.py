"""Auto-generate X post templates and Qiita article templates from git commits using Claude API."""
from __future__ import annotations

import os
import re
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).parent.parent
TWITTER_POSTS_PATH  = REPO_ROOT / "scripts" / "twitter" / "posts.py"
QIITA_ARTICLES_PATH = REPO_ROOT / "scripts" / "qiita"   / "articles.py"

SKIP_PREFIXES   = ("chore:", "docs:", "style:", "test:", "ci:", "merge ")
SKIP_ONLY_DIRS  = {"scripts", ".github"}
MIN_ADDED_LINES = 20


def get_commit_info(commit_sha: str) -> tuple[str, str]:
    subject = subprocess.check_output(
        ["git", "log", "-1", "--format=%s", commit_sha],
        cwd=REPO_ROOT, text=True,
    ).strip()
    diff = subprocess.check_output(
        ["git", "show", commit_sha, "--stat", "--patch", "--format="],
        cwd=REPO_ROOT, text=True,
    )
    return subject, diff[:5000]


def should_skip(subject: str, diff: str) -> bool:
    for prefix in SKIP_PREFIXES:
        if subject.lower().startswith(prefix):
            return True

    files = re.findall(r"^\+\+\+ b/(.+)", diff, re.MULTILINE)
    dirs = {f.split("/")[0] for f in files}
    if dirs and dirs.issubset(SKIP_ONLY_DIRS):
        return True

    added = len(re.findall(r"^\+[^+]", diff, re.MULTILINE))
    if added < MIN_ADDED_LINES:
        return True

    return False


def call_claude(subject: str, diff: str) -> str:
    from anthropic import Anthropic

    client = Anthropic()
    prompt = f"""\
以下のgitコミット（MT4 Report Viewer という FX トレード管理Webアプリの開発）から、
開発進捗を発信するテンプレートを1本ずつ生成してください。

コミット件名: {subject}

変更差分（抜粋）:
{diff}

必ず以下の形式で出力してください（余分なテキストは不要）：

=== TWITTER_POST ===
（日本語。具体的な技術内容を1〜2文で説明。150字以内。絵文字1〜2個。ハッシュタグ3〜4個。#MT4 #FX #個人開発 などを含める）
=== END_TWITTER_POST ===

=== QIITA_ARTICLE ===
TITLE: （記事タイトル）
TAGS: タグ1,タグ2,タグ3,タグ4
BODY:
（Markdownの本文。## はじめに から始め ## まとめ で終わる。実際のコードブロックを含む。800字以上）
=== END_QIITA_ARTICLE ==="""

    message = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=2500,
        messages=[{"role": "user", "content": prompt}],
    )
    return message.content[0].text


def parse_response(text: str) -> dict:
    result: dict = {}

    m = re.search(
        r"=== TWITTER_POST ===\s*(.*?)\s*=== END_TWITTER_POST ===",
        text, re.DOTALL,
    )
    if m:
        result["twitter"] = m.group(1).strip()

    m = re.search(
        r"=== QIITA_ARTICLE ===\s*(.*?)\s*=== END_QIITA_ARTICLE ===",
        text, re.DOTALL,
    )
    if m:
        chunk = m.group(1).strip()
        title_m = re.search(r"TITLE:\s*(.+)", chunk)
        tags_m  = re.search(r"TAGS:\s*(.+)",  chunk)
        body_m  = re.search(r"BODY:\s*\n(.*)", chunk, re.DOTALL)
        if title_m and tags_m and body_m:
            tags = [{"name": t.strip()} for t in tags_m.group(1).split(",")]
            result["qiita"] = {
                "title": title_m.group(1).strip(),
                "tags":  tags,
                "body":  body_m.group(1).strip(),
            }

    return result


def append_twitter_post(post: str) -> None:
    content = TWITTER_POSTS_PATH.read_text(encoding="utf-8")
    post = post.replace('"""', "'''")
    new_entry = f'\n    """\\\n{post}\n""",\n'
    insert_pos = content.rfind("\n]")
    if insert_pos == -1:
        print("POSTS リストの末尾が見つかりません")
        return
    TWITTER_POSTS_PATH.write_text(
        content[:insert_pos] + new_entry + content[insert_pos:],
        encoding="utf-8",
    )
    print(f"X投稿テンプレート追加: {post[:60]}...")


def append_qiita_article(article: dict) -> None:
    content = QIITA_ARTICLES_PATH.read_text(encoding="utf-8")
    body = article["body"].replace('"""', "'''")
    title = article["title"].replace('"', '\\"')
    tags_lines = ",\n".join(
        f'            {{"name": "{t["name"]}"}}'
        for t in article["tags"]
    )
    new_entry = (
        f'    {{\n'
        f'        "title": "{title}",\n'
        f'        "tags": [\n{tags_lines},\n        ],\n'
        f'        "body": """\\\n{body}\n""",\n'
        f'    }},\n'
    )
    insert_pos = content.rfind("\n]")
    if insert_pos == -1:
        print("ARTICLES リストの末尾が見つかりません")
        return
    QIITA_ARTICLES_PATH.write_text(
        content[:insert_pos] + "\n" + new_entry + content[insert_pos:],
        encoding="utf-8",
    )
    print(f"Qiita記事テンプレート追加: {article['title']}")


def main() -> None:
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        print("ANTHROPIC_API_KEY が未設定のためスキップします")
        sys.exit(0)

    commit_sha = os.environ.get("GIT_COMMIT", "HEAD")
    print(f"対象コミット: {commit_sha}")

    subject, diff = get_commit_info(commit_sha)
    print(f"件名: {subject}")

    if should_skip(subject, diff):
        print("非実装コミットのためテンプレート生成をスキップします")
        sys.exit(0)

    print("Claude APIでテンプレートを生成中...")
    raw = call_claude(subject, diff)
    templates = parse_response(raw)

    if not templates:
        print("テンプレートのパースに失敗しました")
        print("レスポンス:", raw[:500])
        sys.exit(0)

    if "twitter" in templates:
        append_twitter_post(templates["twitter"])

    if "qiita" in templates:
        append_qiita_article(templates["qiita"])

    print("完了")


if __name__ == "__main__":
    main()
