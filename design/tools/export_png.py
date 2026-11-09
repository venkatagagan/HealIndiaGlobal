"""Export PNGs from the brand SVGs with a locally installed Chrome or Edge in headless mode (stdlib only,
nothing to install).

    python design/tools/export_png.py                   # -> design/dist/png/...
    python design/tools/export_png.py --out C:/tmp/png  # custom output folder
    python design/tools/export_png.py --browser "C:/Program Files/Google/Chrome/Application/chrome.exe"

Equivalent commands with other renderers (same SVG sources, same sizes):
    inkscape design/icons/app-icon.svg --export-type=png --export-filename=app-icon-1024.png -w 1024 -h 1024
    rsvg-convert -w 1024 -h 1024 design/icons/app-icon.svg -o app-icon-1024.png

Wordmark PNGs (logo/*) render the <text> with whatever fonts the machine has: install Inter first for
pixel-exact logos (otherwise Segoe UI / Roboto / Arial are used; the width is locked by textLength).
"""
from __future__ import annotations

import argparse
import os
import pathlib
import shutil
import struct
import subprocess
import sys
import tempfile

DESIGN = pathlib.Path(__file__).resolve().parents[1]

# (source svg, output path relative to --out, width, height)
TARGETS = [
    # flutter_launcher_icons sources (mobile/assets/brand/)
    ("icons/app-icon.svg", "launcher/app-icon-1024.png", 1024, 1024),
    ("icons/app-icon-ios.svg", "launcher/app-icon-ios-1024.png", 1024, 1024),
    ("icons/app-icon-foreground.svg", "launcher/app-icon-foreground-1024.png", 1024, 1024),
    ("icons/app-icon-background.svg", "launcher/app-icon-background-1024.png", 1024, 1024),
    # React portals: web/apps/<app>/public/
    ("icons/favicon.svg", "web/favicon-32.png", 32, 32),
    ("icons/favicon.svg", "web/favicon-48.png", 48, 48),
    ("icons/app-icon-ios.svg", "web/apple-touch-icon.png", 180, 180),
    ("icons/app-icon.svg", "web/icon-192.png", 192, 192),
    ("icons/app-icon.svg", "web/icon-512.png", 512, 512),
    ("icons/maskable-icon.svg", "web/maskable-192.png", 192, 192),
    ("icons/maskable-icon.svg", "web/maskable-512.png", 512, 512),
    # Flutter web build: mobile/web/
    ("icons/favicon.svg", "flutter-web/favicon.png", 32, 32),
    ("icons/app-icon.svg", "flutter-web/icons/Icon-192.png", 192, 192),
    ("icons/app-icon.svg", "flutter-web/icons/Icon-512.png", 512, 512),
    ("icons/maskable-icon.svg", "flutter-web/icons/Icon-maskable-192.png", 192, 192),
    ("icons/maskable-icon.svg", "flutter-web/icons/Icon-maskable-512.png", 512, 512),
    # e-mail templates / documents (SVG is not supported by most mail clients)
    ("logo/logo-horizontal.svg", "logo/logo-horizontal-600.png", 600, 110),
    ("logo/logo-horizontal-on-dark.svg", "logo/logo-horizontal-on-dark-600.png", 600, 110),
    ("logo/logo-mark.svg", "logo/logo-mark-256.png", 256, 256),
]

CANDIDATES = [
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
    r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
]


def find_browser(explicit: str | None) -> str:
    for c in [explicit, os.environ.get("HIG_BROWSER")]:
        if c and pathlib.Path(c).exists():
            return c
    for c in CANDIDATES:
        if pathlib.Path(c).exists():
            return c
    for name in ("google-chrome", "chromium", "chromium-browser", "microsoft-edge", "chrome", "msedge"):
        p = shutil.which(name)
        if p:
            return p
    sys.exit("No Chrome/Edge found: pass --browser or set HIG_BROWSER (or use Inkscape / rsvg-convert).")


def png_size(path: pathlib.Path) -> tuple[int, int]:
    with path.open("rb") as fh:
        head = fh.read(24)
    return struct.unpack(">II", head[16:24])


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--out", default=str(DESIGN / "dist" / "png"), help="output folder (default design/dist/png)")
    ap.add_argument("--browser", help="path to chrome.exe / msedge.exe")
    args = ap.parse_args()
    browser = find_browser(args.browser)
    out = pathlib.Path(args.out).resolve()
    failures = 0
    with tempfile.TemporaryDirectory(prefix="hig-export-") as tmp:
        tmpdir = pathlib.Path(tmp)
        for i, (src, rel, w, h) in enumerate(TARGETS):
            svg = (DESIGN / src).resolve()
            dest = out / rel
            dest.parent.mkdir(parents=True, exist_ok=True)
            if dest.exists():
                dest.unlink()
            page = tmpdir / f"wrap{i}.html"
            page.write_text(
                "<!doctype html><html><head><meta charset='utf-8'><style>html,body{margin:0;background:transparent;"
                f"overflow:hidden}}img{{display:block;width:{w}px;height:{h}px}}</style></head><body>"
                f"<img src='{svg.as_uri()}'></body></html>",
                encoding="utf-8",
            )
            cmd = [
                browser, "--headless=new", "--disable-gpu", "--hide-scrollbars", "--no-first-run",
                "--no-default-browser-check", f"--user-data-dir={tmpdir / 'profile'}",
                "--default-background-color=00000000", "--force-device-scale-factor=1",
                f"--window-size={w},{h}", f"--screenshot={dest}", page.as_uri(),
            ]
            subprocess.run(cmd, capture_output=True, timeout=120)
            if dest.exists() and png_size(dest) == (w, h):
                print(f"  ok  {rel}  ({w}x{h})")
            else:
                failures += 1
                print(f"  ERR {rel}: export failed")
    print(f"\n{len(TARGETS) - failures}/{len(TARGETS)} PNGs written to {out}")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
