"""Fixed-profile INDOT HTML and PDF evidence extractor; never executes document content."""
import hashlib
from html.parser import HTMLParser
import json
import math
import re
import resource
import sys
import unicodedata

TITLE = "2026 Construction Procedures I"
SECTION = "Certified Technician Program Manuals"
HREF = "/dA/6c73715b2a/2026-Construction-Procedures-I.pdf?language_id=1"
PDF_SHA = "61cee6fc891b0121c424e3c9b8ee1610e87c06341c38c916123ac82850692968"
HEAD = "AREA OF A TRAPEZOID"
PAGE = 12
PDF_LIMIT = 8 * 1024 * 1024
INDEX_LIMIT = 1024 * 1024


def need(condition, code):
    if not condition:
        raise ValueError(code)


def norm(text):
    return " ".join(unicodedata.normalize("NFKC", text).split())


def digest(data):
    return hashlib.sha256(data).hexdigest()


class Manuals(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.h = None
        self.a = None
        self.active = False
        self.sections = 0
        self.matches = []

    def handle_starttag(self, tag, attrs):
        if re.fullmatch(r"h[1-6]", tag):
            self.active = False
            self.h = (tag, [])
        if tag == "a" and self.active:
            need(self.a is None, "INDOT_INDEX_MALFORMED")
            self.a = ([v for k, v in attrs if k == "href"], [], self.getpos()[0])

    def handle_data(self, data):
        if self.h is not None:
            self.h[1].append(data)
        if self.a is not None:
            self.a[1].append(data)

    def handle_endtag(self, tag):
        if self.h is not None and tag == self.h[0]:
            if tag == "h2" and norm("".join(self.h[1])) == SECTION:
                self.sections += 1
                self.active = True
            self.h = None
        if tag == "a" and self.a is not None:
            hrefs, parts, line = self.a
            if norm("".join(parts)) == TITLE:
                need(len(hrefs) == 1 and hrefs[0] == HREF, "INDOT_LINK_NOT_APPROVED")
                self.matches.append((hrefs[0], line))
            self.a = None


def index(data):
    parser = Manuals()
    parser.feed(data.decode("utf-8", "strict"))
    parser.close()
    need(parser.sections == len(parser.matches) == 1 and parser.a is None, "INDOT_LINK_MISSING_OR_AMBIGUOUS")
    href, line = parser.matches[0]
    return {"href": href, "label": TITLE, "section": SECTION, "indexLine": line}


def boxed(words, text):
    matched = [w for w in words if norm(w[4]) == text]
    need(len(matched) == 1, "INDOT_PDF_FORMULA_INCOMPLETE")
    need(all(math.isfinite(x) for x in matched[0][:4]), "INDOT_PDF_POSITION_INVALID")
    return tuple(round(x, 2) for x in matched[0][:4])


def extract(data):
    need(digest(data) == PDF_SHA and data.startswith(b"%PDF-"), "INDOT_PDF_REVISION_MISMATCH")
    try:
        import pymupdf
    except ImportError:
        raise ValueError("INDOT_PYMUPDF_REQUIRED") from None
    with pymupdf.open(stream=data, filetype="pdf") as doc:
        need(not doc.is_encrypted and len(doc) == 90, "INDOT_PDF_STRUCTURE_INVALID")
        p = doc[PAGE]
        h = p.search_for(HEAD)
        need(len(h) == 1, "INDOT_PDF_SECTION_MISSING_OR_AMBIGUOUS")
        bounds = (h[0].x0, h[0].y1, h[0].x0 + 350, h[0].y1 + 56)
        words = p.get_text("words", clip=bounds)
        equals = boxed(words, "AA=")
        numerator = boxed(words, "BB1+BB2")
        times = boxed(words, "×")
        height = boxed(words, "HH")
        den = boxed(words, "2")
        yc = lambda box: (box[1] + box[3]) / 2
        xc = lambda box: (box[0] + box[2]) / 2
        need(equals[2] < numerator[0] < numerator[2] < times[0] < times[2] < height[0]
             and numerator[0] < den[0] < den[2] < numerator[2] and abs(xc(numerator) - xc(den)) <= 2
             and numerator[3] < yc(equals) < den[1]
             and abs(yc(equals) - yc(times)) <= 1 and abs(yc(equals) - yc(height)) <= 1,
             "INDOT_PDF_FRACTION_LAYOUT_MISMATCH")
        plain = norm(p.get_text("text", sort=False))
        need(plain.count(HEAD) == 1 and any(re.search(r"(?:^|\s)1-3$", value) for value in
             (plain, norm(p.get_text("text", sort=True)))), "INDOT_PDF_PRINTED_PAGE_MISMATCH")
        section = plain.split(HEAD, 1)[1]
        expected = ("average width times the altitude.",
                    "sum of the bases, divided by two, times the height.")
        need(all(section.count(x) == 1 for x in expected), "INDOT_PDF_PROSE_MISMATCH")
        structure = {"numerator": {"tokens": ["B1", "+", "B2"], "box": numerator},
                     "denominator": {"value": 2, "box": den},
                     "multiplier": {"tokens": ["×", "H"], "opBox": times, "heightBox": height},
                     "equalsBox": equals}
        return {"pageIndex": PAGE, "printedPage": "1-3", "pdfSha256": digest(data),
                "pageTextSha256": digest(plain.encode("utf-8")),
                "proseSha256": digest("\n".join(expected).encode("utf-8")),
                "structure": structure, "extractorVersion": str(pymupdf.VersionBind)}


def main():
    need(len(sys.argv) == 2 and sys.argv[1] in ("index", "pdf"), "INDOT_MODE_INVALID")
    resource.setrlimit(resource.RLIMIT_CPU, (7, 7))
    resource.setrlimit(resource.RLIMIT_AS, (512 * 1024 * 1024, 512 * 1024 * 1024))
    resource.setrlimit(resource.RLIMIT_CORE, (0, 0))
    mode = sys.argv[1]
    limit = INDEX_LIMIT if mode == "index" else PDF_LIMIT
    data = sys.stdin.buffer.read(limit + 1)
    need(0 < len(data) <= limit, "INDOT_EXTRACTOR_INPUT_LIMIT")
    print(json.dumps(index(data) if mode == "index" else extract(data), ensure_ascii=False, separators=(",", ":")))


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        code = str(error)
        print(code if re.fullmatch(r"INDOT_[A-Z_]{1,64}", code) else "INDOT_EXTRACTION_FAILED", file=sys.stderr)
        sys.exit(1)
