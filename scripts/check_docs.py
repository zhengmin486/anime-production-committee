#!/usr/bin/env python3
"""Validate Markdown front matter, canonical_for uniqueness, and local links."""

from __future__ import annotations

import re
import sys
from pathlib import Path
from urllib.parse import unquote

ROOT = Path(__file__).resolve().parent.parent
SCAN_DIRS = [ROOT / "docs"]
SCAN_FILES = [ROOT / "README.md", ROOT / "CONTRIBUTING.md"]
REQUIRED_KEYS = ("title", "kind", "status", "owner", "updated", "canonical_for", "supersedes", "superseded_by")
ACTIVE_STATUSES = {"active", "accepted"}
LINK_RE = re.compile(r"\[[^\]]*\]\(([^)]+)\)")


def iter_markdown() -> list[Path]:
    files = [p for p in SCAN_FILES if p.exists()]
    for directory in SCAN_DIRS:
        files.extend(sorted(directory.rglob("*.md")))
    return files


def front_matter(text: str) -> dict[str, str] | None:
    if not text.startswith("---\n"):
        return None
    end = text.find("\n---\n", 4)
    if end == -1:
        return None
    fields: dict[str, str] = {}
    for line in text[4:end].splitlines():
        if ":" in line:
            key, value = line.split(":", 1)
            fields[key.strip()] = value.strip()
    return fields


def check_link(path: Path, target: str) -> str | None:
    if target.startswith(("http://", "https://", "mailto:", "data:")):
        return None
    raw = target.split("#", 1)[0].split("?", 1)[0]
    if not raw or raw.startswith("{{"):
        return None
    if "`" in raw or " " in raw or "{" in raw:
        return None
    if Path(raw).suffix.lower() not in {".md", ".json", ".png", ".jpg", ".jpeg", ".webp"}:
        return None
    decoded = unquote(raw)
    candidate = (path.parent / decoded).resolve()
    if not candidate.exists():
        candidate = (ROOT / decoded.lstrip("./")).resolve()
    if not candidate.exists():
        return f"broken link: {target}"
    return None


def main() -> int:
    errors: list[str] = []
    canonical: dict[str, Path] = {}
    for path in iter_markdown():
        text = path.read_text(encoding="utf-8")
        rel = path.relative_to(ROOT)
        fields = front_matter(text)
        is_doc = path.is_relative_to(ROOT / "docs")
        if is_doc and fields is None:
            errors.append(f"{rel}: missing front matter")
        if fields:
            if is_doc:
                missing = [key for key in REQUIRED_KEYS if key not in fields]
                if missing:
                    errors.append(f"{rel}: missing keys {', '.join(missing)}")
            if fields.get("status") in ACTIVE_STATUSES:
                key = fields.get("canonical_for", "")
                if not key or key == "TBD":
                    errors.append(f"{rel}: active file needs canonical_for")
                elif key in canonical:
                    errors.append(f"{rel}: duplicate active canonical_for '{key}' with {canonical[key]}")
                else:
                    canonical[key] = rel
        if fields and fields.get("status") == "archived":
            continue
        for target in LINK_RE.findall(text):
            problem = check_link(path, target)
            if problem:
                errors.append(f"{rel}: {problem}")

    if errors:
        print("Docs check failed:")
        for error in errors:
            print(f"- {error}")
        return 1
    print(f"Docs check passed: {len(iter_markdown())} files")
    return 0


if __name__ == "__main__":
    sys.exit(main())
