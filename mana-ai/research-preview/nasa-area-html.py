"""Bounded visible-markup extraction for two fixed NASA pages; no browser or network."""
from html.parser import HTMLParser
import json
import re
import resource
import sys
import unicodedata

VOID = set("area base br col embed hr img input link meta param source track wbr".split())
HIDDEN = set(("head script style template noscript svg math iframe object textarea "
              "select button audio video canvas details dialog").split())
BLOCK = set(("address article aside blockquote dd div dl dt fieldset footer form "
             "h1 h2 h3 h4 h5 h6 header hr li main nav ol p pre section table "
             "tbody td th thead tr ul").split())
SKIP_CONTEXT = set(("form nav aside blockquote footer header pre code samp ").split())
MAX = 384 * 1024


def norm(parts):
    return " ".join(unicodedata.normalize("NFKC", "".join(parts)).split())


def require(ok, code):
    if not ok:
        raise ValueError(code)


class Document(HTMLParser):
    def __init__(self, mode):
        super().__init__(convert_charrefs=True)
        self.mode = mode
        self.stack = []
        self.stack_ids = []
        self.layout = []
        self.layout_clean = True
        self.pa = None
        self.pa_anchor_uncertain = False
        self.a = None
        self.title = None
        self.titles = []
        self.links = []
        self.paragraphs = []
        self.bases = False
        self.nodes = 0
        self.math_active = False
        self.math_sections = 0

    def blocked(self, attrs):
        attrs = dict(attrs)
        style = re.sub(r"/\*.*?\*/", "", (attrs.get("style") or "").lower(), flags=re.S)
        classes = set((attrs.get("class") or "").lower().split())
        return ("hidden" in attrs or "inert" in attrs
                or (attrs.get("aria-hidden") or "").lower() == "true"
                or bool(classes & {"hidden", "d-none", "display-none", "sr-only", "visually-hidden", "offscreen"})
                or bool(re.search(r"(?:^|;)\s*(?:display\s*:\s*none\b|visibility\s*:\s*(?:hidden|collapse)\b|opacity\s*:\s*0(?:\.0*)?(?:\s|[;!]|$)|font-size\s*:\s*0(?:px|em|rem|%)?(?:\s|[;!]|$))", style)))

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)
        self.handle_endtag(tag)

    def handle_starttag(self, tag, attrs):
        self.nodes += 1
        require(len({k for k, _ in attrs}) == len(attrs), "NASA_MARKUP_INVALID")
        require(self.nodes <= 20000 and len(self.stack) <= 100, "NASA_MARKUP_BUDGET")
        if tag == "base" and any(k == "href" for k, _ in attrs):
            self.bases = True
        if tag in BLOCK and self.stack and any(t == "p" for t, _ in self.stack):
            self.handle_endtag("p")  # HTML implicitly closes older/open p tags here.
        concealed = self.blocked(attrs) or tag in HIDDEN or tag in SKIP_CONTEXT or any(h for _, h in self.stack)
        if self.mode == "lesson":
            if self.pa is not None and (concealed or (tag in VOID and tag not in ("br", "wbr"))):
                self.layout_clean = False
            elif self.pa is None and (concealed or tag not in ("p", "br", "wbr")):
                self.layout.append(None)  # No invisible jump over interstitial markup or content.
        if tag == "title":
            require(self.title is None, "NASA_MARKUP_INVALID")
            self.title = []
        if tag == "img" and not concealed:
            alt = norm([dict(attrs).get("alt") or ""])
            if alt.startswith("Label for "):
                new_math = alt == "Label for Math Fundamentals"
                if self.a and (self.math_active or new_math):
                    self.a["crossed_math"] = True
                self.math_active = new_math
                self.math_sections += int(new_math)
        if tag == "a" and self.mode == "lesson" and self.a is not None and self.pa is not None:
            raise ValueError("NASA_LINK_MALFORMED")
        if tag == "a" and concealed and self.mode == "index" and self.a is not None:
            self.a["nested_hidden"] = True
        if tag == "a" and not concealed:
            if self.a is not None:
                require(self.mode == "index" or self.pa is None, "NASA_LINK_MALFORMED")
                # Legacy pages can omit end tags on unrelated/name anchors.
                # Only the unrelated anchor is discarded; its descendants
                # (and their visibility/section context) are not reopened.
                depth = self.a["depth"]
                self.finish_anchor(explicit=False)
                del self.stack[depth]
                del self.stack_ids[depth]
            self.a = {"hrefs": [v for k, v in attrs if k == "href"], "parts": [],
                      "line": self.getpos()[0], "in_math": self.math_active,
                      "crossed_math": False, "nested_hidden": False, "depth": len(self.stack)}
        if tag == "p" and not concealed:
            self.pa = ([], self.getpos()[0])
            self.pa_anchor_uncertain = self.mode == "lesson" and self.a is not None
            self.layout_clean = True
        if tag in ("br", "wbr") and not concealed:
            self.handle_data(" ")
        if tag not in VOID:
            self.stack.append((tag, concealed))
            self.stack_ids.append(self.nodes)

    def handle_endtag(self, tag):
        match = next((i for i in range(len(self.stack)-1, -1, -1) if self.stack[i][0] == tag), -1)
        if match < 0:
            return
        removed = [t for t, _ in self.stack[match:]]
        paragraph_parent = self.stack_ids[match-1] if match else 0
        del self.stack[match:]
        del self.stack_ids[match:]
        if "title" in removed and self.title is not None:
            self.titles.append(norm(self.title))
            self.title = None
        if self.a is not None and self.a["depth"] >= match:
            self.finish_anchor(explicit=tag == "a" and self.a["depth"] == match)
        if "p" in removed and self.pa is not None:
            parts, start = self.pa
            content = norm(parts)
            if content:
                record = {"text": content, "line": start, "anchor_uncertain": self.pa_anchor_uncertain,
                          "layout_pos": len(self.layout)}
                self.paragraphs.append(record)
                if self.mode == "lesson":
                    self.layout.append((record, paragraph_parent) if not self.pa_anchor_uncertain and
                                       self.layout_clean and tag == "p" else None)
            elif self.mode == "lesson":
                self.layout.append(None)
            self.pa = None
        if self.mode == "lesson" and tag in BLOCK and tag != "p" and self.pa is None:
            self.layout.append(None)

    def finish_anchor(self, explicit):
        a, self.a = self.a, None
        if self.mode == "lesson" and self.pa is not None and not explicit:
            self.pa_anchor_uncertain = True
        label = norm(a["parts"])
        in_scope = a["in_math"] or a["crossed_math"]
        # Treat an Area-looking href as a potential target even if malformed
        # markup prevented its actual label from being collected.
        targetish = any(isinstance(href, str) and
                        re.search(r"(?:^|/)area\.html(?:[?#]|$)", href.strip(), re.I) for href in a["hrefs"])
        if self.mode == "index" and in_scope and (label == "Area" or targetish):
            require(explicit and not a["crossed_math"] and not a["nested_hidden"], "NASA_LINK_MALFORMED")
        if self.mode == "index" and a["in_math"] and label == "Area":
            require(len(a["hrefs"]) == 1 and isinstance(a["hrefs"][0], str), "NASA_LINK_MALFORMED")
            self.links.append({"href": a["hrefs"][0], "label": "Area", "line": a["line"]})

    def handle_comment(self, data):
        if self.mode == "lesson":
            if self.pa is not None:
                self.layout_clean = False
            else:
                self.layout.append(None)

    def handle_data(self, data):
        require(not (self.stack and self.stack[-1][0] == "style" and data.strip()), "NASA_INLINE_STYLESHEET_UNSUPPORTED")
        if self.title is not None and self.stack and self.stack[-1][0] == "title":
            self.title.append(data)
        if any(h for _, h in self.stack):
            return
        if self.a is not None:
            self.a["parts"].append(data)
        if self.pa is not None:
            self.pa[0].append(data)
        elif self.mode == "lesson" and data.strip():
            self.layout.append(None)


def main():
    require(len(sys.argv) == 2 and sys.argv[1] in ("index", "lesson"), "NASA_MODE_INVALID")
    resource.setrlimit(resource.RLIMIT_CPU, (5, 5))
    resource.setrlimit(resource.RLIMIT_AS, (256 * 1024 * 1024, 256 * 1024 * 1024))
    resource.setrlimit(resource.RLIMIT_CORE, (0, 0))
    data = sys.stdin.buffer.read(MAX + 1)
    require(0 < len(data) <= MAX and b"\x00" not in data, "NASA_HTML_BYTES_REJECTED")
    p = Document(sys.argv[1])
    p.feed(data.decode("utf-8", "strict"))
    p.close()
    if p.mode == "index" and p.a is not None:
        p.finish_anchor(explicit=False)
    require(not p.bases and len(p.titles) == 1, "NASA_MARKUP_INVALID")
    if sys.argv[1] == "index":
        require(p.titles == ["Index of Aerodynamics Slides"] and p.math_sections == len(p.links) == 1, "NASA_AREA_LINK_MISSING_OR_AMBIGUOUS")
        result = {**p.links[0], "section": "Math Fundamentals"}
    else:
        require(p.titles == ["Area"], "NASA_WRONG_LESSON")
        matches = [i for i, v in enumerate(p.paragraphs)
                   if re.search(r"The equation for the area of a trapezoid\b", v["text"], re.IGNORECASE)]
        require(len(matches) == 1, "NASA_TRAPEZOID_CLAUSE_MISSING_OR_AMBIGUOUS")
        pos = matches[0]
        require(not p.paragraphs[pos]["anchor_uncertain"], "NASA_LINK_MALFORMED")
        # A malformed anchor spanning a paragraph can never supply proof:
        # retain the position for ambiguity checks but do not read it as scope.
        earlier = [v for v in p.paragraphs[max(0,pos-4):pos] if not v["anchor_uncertain"]]
        candidate = p.paragraphs[pos]
        physical = candidate["layout_pos"]
        # Only this fixed sibling window is exposed. Empty, hidden, tainted,
        # or intervening material stays a barrier; don't bridge across it.
        window = p.layout[max(0,physical-3):physical+3]
        split = None
        split_prose = "The equation for the area of a trapezoid is one half the sum of the top t and bottom b times the height h;"
        if candidate["text"] == split_prose and physical >= 3 and len(window) == 6 and all(x is not None for x in window):
            if len({parent for _, parent in window}) == 1:
                split = [{"line": row["line"], "text": row["text"]} for row, _ in window]
        def public_record(row):
            return {k: v for k, v in row.items() if k != "layout_pos"}
        result = {"clause": public_record(candidate), "earlier": [public_record(v) for v in earlier]}
        if split is not None:
            result["split"] = split
    print(json.dumps(result, ensure_ascii=False, separators=(",", ":")))


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        code = str(error)
        print(code if re.fullmatch(r"NASA_[A-Z_]{1,80}", code) else "NASA_EXTRACTION_FAILED", file=sys.stderr)
        sys.exit(1)
