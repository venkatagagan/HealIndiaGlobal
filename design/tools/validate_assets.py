"""Validate the Heal India Global brand assets in design/ (stdlib only).

    python design/tools/validate_assets.py                       # validate everything
    python design/tools/validate_assets.py --sync-body-regions   # rewrite body-regions.json "d"/"label" from the SVGs

Checks
  * every *.svg parses as XML (xml.etree), root <svg> has a viewBox, no raster/script/external references
  * size budgets (illustrations < 30 KB, specialty icons < 3 KB)
  * specialty icons: the 16 slugs (+ more.svg), 48x48, fill="none", stroke="currentColor", stroke-width="2", no colour overrides
  * body map: region ids + data-region, JSON paths identical to SVG paths, minimal path syntax (M/L/C/Z),
    side convention, and a scanline-rasterised check that regions tile the silhouette (gap/overlap < 0.1 %)
  * launcher icons: the mark stays inside the Android adaptive (66 dp) and PWA maskable (80 %) safe zones
Exit code 1 on any failure.
"""
from __future__ import annotations

import argparse
import json
import math
import pathlib
import re
import sys
import xml.etree.ElementTree as ET

ROOT = pathlib.Path(__file__).resolve().parents[1]
SVG_NS = "{http://www.w3.org/2000/svg}"

SPECIALTIES = [
    "cardiology", "orthopedics", "cosmetic", "dental", "oncology", "neurology", "fertility", "transplant",
    "bariatric", "ophthalmology", "spine", "urology", "gastroenterology", "ent", "nephrology", "wellness",
]
EXTRA_ICONS = ["more"]  # "More / other specialties" tile + fallback for unknown slugs
FRONT_IDS = ["head", "neck", "chest", "abdomen", "pelvis", "left_arm", "right_arm", "left_leg", "right_leg"]
BACK_IDS = ["head", "neck", "back", "pelvis", "left_arm", "right_arm", "left_leg", "right_leg"]
ILLUSTRATIONS = [
    "onboarding-welcome", "onboarding-trust", "onboarding-security", "ai-processing", "no-results",
    "no-messages", "no-documents", "success", "error",
]
REQUIRED = (
    [f"logo/{n}.svg" for n in ("logo-mark", "logo-horizontal", "logo-stacked", "logo-mono-white", "logo-mono-dark")]
    + [f"icons/{n}.svg" for n in ("app-icon", "app-icon-foreground", "app-icon-background", "favicon", "maskable-icon")]
    + [f"illustrations/{n}.svg" for n in ILLUSTRATIONS]
    + [f"specialties/{n}.svg" for n in SPECIALTIES]
    + ["body-map/body-front.svg", "body-map/body-back.svg", "body-map/body-regions.json"]
)

errors: list[str] = []
notes: list[str] = []


def fail(msg: str) -> None:
    errors.append(msg)


# ------------------------------------------------------------------------------------------------ paths
TOKEN = re.compile(r"[MmLlHhVvCcSsQqTtAaZz]|-?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?")


def parse_path(d: str) -> list[list[tuple[float, float]]]:
    """Flatten an absolute-command path (M L H V C Q Z) into closed/open polylines."""
    toks = TOKEN.findall(d)
    i, cmd = 0, None
    cur = (0.0, 0.0)
    start = cur
    polys: list[list[tuple[float, float]]] = []
    poly: list[tuple[float, float]] = []

    def num() -> float:
        nonlocal i
        v = float(toks[i])
        i += 1
        return v

    while i < len(toks):
        t = toks[i]
        if t.isalpha():
            cmd = t
            i += 1
            if cmd in "Zz":
                if poly:
                    poly.append(start)
                    polys.append(poly)
                poly = []
                cur = start
                continue
        if cmd is None or cmd.islower():
            raise ValueError(f"unsupported/relative path command {cmd!r}")
        if cmd == "M":
            if poly:
                polys.append(poly)
            cur = (num(), num())
            start = cur
            poly = [cur]
            cmd = "L"
        elif cmd == "L":
            cur = (num(), num())
            poly.append(cur)
        elif cmd == "H":
            cur = (num(), cur[1])
            poly.append(cur)
        elif cmd == "V":
            cur = (cur[0], num())
            poly.append(cur)
        elif cmd in ("C", "Q"):
            n = 3 if cmd == "C" else 2
            ctrl = [(num(), num()) for _ in range(n)]
            p0 = cur
            for k in range(1, 17):
                s = k / 16
                if n == 3:
                    a, b, c = ctrl
                    x = (1 - s) ** 3 * p0[0] + 3 * (1 - s) ** 2 * s * a[0] + 3 * (1 - s) * s * s * b[0] + s**3 * c[0]
                    y = (1 - s) ** 3 * p0[1] + 3 * (1 - s) ** 2 * s * a[1] + 3 * (1 - s) * s * s * b[1] + s**3 * c[1]
                else:
                    a, c = ctrl
                    x = (1 - s) ** 2 * p0[0] + 2 * (1 - s) * s * a[0] + s * s * c[0]
                    y = (1 - s) ** 2 * p0[1] + 2 * (1 - s) * s * a[1] + s * s * c[1]
                poly.append((x, y))
            cur = ctrl[-1]
        else:
            raise ValueError(f"unsupported path command {cmd!r}")
    if poly:
        polys.append(poly)
    return polys


def apply_transform(polys, transform: str | None):
    if not transform:
        return polys
    tx = ty = 0.0
    sx = sy = 1.0
    m = re.search(r"translate\(\s*([-\d.]+)[\s,]+([-\d.]+)\s*\)", transform)
    if m:
        tx, ty = float(m.group(1)), float(m.group(2))
    m = re.search(r"scale\(\s*([-\d.]+)(?:[\s,]+([-\d.]+))?\s*\)", transform)
    if m:
        sx = float(m.group(1))
        sy = float(m.group(2)) if m.group(2) else sx
    return [[(tx + x * sx, ty + y * sy) for x, y in poly] for poly in polys]


# ------------------------------------------------------------------------------------------ rasterising
SS = 4  # scanlines per unit


def spans(polys, rows: int) -> list[list[tuple[float, float]]]:
    """Even-odd scanline spans for each row (sample y = (r + .5) / SS)."""
    buckets: list[list[tuple[float, float, float, float]]] = [[] for _ in range(rows)]
    for poly in polys:
        for (x0, y0), (x1, y1) in zip(poly, poly[1:]):
            if y0 == y1:
                continue
            lo, hi = min(y0, y1), max(y0, y1)
            r0 = max(0, math.ceil(lo * SS - 0.5))
            r1 = min(rows - 1, math.floor(hi * SS - 0.5))
            for r in range(r0, r1 + 1):
                buckets[r].append((x0, y0, x1, y1))
    out = []
    for r in range(rows):
        y = (r + 0.5) / SS
        xs = []
        for x0, y0, x1, y1 in buckets[r]:
            if (y0 <= y < y1) or (y1 <= y < y0):
                xs.append(x0 + (y - y0) * (x1 - x0) / (y1 - y0))
        xs.sort()
        out.append([(xs[k], xs[k + 1]) for k in range(0, len(xs) - 1, 2)])
    return out


def union_len(iv: list[tuple[float, float]]) -> float:
    total, end = 0.0, -math.inf
    for a, b in sorted(iv):
        if b <= end:
            continue
        total += b - max(a, end)
        end = b
    return total


def check_tiling(view: str, regions: list[dict], outline: str | None, h: int) -> None:
    rows = h * SS
    region_spans = [spans(parse_path(r["d"]), rows) for r in regions]
    sil = spans(parse_path(outline), rows) if outline else None
    area_sum = area_union = gap = 0.0
    for r in range(rows):
        ivs = [iv for rs in region_spans for iv in rs[r]]
        s = sum(b - a for a, b in ivs)
        u = union_len(ivs)
        area_sum += s
        area_union += u
        if sil is not None:
            g = union_len(sil[r]) - u  # silhouette minus regions (regions lie inside it by construction)
            gap += max(0.0, g)
    area_sum /= SS
    area_union /= SS
    gap /= SS
    overlap = area_sum - area_union
    o_pct = 100 * overlap / area_union
    g_pct = 100 * gap / area_union
    notes.append(f"body-map/{view}: area {area_union:.0f} sq.u, overlap {overlap:.1f} sq.u ({o_pct:.3f} %), "
                 f"gap vs silhouette {gap:.1f} sq.u ({g_pct:.3f} %)")
    if o_pct > 0.1:
        fail(f"body-map/{view}: regions overlap {o_pct:.2f} % (> 0.1 %)")
    if g_pct > 0.1:
        fail(f"body-map/{view}: gaps between regions {g_pct:.2f} % (> 0.1 %)")


def centroid_x(d: str) -> float:
    pts = [p for poly in parse_path(d) for p in poly]
    return sum(p[0] for p in pts) / len(pts)


# --------------------------------------------------------------------------------------------- checks
def check_svgs() -> dict[pathlib.Path, ET.Element]:
    roots = {}
    for rel in REQUIRED:
        if not (ROOT / rel).exists():
            fail(f"missing required asset {rel}")
    for f in sorted(ROOT.rglob("*.svg")):
        rel = f.relative_to(ROOT).as_posix()
        raw = f.read_text(encoding="utf-8")
        try:
            root = ET.fromstring(raw)
        except ET.ParseError as e:
            fail(f"{rel}: XML parse error: {e}")
            continue
        roots[f] = root
        if root.tag != SVG_NS + "svg":
            fail(f"{rel}: root element is {root.tag}, expected svg in the SVG namespace")
        if not root.get("viewBox"):
            fail(f"{rel}: missing viewBox")
        for el in root.iter():
            tag = el.tag.replace(SVG_NS, "")
            if tag in ("image", "script", "foreignObject"):
                fail(f"{rel}: forbidden <{tag}> element")
            for k, v in el.attrib.items():
                if k.endswith("href") and not v.startswith("#"):
                    fail(f"{rel}: external reference {k}={v[:40]!r}")
                if "url(" in v and not re.fullmatch(r"\s*url\(#[\w-]+\)\s*", v):
                    fail(f"{rel}: non-local url() in {k}")
        low = raw.lower()
        if "@font-face" in low or "@import" in low or "data:" in low:
            fail(f"{rel}: embedded font/import/data URI is not allowed")
        size = f.stat().st_size
        if rel.startswith("illustrations/") and size >= 30 * 1024:
            fail(f"{rel}: {size} bytes (budget < 30 KB)")
        if rel.startswith("specialties/") and size >= 3 * 1024:
            fail(f"{rel}: {size} bytes (budget < 3 KB)")
    return roots


def check_specialties(roots) -> None:
    found = sorted(p.stem for p in (ROOT / "specialties").glob("*.svg"))
    if found != sorted(SPECIALTIES + EXTRA_ICONS):
        fail(f"specialties: expected {sorted(SPECIALTIES + EXTRA_ICONS)}, found {found}")
    for slug in SPECIALTIES + EXTRA_ICONS:
        f = ROOT / "specialties" / f"{slug}.svg"
        root = roots.get(f)
        if root is None:
            continue
        want = {"viewBox": "0 0 48 48", "width": "48", "height": "48", "fill": "none",
                "stroke": "currentColor", "stroke-width": "2"}
        for k, v in want.items():
            if root.get(k) != v:
                fail(f"specialties/{slug}.svg: root {k}={root.get(k)!r}, expected {v!r}")
        for el in root.iter():
            if el is root:
                continue
            for k in ("fill", "stroke"):
                if el.get(k) not in (None, "none", "currentColor"):
                    fail(f"specialties/{slug}.svg: <{el.tag.replace(SVG_NS, '')}> overrides {k}={el.get(k)!r}")
            if el.get("stroke-width") is not None:
                fail(f"specialties/{slug}.svg: stroke-width override")
            if el.get("style"):
                fail(f"specialties/{slug}.svg: inline style attribute")


def svg_regions(root: ET.Element) -> list[dict]:
    out = []
    for el in root.iter(SVG_NS + "path"):
        if el.get("data-region") is None:
            continue
        t = el.find(SVG_NS + "title")
        out.append({"id": el.get("id"), "data-region": el.get("data-region"), "d": el.get("d"),
                    "label": t.text if t is not None else None})
    return out


def check_body_map(roots, sync: bool) -> None:
    jpath = ROOT / "body-map" / "body-regions.json"
    data = json.loads(jpath.read_text(encoding="utf-8"))
    if data.get("viewBox") != "0 0 200 480":
        fail("body-regions.json: viewBox must be '0 0 200 480'")
    syntax = re.compile(r"M( -?\d+(\.\d+)?){2}( (C( -?\d+(\.\d+)?){6}|L( -?\d+(\.\d+)?){2}|M( -?\d+(\.\d+)?){2}))* Z")
    for view, ids in (("front", FRONT_IDS), ("back", BACK_IDS)):
        root = roots.get(ROOT / "body-map" / f"body-{view}.svg")
        if root is None:
            continue
        if root.get("viewBox") != "0 0 200 480":
            fail(f"body-{view}.svg: viewBox must be '0 0 200 480'")
        regs = svg_regions(root)
        got = [r["id"] for r in regs]
        if got != ids:
            fail(f"body-{view}.svg: region ids {got}, expected {ids}")
        for r in regs:
            if r["data-region"] != r["id"]:
                fail(f"body-{view}.svg: path id={r['id']} has data-region={r['data-region']}")
            if not syntax.fullmatch(r["d"] or ""):
                fail(f"body-{view}.svg/{r['id']}: path data must be absolute 'M x y C ... Z' with single spaces")
        if sync:
            data[view] = [{"id": r["id"], "label": r["label"] or r["id"], "d": r["d"]} for r in regs]
        js = data.get(view, [])
        if [(e.get("id"), e.get("d")) for e in js] != [(r["id"], r["d"]) for r in regs]:
            fail(f"body-regions.json: '{view}' ids/paths differ from body-{view}.svg (run with --sync-body-regions)")
        for e in js:
            if set(e) != {"id", "label", "d"} or not e.get("label"):
                fail(f"body-regions.json: {view}/{e.get('id')} must have exactly id, label, d")
        # side convention: front -> patient's left on viewer's right; back -> on viewer's left
        by_id = {r["id"]: r["d"] for r in regs}
        for part in ("arm", "leg"):
            if f"left_{part}" in by_id:
                cx = centroid_x(by_id[f"left_{part}"])
                ok = cx > 100 if view == "front" else cx < 100
                if not ok:
                    fail(f"body-{view}.svg: left_{part} centroid x={cx:.1f} violates the side convention")
        check_tiling(view, regs, data.get("outline"), 480)
    if sync:
        jpath.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        notes.append("body-regions.json re-synced from the SVGs")


def check_safe_zones(roots) -> None:
    cases = [
        ("icons/app-icon-foreground.svg", (512, 512), 1024 * 33 / 108, "Android adaptive 66dp"),
        ("icons/maskable-icon.svg", (256, 256), 512 * 0.4, "PWA maskable 80%"),
    ]
    for rel, c, r_safe, label in cases:
        root = roots.get(ROOT / rel)
        if root is None:
            continue
        r_max = 0.0
        for el in root.iter(SVG_NS + "path"):
            polys = apply_transform(parse_path(el.get("d")), el.get("transform"))
            for poly in polys:
                for x, y in poly:
                    r_max = max(r_max, math.dist((x, y), c))
        notes.append(f"{rel}: farthest point r={r_max:.0f} (safe zone r={r_safe:.0f}, {label})")
        if r_max > r_safe:
            fail(f"{rel}: content reaches r={r_max:.0f}, outside the {label} safe zone r={r_safe:.0f}")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--sync-body-regions", action="store_true", help="rewrite body-regions.json from the SVGs")
    args = ap.parse_args()
    roots = check_svgs()
    check_specialties(roots)
    check_body_map(roots, args.sync_body_regions)
    check_safe_zones(roots)
    n = len(list(ROOT.rglob("*.svg")))
    for line in notes:
        print("  -", line)
    if errors:
        print(f"\nFAILED ({len(errors)} problem(s)):")
        for e in errors:
            print("  x", e)
        return 1
    print(f"\nOK - {n} SVG files parsed and validated; body-regions.json matches the body-map SVGs.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
