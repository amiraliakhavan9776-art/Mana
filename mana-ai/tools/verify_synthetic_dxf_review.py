"""Independent finite verifier: raw pinned DXFs, drawn SVG geometry and exact review CSV."""
import csv
from decimal import Decimal
from hashlib import sha256
from io import StringIO
import json
from pathlib import Path
import re
import sys
import xml.etree.ElementTree as ET

BASE = Path(__file__).resolve().parents[1] / "examples" / "synthetic-aec-dxf"
SOURCE = {
    "FLOOR": ("floor-r1-r2.dxf", "4b6e6019945ee748fbd42a12daad06d9a91b3d5e790530f8dea089138efa87bf"),
    "R1": ("south-facade-r1.dxf", "2ea9e764f5747dea78c04b0eab27f0b4da789aa0ab78b8dd9b08afe85986994b"),
    "R2": ("south-facade-r2.dxf", "381b2c09208534b55c649459305c48de047ce4c8f85b3e740d9a27d60f03effa"),
}
CSV_FIELDS = ["artifact_id", "classification", "record_type", "revision", "quantity_id", "value_m2", "value_mm2",
              "geometry_unit", "source_refs", "dxf_report_sha256", "revision_impact_sha256"]
SV = "{http://www.w3.org/2000/svg}"
CSV_ID = "SYNTHETIC-REVIEW-QTY-R1-R2"
SVG_ID = "SYNTHETIC-REVIEW-ELEV-R1-R2"
AREA_IDS = ("FLOOR.GROSS", "SOUTH.GROSS", "SOUTH.OPENING.21", "SOUTH.OPENING.22", "SOUTH.DEDUCTIONS", "SOUTH.NET")


def need(ok, code):
    if not ok:
        raise ValueError(code)


def sha(raw):
    return sha256(raw).hexdigest()


def bounded(file, limit):
    with file.open("rb") as f:
        raw = f.read(limit + 1)
    need(0 < len(raw) <= limit, "artifact_size")
    return raw


def decode_raw_dxf(key):
    name, pin = SOURCE[key]
    raw = bounded(BASE / name, 32768)
    need(sha(raw) == pin, "raw_dxf_pin")
    words = [line.strip() for line in raw.decode("ascii").splitlines()]
    tags = list(zip(words[::2], words[1::2]))
    need(("$INSUNITS" in words) and tags[tags.index(("9", "$INSUNITS")) + 1] == ("70", "4"), "raw_dxf_units")
    offsets = [i for i, item in enumerate(tags) if item == ("0", "LWPOLYLINE")]
    ends = offsets[1:] + [tags.index(("0", "ENDSEC"), offsets[-1])]
    geometry = {}
    for start, end in zip(offsets, ends):
        rows = tags[start:end]
        attrs = dict(rows)
        xs = [int(v) for k, v in rows if k == "10"]
        ys = [int(v) for k, v in rows if k == "20"]
        need(attrs["70"] == "1" and len(xs) == len(ys) == int(attrs["90"]), "raw_dxf_profile")
        geometry[attrs["5"]] = {"handle": attrs["5"], "layer": attrs["8"], "vertices": list(zip(xs, ys))}
    return geometry


def box(entity):
    xs, ys = zip(*entity["vertices"])
    return min(xs), min(ys), max(xs), max(ys)


def rect_area(entity):
    left, bottom, right, top = box(entity)
    need(set(entity["vertices"]) == {(left, bottom), (left, top), (right, bottom), (right, top)}, "raw_facade_rectangle")
    return (right-left) * (top-bottom)


def normalized_floor(entity):
    # Independent fixture oracle: bounding rectangle less the single corner cut-out.
    x, y, x1, y1 = box(entity)
    vertices = set(entity["vertices"])
    inner_x = sorted({u for u, _ in vertices})[1]
    inner_y = sorted({v for _, v in vertices})[1]
    need(vertices == {(x, y), (x1, y), (x1, inner_y), (inner_x, inner_y), (inner_x, y1), (x, y1)}, "raw_floor_notch")
    return (x1-x)*(y1-y)-(x1-inner_x)*(y1-inner_y)


def amount(raw):
    need(re.fullmatch(r"-?(?:0|[1-9][0-9]*)(?:\.[0-9]{1,6})?", raw), "csv_measure_syntax")
    return Decimal(raw)


def source_ref(key, handle, geometry):
    g = geometry[key][handle]
    digest = sha(json.dumps(g, sort_keys=True, separators=(",", ":")).encode("ascii"))
    return ":".join(["FLOOR" if key == "FLOOR" else "SOUTH_FACADE", g["layer"], handle, SOURCE[key][1], digest])


def reconstruct(key, all_geo):
    f, g = all_geo["FLOOR"]["10"], all_geo[key]
    floor, gross, a, b = normalized_floor(f), rect_area(g["20"]), rect_area(g["21"]), rect_area(g["22"])
    refs = {
        "FLOOR.GROSS": [source_ref("FLOOR", "10", all_geo)],
        "SOUTH.GROSS": [source_ref(key, "20", all_geo)],
        "SOUTH.OPENING.21": [source_ref(key, "21", all_geo)],
        "SOUTH.OPENING.22": [source_ref(key, "22", all_geo)],
    }
    refs["SOUTH.DEDUCTIONS"] = refs["SOUTH.OPENING.21"] + refs["SOUTH.OPENING.22"]
    refs["SOUTH.NET"] = refs["SOUTH.GROSS"] + refs["SOUTH.DEDUCTIONS"]
    return dict(zip(AREA_IDS, (floor, gross, a, b, a+b, gross-a-b))), refs


def verify_csv(raw, results, manifest):
    reader = csv.DictReader(StringIO(raw.decode("ascii"), newline=""), strict=True)
    need(reader.fieldnames == CSV_FIELDS, "csv_schema")
    rows = {}
    for row in reader:
        need(set(row) == set(CSV_FIELDS) and all(v is not None for v in row.values()), "csv_row_shape")
        key = (row["revision"], row["quantity_id"])
        need(key not in rows, "csv_duplicate")
        rows[key] = row
    a, ar = results["R1"]
    b, br = results["R2"]
    for rev, data, refs, key in (
        ("R1", a, ar, "beforeDxfReportSha256"), ("R2", b, br, "afterDxfReportSha256"),
        ("R1_TO_R2", {k: b[k]-a[k] for k in AREA_IDS}, {k: ar[k]+br[k] for k in AREA_IDS}, "dxfComparisonSha256"),
    ):
        for ident in AREA_IDS:
            row = rows.pop((rev, ident))
            need(row["artifact_id"] == CSV_ID and row["classification"] == "SYNTHETIC_NOT_FOR_CONSTRUCTION" and
                 row["geometry_unit"] == "mm" and row["record_type"] == ("geometric_delta" if rev == "R1_TO_R2" else "geometric_area"),
                 "csv_context")
            need(row["value_mm2"] == str(data[ident]) and amount(row["value_m2"])*1000000 == data[ident], "csv_measure_mismatch")
            need(row["source_refs"] == "|".join(refs[ident]) and row["dxf_report_sha256"] == manifest["source"][key] and
                 row["revision_impact_sha256"] == manifest["impactReportSha256"], "csv_source_mismatch")
    need(not rows, "csv_extra_row")


def verify_svg(raw, geo, manifest):
    need(not re.search(br"<[!?]|\b(?:href|src)=", raw, re.I), "svg_external_or_declaration")
    root = ET.fromstring(raw)
    need(root.tag == SV+"svg" and root.attrib.get("data-artifact-id") == SVG_ID and
         root.attrib.get("data-impact-sha256") == manifest["impactReportSha256"], "svg_identity")
    allowed = {SV+x for x in ["svg", "style", "title", "desc", "rect", "text", "g", "polygon"]}
    need(all(child.tag in allowed and not any(k.lower().startswith("on") or k in
         {"style", "display", "visibility", "opacity", "clip-path", "mask"} for k in child.attrib) for child in root.iter()), "svg_element_policy")
    styles = root.findall(SV+"style")
    need(len(styles) == 1 and not re.search(r"url\s*\(|@|\b(?:display|visibility|opacity|transform|clip-path|mask)\s*:",
         styles[0].text or "", re.I), "svg_hidden_or_external_style")
    def find(ident):
        matches = [n for n in root.iter() if n.attrib.get("id") == ident]
        need(len(matches) == 1, "svg_identity_missing_or_duplicate")
        return matches[0]
    for ident, key, revision, artifact, handle in [
        ("facade-r1", "R1", "R1", "FACADE-SOUTH-001", "20"), ("facade-r2", "R2", "R2", "FACADE-SOUTH-001", "20"),
        ("floor", "FLOOR", "FLOOR-R1", "ARCH-FLOOR-001", "10"),
    ]:
        sheet = find(ident)
        props = sheet.attrib
        x0, y0, x1, y1 = box(geo[key][handle])
        need(sheet.tag == SV+"svg" and len(sheet) == 1 and sheet[0].tag == SV+"g" and
             props["viewBox"] == f"{x0} {y0} {x1-x0} {y1-y0}" and props["preserveAspectRatio"] == "xMidYMid meet" and
             (props["data-unit"], props["data-source-id"], props["data-source-sha256"], props["data-revision"]) ==
             ("mm", artifact, SOURCE[key][1], revision), "svg_sheet_lineage")
        need(sheet[0].attrib == {"transform": f"translate(0 {y1+y0}) scale(1 -1)"}, "svg_transform")
        polygons = {}
        for child in sheet[0]:
            if child.tag == SV+"polygon":
                h = child.attrib["data-handle"]
                role = {"10":"floor", "20":"shell", "21":"opening-selected", "22":"opening"}.get(h)
                need(child.attrib.get("class") == role, "svg_polygon_role")
                need(h not in polygons and set(child.attrib) == {"class", "data-handle", "data-layer", "points"}, "svg_polygon_shape")
                polygon = [tuple(int(c) for c in p.split(",")) for p in child.attrib["points"].split()]
                polygons[h] = {"handle": h, "layer": child.attrib["data-layer"], "vertices": polygon}
        need(polygons == geo[key] and len(sheet[0]) == len(polygons) + (key == "R2"), "svg_polygon_mismatch")
    a, b, f = (find(x).attrib for x in ("facade-r1", "facade-r2", "floor"))
    need(all(a[k] == b[k] for k in ("width", "height", "viewBox")) and f["data-unit"] == "mm", "svg_equal_elevation_scale")
    x0, y0, x1, y1 = box(geo["R1"]["21"])
    a0, b0, a1, b1 = box(geo["R2"]["21"])
    need((x0, y0, y1) == (a0, b0, b1), "raw_opening_alignment")
    strip = find("added-opening-region")
    need(strip in list(find("facade-r2")[0]) and strip.tag == SV+"rect" and strip.attrib ==
         {"id": "added-opening-region", "x": str(x1), "y": str(y0), "width": str(a1-x1), "height": str(y1-y0), "class": "change"},
         "svg_opening_overlay")
    for ident, expected in {
        "warning": "SYNTHETIC REVIEW SAMPLE / NOT FOR CONSTRUCTION",
        "facade-r1-net": "Gross 216 m² | Net 207 m²", "facade-r2-net": "Gross 216 m² | Net 205.5 m²",
        "floor-area": "Floor gross 402 m² in both revisions", "net-delta": "Net geometric area delta: -1.5 m²",
        "opening": "Opening 21: 6 → 7.5 m²", "units": "Geometry coordinates: mm. Areas: m². Elevations use identical scale.",
        "source-r1": "FACADE-SOUTH-001 / R1 / "+SOURCE["R1"][1], "source-r2": "FACADE-SOUTH-001 / R2 / "+SOURCE["R2"][1],
        "source-floor": "ARCH-FLOOR-001 / FLOOR-R1 / "+SOURCE["FLOOR"][1],
    }.items():
        text = find(ident)
        need(text.tag == SV+"text" and text.text == expected, "svg_visible_label")


def verify(csv_path, svg_path, manifest_path):
    records = dict(zip(("csv", "svg"), (bounded(csv_path, 18000), bounded(svg_path, 12000))))
    manifest = json.loads(bounded(manifest_path, 5000))
    need(manifest["schema"] == "MANA_SYNTHETIC_DXF_REVIEW_ARTIFACTS_V1" and manifest["status"] == "SYNTHETIC_ARTIFACTS_REVIEW_ONLY" and
         manifest["downstreamArtifactsRegenerated"] is False and manifest["constructionApproved"] is False and
         manifest["productionDeploymentAllowed"] is False and manifest["actionsExecuted"] == 0 and manifest["stateWrites"] == 0, "manifest_scope")
    need([r["type"] for r in manifest["artifacts"]] == ["csv", "svg"], "manifest_artifacts")
    need(all(manifest["source"][field] == SOURCE[key][1] for field, key in [
         ("floorSha256", "FLOOR"), ("facadeBeforeSha256", "R1"), ("facadeAfterSha256", "R2")]), "manifest_raw_source_bindings")
    geo = {key: decode_raw_dxf(key) for key in SOURCE}
    need([k for k in geo["R1"] if geo["R1"][k] != geo["R2"][k]] == ["21"], "raw_scope_of_change")
    results = {key: reconstruct(key, geo) for key in ("R1", "R2")}
    a, b = (results[r][0] for r in ("R1", "R2"))
    need((a["FLOOR.GROSS"], b["FLOOR.GROSS"], a["SOUTH.NET"], b["SOUTH.NET"]) ==
         (402000000, 402000000, 207000000, 205500000), "independent_reference_totals")
    verify_csv(records["csv"], results, manifest)
    verify_svg(records["svg"], geo, manifest)
    for row in manifest["artifacts"]:
        raw = records[row["type"]]
        need(row == {"type": row["type"], "bytes": len(raw), "sha256": sha(raw),
                     "id": CSV_ID if row["type"] == "csv" else SVG_ID}, "manifest_artifact_digest")
    return {"status": "SYNTHETIC_REPRESENTATIONS_VERIFIED", "csv_rows": 18, "svg_source_polygons": 7,
            "facade_net_m2": ["207", "205.5"], "facade_net_delta_m2": "-1.5", "floor_m2": "402", "changed_openings": ["21"]}


if __name__ == "__main__":
    try:
        need(len(sys.argv) == 4, "arguments")
        print(json.dumps(verify(*(Path(k) for k in sys.argv[1:]))))
    except Exception as error:
        code = str(error) if isinstance(error, ValueError) and re.fullmatch(r"[a-z_]{1,60}", str(error)) else "verification_failed"
        print(json.dumps({"status": "ABSTAIN_REPRESENTATION_UNVERIFIED", "reason": code}))
        sys.exit(1)
