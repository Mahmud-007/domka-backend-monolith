#!/usr/bin/env node
/**
 * Photocard CLI (skia-canvas version, supports Bangla text shaping)
 *
 * - Reads JSON: ./articles/prothomalo.json
 * - Reads template PNG: ./templates/version-1.png
 * - Places article_image into the black box (cover fit)
 * - Reapplies template overlay (non-black pixels on top)
 * - Draws category pill, title, date, source using proper Bangla font shaping
 * - Saves to ./photocards/prothomalo-photocard-skia
 *
 * Run:
 * node photocard-cli-skia.js \
 *   --template ./templates/version-1.png \
 *   --json ./articles/prothomalo.json \
 *   --out ./photocards/prothomalo-photocard-skia \
 *   --font ./fonts/HindSiliguri-Bold.ttf
 */

import fs from "fs";
import path from "path";
import { Canvas, FontLibrary, loadImage } from "skia-canvas";

// ------------------ CLI ARGS ------------------
const args = process.argv.slice(2);
function argVal(key, def) {
  const i = args.indexOf(key);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
}

const TEMPLATE_PATH = argVal("--template", "../templates/version-1.png");
const JSON_PATH = argVal("--json", "../articles/prothomalo.json");
const OUT_DIR = argVal("--out", "../photocards/prothomalo-photocard-skia");
const FONT_PATH = argVal("--font", "../fonts/HindSiliguri-Bold.ttf");
const LIMIT = Number(argVal("--limit", "0"));

// ------------------ COLORS ------------------
const COLORS = {
  red: "#C4161C",
  dark: "#222222",
  mid: "#4A4A4A",
  white: "#FFFFFF",
};

// ------------------ BOX POSITIONS ------------------
const BOX = {
  TITLE: { l: 0.06, t: 0.52, r: 0.9, b: 0.9 },
  DATE: { l: 0.4, t: 0.84, r: 0.6, b: 0.875 },
  SRC: { l: 0.36, t: 0.895, r: 0.64, b: 0.93 },
};

const SHIFT = {
  TITLE: -0.022,
  DATE: -0.03,
  SRC: -0.05,
  PILL: 0.0,
};

const PILL = {
  TOP_OFFSET: -0.025,
  MIN_W: 0.12,
  H: 0.045,
  HPAD: 0.02,
  RADIUS: 0.022,
};

const FONTS = {
  TITLE: {
    start: 0.055,
    min: 0.035,
    lineHeight: 2.18,
    color: COLORS.red,
    align: "center",
  },
  DATE: {
    start: 0.018,
    min: 0.012,
    lineHeight: 1.12,
    color: COLORS.mid,
    align: "center",
  },
  SRC: {
    start: 0.018,
    min: 0.012,
    lineHeight: 1.12,
    color: COLORS.dark,
    align: "center",
  },
  PILL: {
    start: 0.018,
    min: 0.014,
    lineHeight: 1.0,
    color: COLORS.white,
    align: "center",
  },
};

// ------------------ HELPERS ------------------
function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}
function safeSlug(s, max = 60) {
  const out = String(s)
    .normalize("NFKD")
    .replace(/[^\p{Letter}\p{Number}]+/gu, "_")
    .replace(/^_+|_+$/g, "");
  return (out || "untitled").slice(0, max);
}
function pxBox(boxPerc, W, H) {
  const l = Math.round(boxPerc.l * W);
  const t = Math.round(boxPerc.t * H);
  const r = Math.round(boxPerc.r * W);
  const b = Math.round(boxPerc.b * H);
  return { l, t, r, b, w: r - l, h: b - t };
}
function drawCover(ctx, img, x, y, w, h) {
  const iw = img.width,
    ih = img.height;
  const srcRatio = iw / ih,
    tgtRatio = w / h;
  let dw, dh, dx, dy;
  if (srcRatio < tgtRatio) {
    dw = w;
    dh = Math.round(w / srcRatio);
    dx = x;
    dy = y - Math.round((dh - h) / 2);
  } else {
    dh = h;
    dw = Math.round(h * srcRatio);
    dy = y;
    dx = x - Math.round((dw - w) / 2);
  }
  ctx.drawImage(img, dx, dy, dw, dh);
}
function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

// ------------------ IMAGE + MASK BUILD ------------------
function buildOverlayAndBlackRect(templateImage) {
  const W = templateImage.width,
    H = templateImage.height;
  const tCan = new Canvas(W, H);
  const tCtx = tCan.getContext("2d");
  tCtx.drawImage(templateImage, 0, 0);
  const imgData = tCtx.getImageData(0, 0, W, H);
  const data = imgData.data;

  const overlay = tCtx.createImageData(W, H);
  const od = overlay.data;

  const isBlack = (r, g, b) => r <= 50 && g <= 50 && b <= 50;

  let minX = W,
    minY = H,
    maxX = 0,
    maxY = 0,
    count = 0;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i],
      g = data[i + 1],
      b = data[i + 2];
    if (isBlack(r, g, b)) {
      od[i + 3] = 0;
      const p = i >> 2;
      const x = p % W;
      const y = (p / W) | 0;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      count++;
    } else {
      od[i] = data[i];
      od[i + 1] = data[i + 1];
      od[i + 2] = data[i + 2];
      od[i + 3] = data[i + 3];
    }
  }

  const overlayCanvas = new Canvas(W, H);
  overlayCanvas.getContext("2d").putImageData(overlay, 0, 0);

  let rect;
  if (count > 0) {
    const pad = 2;
    rect = {
      x: Math.max(0, minX + pad),
      y: Math.max(0, minY + pad),
      w: Math.max(1, maxX - minX - 2 * pad),
      h: Math.max(1, maxY - minY - 2 * pad),
    };
  } else {
    const w = Math.round(W * 0.88);
    const h = Math.round(H * 0.46);
    const x = Math.round((W - w) / 2);
    const y = Math.round(H * 0.17);
    rect = { x, y, w, h };
  }
  return { overlayCanvas, rect };
}

// ------------------ TEXT DRAWING ------------------
function drawTextAutoshrink(
  ctx,
  text,
  box,
  dyPx,
  style,
  fontFamily,
  weight = "700"
) {
  const { l, t, w, h } = box;
  const W = ctx.canvas.width;
  let fontPx = Math.round(style.start * W);
  const minPx = Math.round(style.min * W);
  const lh = style.lineHeight;

  while (fontPx >= minPx) {
    ctx.font = `${weight} ${fontPx}px "${fontFamily}"`;
    const metrics = ctx.measureText(text);
    if (metrics.width <= w && fontPx * lh <= h) {
      const x = l + w / 2;
      const y = t + dyPx + h / 2 + fontPx / 2.8;
      ctx.fillStyle = style.color;
      ctx.textAlign = style.align;
      ctx.textBaseline = "middle";
      ctx.fillText(text, x, y);
      return;
    }
    fontPx -= 2;
  }
  ctx.font = `${weight} ${minPx}px "${fontFamily}"`;
  const x = l + w / 2;
  const y = t + dyPx + h / 2;
  ctx.fillStyle = style.color;
  ctx.textAlign = style.align;
  ctx.textBaseline = "middle";
  ctx.fillText(text, x, y);
}

function drawCategoryPill(ctx, text, photoRect, W, H, fontFamily) {
  if (!text) return;
  const pillH = PILL.H * H;
  const minW = PILL.MIN_W * W;
  const hpad = PILL.HPAD * W;
  const radius = PILL.RADIUS * W;
  const y = photoRect.y + photoRect.h + (PILL.TOP_OFFSET + SHIFT.PILL) * H;

  let fontPx = Math.round(FONTS.PILL.start * W);
  const minPx = Math.round(FONTS.PILL.min * W);
  ctx.font = `700 ${fontPx}px "${fontFamily}"`;
  let textW = ctx.measureText(text).width + 2 * hpad;
  while (textW > 0.5 * W && fontPx > minPx) {
    fontPx -= 2;
    ctx.font = `700 ${fontPx}px "${fontFamily}"`;
    textW = ctx.measureText(text).width + 2 * hpad;
  }
  const pillW = Math.max(minW, textW);
  const x = (W - pillW) / 2;

  ctx.beginPath();
  roundRect(ctx, x, y, pillW, pillH, radius);
  ctx.fillStyle = COLORS.red;
  ctx.fill();
  ctx.fillStyle = COLORS.white;
  ctx.font = `700 ${fontPx}px "${fontFamily}"`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, x + pillW / 2, y + pillH / 2);
}

// ------------------ MAIN ------------------
(async () => {
  try {
    // Register font
    if (fs.existsSync(FONT_PATH)) {
      FontLibrary.use("HindSiliguri", [path.resolve(FONT_PATH)]);
    } else {
      console.warn(`⚠️ Font not found: ${FONT_PATH}. Using system fallback.`);
    }
    const FONT_FAMILY = "HindSiliguri";

    const templateImg = await loadImage(TEMPLATE_PATH);
    const { overlayCanvas, rect } = buildOverlayAndBlackRect(templateImg);
    const W = templateImg.width,
      H = templateImg.height;

    ensureDir(OUT_DIR);

    const data = JSON.parse(fs.readFileSync(JSON_PATH, "utf8"));
    const articles = Array.isArray(data) ? data : data.articles || [data];
    const total =
      LIMIT > 0 ? Math.min(LIMIT, articles.length) : articles.length;

    console.log(`Template: ${TEMPLATE_PATH}`);
    console.log(`Articles: ${articles.length}, Processing: ${total}`);
    console.log(`Font: ${FONT_PATH}`);
    console.log(`Output: ${OUT_DIR}`);

    for (let i = 0; i < total; i++) {
      const a = articles[i];
      const imgURL = (a.article_image || "").trim();
      if (!imgURL) {
        console.log(`[${i + 1}] Skipped (no image)`);
        continue;
      }

      const title = (a.article_title || "").trim();
      const date = (a.published_date_bn || "").trim();
      const src = (a.source || "").trim();
      const cat = (a.category_bn || "").trim();

      try {
        const canvas = new Canvas(W, H);
        const ctx = canvas.getContext("2d");

        // base template
        ctx.drawImage(templateImg, 0, 0);

        // photo
        const photo = await loadImage(imgURL);
        drawCover(ctx, photo, rect.x, rect.y, rect.w, rect.h);

        // overlay
        ctx.drawImage(overlayCanvas, 0, 0);

        // texts
        if (cat) drawCategoryPill(ctx, cat, rect, W, H, FONT_FAMILY);
        if (title) {
          const box = pxBox(BOX.TITLE, W, H);
          const dy = SHIFT.TITLE * H;
          drawTextAutoshrink(ctx, title, box, dy, FONTS.TITLE, FONT_FAMILY);
        }
        if (date) {
          const box = pxBox(BOX.DATE, W, H);
          const dy = SHIFT.DATE * H;
          drawTextAutoshrink(ctx, date, box, dy, FONTS.DATE, FONT_FAMILY);
        }
        if (src) {
          const box = pxBox(BOX.SRC, W, H);
          const dy = SHIFT.SRC * H;
          drawTextAutoshrink(ctx, src, box, dy, FONTS.SRC, FONT_FAMILY);
        }

        const baseName = title
          ? safeSlug(title)
          : String(i + 1).padStart(3, "0");
        const outPath = path.join(OUT_DIR, `${baseName}.png`);
        await canvas.saveAs(outPath);
        console.log(
          `[${i + 1}/${total}] ✅ Saved -> ${path.basename(outPath)}`
        );
      } catch (err) {
        console.log(`[${i + 1}/${total}] ❌ FAIL (${imgURL}): ${err.message}`);
      }
    }

    console.log("✅ Done.");
  } catch (err) {
    console.error("ERROR:", err);
  }
})();
