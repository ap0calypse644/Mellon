#!/usr/bin/env python3
"""Validate internal Markdown links in Mellon's current documentation.

No network, no installs, no GitHub API calls. This deliberately ignores
external URLs and only checks that local link targets exist. We don't
attempt to validate arbitrary GitHub Markdown fragment anchors.
"""
from __future__ import annotations

import pathlib
import re
import sys
from urllib.parse import unquote, urlparse

ROOT = pathlib.Path(__file__).resolve().parents[2]
DOCUMENTS = [
    ROOT / "README.md",
    ROOT / "CONTRIBUTING.md",
    ROOT / "SECURITY.md",
    *sorted((ROOT / "docs").glob("*.md")),
]
DOCUMENTS += [
    ROOT / ".github/pull_request_template.md",
    ROOT / ".github/ISSUE_TEMPLATE/bug_report.md",
    ROOT / ".github/ISSUE_TEMPLATE/feature_request.md",
]
LINK = re.compile(r"!?(?:\[[^\]]*\])\(([^)]+)\)")
BAD = []
CHECKED = 0

for source in DOCUMENTS:
    if not source.is_file():
        BAD.append(f"Missing required doc: {source.relative_to(ROOT)}")
        continue
    text = source.read_text(encoding="utf-8")
    # Code fences often contain sample Markdown deliberately pointing nowhere.
    text = re.sub(r"(?ms)^\s*\`{3}[^\n]*\n.*?^\s*\`{3}\s*$", "", text)
    for raw in LINK.findall(text):
        target = raw.strip()
        # GitHub Markdown allows a title following the local link.
        target = re.sub(r'\s+"[^"]*"\s*$', "", target)
        if target.startswith("<") and target.endswith(">"):
            target = target[1:-1]
        if not target or target.startswith("#"):
            continue
        parsed = urlparse(target)
        if parsed.scheme or parsed.netloc or target.startswith("//"):
            continue
        path = unquote(parsed.path)
        if not path:
            continue
        CHECKED += 1
        dest = (source.parent / path).resolve()
        try:
            dest.relative_to(ROOT)
        except ValueError:
            BAD.append(f"{source.relative_to(ROOT)}: link escapes repo: {raw}")
            continue
        if not dest.exists():
            BAD.append(f"{source.relative_to(ROOT)}: broken link: {raw}")

if BAD:
    for error in BAD:
        print("ERROR:", error, file=sys.stderr)
    raise SystemExit(f"Failed: {len(BAD)} invalid documentation links")

print(f"PASS docs: {len(DOCUMENTS)} files, {CHECKED} local links validated")
