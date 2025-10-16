#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Photocard generator (image only, JSON source, with template overlay)
- Loads ./articles/prothomalo.json
- Detects the black photo window on the template
- Places each article_image using 'cover' fit
- Reapplies template overlay so borders/shadows sit on top of the photo
- No text/category rendering
"""

import json
import cv2
import requests
import numpy as np
from pathlib import Path

# --- Paths ---
TEMPLATE_PATH = Path("./templates/version-1.png")
JSON_PATH     = Path("./articles/prothomalo.json")
OUT_DIR       = Path("./photocards/prothomalo-photocard-image-only")

# --- Core helpers (mirroring the full generator’s logic) ---
def detect_black_box(template_bgr: np.ndarray):
    """Find the largest black rectangle to use as the photo window."""
    hsv = cv2.cvtColor(template_bgr, cv2.COLOR_BGR2HSV)
    lower = np.array([0, 0, 0], np.uint8)
    upper = np.array([179, 80, 60], np.uint8)
    mask = cv2.inRange(hsv, lower, upper)
    cnts, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not cnts:
        raise RuntimeError("No black rectangle found in template.")
    x, y, w, h = cv2.boundingRect(max(cnts, key=cv2.contourArea))
    return x + 2, y + 2, max(1, w - 4), max(1, h - 4)

def build_overlay_mask(template_bgr: np.ndarray) -> np.ndarray:
    """Create a 3-channel mask of NON-black template pixels to reapply on top."""
    hsv = cv2.cvtColor(template_bgr, cv2.COLOR_BGR2HSV)
    black_mask = cv2.inRange(hsv, np.array([0, 0, 0], np.uint8),
                                   np.array([179, 80, 60], np.uint8))
    nonblack = cv2.bitwise_not(black_mask)
    return cv2.merge([nonblack, nonblack, nonblack])

def composite_with_template(base_bgr: np.ndarray, template_bgr: np.ndarray, mask3: np.ndarray) -> np.ndarray:
    """Overlay template’s non-black pixels over the base (photo inserted) image."""
    return (base_bgr & (~mask3)) + (template_bgr & mask3)

def load_cv(path_or_url: str) -> np.ndarray:
    """Load an image from URL or local path to BGR array."""
    if path_or_url.startswith(("http://", "https://")):
        r = requests.get(path_or_url, timeout=60)
        r.raise_for_status()
        data = r.content
    else:
        data = Path(path_or_url).read_bytes()
    arr = np.frombuffer(data, dtype=np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError(f"Failed to decode image: {path_or_url}")
    return img

def fit_cover(src_bgr: np.ndarray, tw: int, th: int) -> np.ndarray:
    """Resize/crop to fully cover the target window, like CSS background-size: cover."""
    sh, sw = src_bgr.shape[:2]
    src_as = sw / sh
    tgt_as = tw / th
    if src_as < tgt_as:
        new_w, new_h = tw, int(tw / src_as)
    else:
        new_h, new_w = th, int(th * src_as)
    resized = cv2.resize(src_bgr, (new_w, new_h), interpolation=cv2.INTER_AREA)
    x = (new_w - tw) // 2
    y = (new_h - th) // 2
    return resized[y:y + th, x:x + tw]

def extract_articles(json_path: Path):
    """Accepts a root array or { "articles": [...] }."""
    data = json.loads(json_path.read_text(encoding="utf-8"))
    if isinstance(data, list):
        return data
    if isinstance(data, dict):
        return data.get("articles", [])
    raise ValueError("Unexpected JSON structure in prothomalo.json")

# --- Main ---
def main():
    if not TEMPLATE_PATH.exists():
        raise FileNotFoundError(f"Template not found: {TEMPLATE_PATH}")
    if not JSON_PATH.exists():
        raise FileNotFoundError(f"JSON file not found: {JSON_PATH}")

    OUT_DIR.mkdir(parents=True, exist_ok=True)

    template_bgr = cv2.imread(str(TEMPLATE_PATH))
    overlay_src  = template_bgr.copy()
    mask3        = build_overlay_mask(template_bgr)

    px, py, pw, ph = detect_black_box(template_bgr)

    articles = extract_articles(JSON_PATH)
    total = len(articles)

    for i, art in enumerate(articles, 1):
        img_url = (art.get("article_image") or "").strip()
        if not img_url:
            print(f"[{i}/{total}] Skipped (no article_image)")
            continue
        try:
            photo_bgr = load_cv(img_url)
            fitted    = fit_cover(photo_bgr, pw, ph)

            # 1) Put photo into the window on a fresh copy of the template base
            base = template_bgr.copy()
            base[py:py + ph, px:px + pw] = fitted

            # 2) Reapply the template’s non-black parts so frame/borders overlay the photo
            composed = composite_with_template(base, overlay_src, mask3)

            out_path = OUT_DIR / f"{i:03d}.png"
            cv2.imwrite(str(out_path), composed)
            print(f"[{i}/{total}] OK -> {out_path.name}")
        except Exception as e:
            print(f"[{i}/{total}] FAIL ({img_url}): {e}")

    print(f"✅ Done. Images saved in {OUT_DIR.resolve()}")

if __name__ == "__main__":
    main()
