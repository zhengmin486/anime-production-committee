#!/usr/bin/env python3
"""Validate decision records, front matter, and local links in the docs tree."""

from __future__ import annotations

import re
import sys
from pathlib import Path
from urllib.parse import unquote

ROOT = Path(__file__).resolve().parent.parent
DOCS = ROOT / "docs"
SCAN_FILES = [ROOT / "README.md", ROOT / "CONTRIBUTING.md"]
STRICT_DIRS = [DOCS / "decisions", DOCS / "templates"]
SKIP_DIRS = [DOCS / "archive"]
REQUIRED_KEYS = ("title", "kind", "status", "owner", "updated", "canonical_for", "supersedes", "superseded_by")
ACTIVE_STATUSES = {"active", "accepted"}
LINK_RE = re.compile(r"\[[^\]]*\]\(([^)]+)\)")
ADR_NAME_RE = re.compile(r"^ADR-(\d{4})-[a-z0-9-]+\.md$")
ADR_REF_RE = re.compile(r"\bADR-(\d{4})\b")
LINK_SUFFIXES = {".md", ".json", ".png", ".jpg", ".jpeg", ".webp"}


def iter_markdown() -> list[Path]:
    files = [p for p in SCAN_FILES if p.exists()]
    for path in sorted(DOCS.rglob("*.md")):
        if any(path.is_relative_to(directory) for directory in SKIP_DIRS):
            continue
        files.append(path)
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
    if target.startswith(("http://", "https://", "mailto:", "data:", "#")):
        return None
    raw = target.split("#", 1)[0].split("?", 1)[0]
    if not raw or raw.startswith("{{") or any(ch in raw for ch in "` {}<>|"):
        return None
    if Path(raw).suffix.lower() not in LINK_SUFFIXES:
        return None
    decoded = unquote(raw)
    if (path.parent / decoded).exists():
        return None
    if (ROOT / decoded.lstrip("./")).exists():
        return None
    return f"broken link: {target}"


def main() -> int:
    errors: list[str] = []
    canonical: dict[str, Path] = {}
    adr_numbers: dict[str, Path] = {}

    for path in iter_markdown():
        text = path.read_text(encoding="utf-8")
        rel = path.relative_to(ROOT)
        strict = any(path.is_relative_to(directory) for directory in STRICT_DIRS)
        fields = front_matter(text)
        if strict and fields is None:
            errors.append(f"{rel}: missing front matter")
        if fields:
            if strict:
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
        if path.parent == DOCS / "decisions" and path.name.startswith("ADR-"):
            match = ADR_NAME_RE.match(path.name)
            if not match:
                errors.append(f"{rel}: ADR filename must look like ADR-0001-kebab-topic.md")
            elif match.group(1) in adr_numbers:
                errors.append(f"{rel}: duplicate ADR number with {adr_numbers[match.group(1)]}")
            else:
                adr_numbers[match.group(1)] = rel
        for target in LINK_RE.findall(text):
            problem = check_link(path, target)
            if problem:
                errors.append(f"{rel}: {problem}")

    for path in sorted((DOCS / "decisions").glob("ADR-*.md")):
        text = path.read_text(encoding="utf-8")
        for ref in ADR_REF_RE.findall(text):
            if not list((DOCS / "decisions").glob(f"ADR-{ref}-*.md")):
                errors.append(f"{path.relative_to(ROOT)}: references unknown ADR-{ref}")

    if errors:
        print("Docs check failed:")
        for error in errors:
            print(f"- {error}")
        return 1
    print(f"Docs check passed: {len(iter_markdown())} files, {len(adr_numbers)} ADR")
    return 0


if __name__ == "__main__":
    sys.exit(main())
