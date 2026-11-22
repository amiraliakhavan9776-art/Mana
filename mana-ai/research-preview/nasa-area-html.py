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
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.stack = []
        self.pa = None
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
        if tag == "title":
            require(self.title is None, "NASA_MARKUP_INVALID")
            self.title = []
        if tag == "img" and not concealed:
            alt = norm([dict(attrs).get("alt") or ""])
            if alt.startswith("Label for "):
                self.math_active = alt == "Label for Math Fundamentals"
                self.math_sections += int(self.math_active)
        if tag == "a" and not concealed:
            require(self.a is None, "NASA_LINK_MALFORMED")
            self.a = ([v for k, v in attrs if k == "href"], [], self.getpos()[0], self.math_active)
        if tag == "p" and not concealed:
            self.pa = ([], self.getpos()[0])
        if tag in ("br", "wbr") and not concealed:
            self.handle_data(" ")
        if tag not in VOID:
            self.stack.append((tag, concealed))

    def handle_endtag(self, tag):
        match = next((i for i in range(len(self.stack)-1, -1, -1) if self.stack[i][0] == tag), -1)
        if match < 0:
            return
        removed = [t for t, _ in self.stack[match:]]
        del self.stack[match:]
        if "title" in removed and self.title is not None:
            self.titles.append(norm(self.title))
            self.title = None
        if "a" in removed and self.a is not None:
            hrefs, parts, start, in_math = self.a
            if in_math and norm(parts) == "Area":
                require(len(hrefs) == 1 and isinstance(hrefs[0], str), "NASA_LINK_MALFORMED")
                self.links.append({"href": hrefs[0], "label": "Area", "line": start})
            self.a = None
        if "p" in removed and self.pa is not None:
            parts, start = self.pa
            content = norm(parts)
            if content:
                self.paragraphs.append({"text": content, "line": start})
            self.pa = None

    def handle_data(self, data):
        require(not (self.stack and self.stack[-1][0] == "style" and data.strip()), "NASA_INLINE_STYLESHEET_UNSUPPORTED")
        if self.title is not None and self.stack and self.stack[-1][0] == "title":
            self.title.append(data)
        if any(h for _, h in self.stack):
            return
        if self.a is not None:
            self.a[1].append(data)
        if self.pa is not None:
            self.pa[0].append(data)


def main():
    require(len(sys.argv) == 2 and sys.argv[1] in ("index", "lesson"), "NASA_MODE_INVALID")
    resource.setrlimit(resource.RLIMIT_CPU, (5, 5))
    resource.setrlimit(resource.RLIMIT_AS, (256 * 1024 * 1024, 256 * 1024 * 1024))
    resource.setrlimit(resource.RLIMIT_CORE, (0, 0))
    data = sys.stdin.buffer.read(MAX + 1)
    require(0 < len(data) <= MAX and b"\x00" not in data, "NASA_HTML_BYTES_REJECTED")
    p = Document()
    p.feed(data.decode("utf-8", "strict"))
    p.close()
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
        result = {"clause": p.paragraphs[pos], "earlier": p.paragraphs[max(0,pos-4):pos]}
    print(json.dumps(result, ensure_ascii=False, separators=(",", ":")))


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        code = str(error)
        print(code if re.fullmatch(r"NASA_[A-Z_]{1,80}", code) else "NASA_EXTRACTION_FAILED", file=sys.stderr)
        sys.exit(1)
