"""Extract prepared Home Reading 3 pairs; originals are never modified."""
from html.parser import HTMLParser
from pathlib import Path
import json
import re

class Pairs(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.side = None
        self.depth = 0
        self.active = None
        self.pairs = {"en": {}, "ru": {}}
    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if attrs.get("id") in self.pairs:
            self.side = attrs["id"]
        if self.active is not None:
            self.depth += 1
        elif self.side and "s" in attrs.get("class", "").split() and "data-i" in attrs:
            self.active = attrs["data-i"]
            self.depth = 1
            self.pairs[self.side].setdefault(self.active, []).append("")
    def handle_data(self, data):
        if self.active is not None:
            self.pairs[self.side][self.active][-1] += data
    def handle_endtag(self, tag):
        if self.active is not None:
            self.depth -= 1
            if self.depth == 0:
                self.active = None

root = Path(__file__).resolve().parents[1]
parser = Pairs()
parser.feed((root / "references/html/home_reading_3.html").read_text(encoding="utf-8"))
def joined(parts):
    return re.sub(r"\s+", " ", " ".join(parts)).strip()
segments = []
for key, parts in parser.pairs["en"].items():
    segments.append({"id": int(key), "en": joined(parts), "ru": joined(parser.pairs["ru"][key])})
target = root / "prototype/src/fixture.json"
target.parent.mkdir(parents=True, exist_ok=True)
target.write_text(json.dumps(segments, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(f"Extracted {len(segments)} prepared pairs.")
