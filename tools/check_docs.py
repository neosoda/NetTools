#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""Check current documentation links; versioned release archives are separate."""
import re
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parents[1]
CURRENT = [
    "README.md", "NOTICE.md", "NOTICE-Copie.md", "CONTRIBUTING.md",
    "SUPPORT.md", "SECURITY.md", "CODE_OF_CONDUCT.md", "THIRD_PARTY_NOTICES.md",
    "build/README.md", "docs/README.md", "docs/DEVELOPMENT.md",
    "docs/ARCHITECTURE.md", "docs/OPEN_SOURCE_AUDIT.md", "docs/GITHUB_PRESENTATION.md",
    "Notice_NetTools_page.html", "tools/notice_rendered.html",
]


class Document(HTMLParser):
    def __init__(self):
        super().__init__()
        self.links = []
        self.anchors = set()

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if attrs.get("id"):
            self.anchors.add(attrs["id"])
        for attribute in ("href", "src"):
            if attrs.get(attribute):
                self.links.append(attrs[attribute])


def markdown_anchors(content):
    anchors = set(re.findall(r'id="([^"]+)"', content))
    counts = {}
    for heading in re.findall(r"^#{1,6}\s+(.+)$", content, re.MULTILINE):
        slug = re.sub(r"[^\w\- ]", "", heading.lower()).replace(" ", "-")
        count = counts.get(slug, 0)
        counts[slug] = count + 1
        anchors.add(slug + (f"-{count}" if count else ""))
    return anchors


def main():
    errors = []
    checked = 0
    for name in CURRENT:
        source = ROOT / name
        content = source.read_text(encoding="utf-8-sig")
        document = Document()
        document.feed(content)
        if source.suffix == ".html":
            links = document.links
        else:
            links = re.findall(r"\]\(([^\s)]+)\)", content) + document.links
        for link in links:
            parsed = urlsplit(link)
            if parsed.scheme or parsed.netloc:
                continue
            target = source if not parsed.path else (source.parent / unquote(parsed.path)).resolve()
            checked += 1
            if not target.exists():
                errors.append(f"{name}: missing target {link}")
                continue
            if parsed.fragment and target.suffix in (".md", ".html"):
                target_content = target.read_text(encoding="utf-8-sig")
                if target.suffix == ".md":
                    anchors = markdown_anchors(target_content)
                else:
                    target_document = Document()
                    target_document.feed(target_content)
                    anchors = target_document.anchors
                if unquote(parsed.fragment) not in anchors:
                    errors.append(f"{name}: missing anchor {link}")
    if errors:
        raise SystemExit("\n".join(errors))
    print(f"Checked {checked} local links across {len(CURRENT)} current documents")


if __name__ == "__main__":
    main()
