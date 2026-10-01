"""Offline display translations; financial rules and canonical API values stay unchanged."""
import json
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[2]
CATALOG = {}
for name in ("analysis", "workspace", "app"):
    CATALOG.update(json.loads((ROOT / "locales" / f"{name}.pl.json").read_text()))
TOKEN = re.compile(r"\{([A-Za-z]\w*)\}")


def _pattern(source, translated):
    names = []
    parts = []
    last = 0
    for match in TOKEN.finditer(source):
        parts += [re.escape(source[last:match.start()]), r"([\s\S]*?)"]
        names.append(match.group(1))
        last = match.end()
    parts += [re.escape(source[last:])]
    return (re.compile("^" + "".join(parts) + "$"), names, translated)


PATTERNS = [
    _pattern(source, translated)
    for source, translated in sorted(
        CATALOG.items(), key=lambda item: len(TOKEN.sub("", item[0])), reverse=True
    )
    if TOKEN.search(source)
]


def translate(source, language="en", depth=0):
    if language == "en" or not source or depth > 4:
        return source
    if re.fullmatch(r"[A-Za-z][A-Za-z0-9]*_[A-Za-z0-9_]+", source):
        return source
    key = " ".join(source.split())
    if key in CATALOG:
        return CATALOG[key]
    for regex, names, translated in PATTERNS:
        match = regex.fullmatch(key)
        if match:
            values = {
                name: translate(value, language, depth + 1)
                for name, value in zip(names, match.groups())
            }
            return TOKEN.sub(lambda token: values[token.group(1)], translated)
    if source.startswith("- "):
        return "- " + translate(source[2:], language, depth + 1)
    if "; " in source:
        return "; ".join(translate(part, language, depth + 1) for part in source.split("; "))
    return source


def translate_values(value, language):
    """Translate report prose in JSON values, preserving keys, numbers and identifiers."""
    if isinstance(value, str):
        return translate(value, language)
    if isinstance(value, list):
        return [translate_values(item, language) for item in value]
    if isinstance(value, dict):
        return {key: translate_values(item, language) for key, item in value.items()}
    return value
