#!/usr/bin/env node
/**
 * Photocard CLI (Text-only overlay on pre-rendered image+template combo)
 *
 * - Expects each article's template+image to exist at: ../photocards/photocard-image-only/${index}.png
 * - Overlays only: category (as transparent text), title, date, source
 * - Saves output to: ./photocards/prothomalo-photocard-skia/${index}.png
 *
 * Run:
 * node photocard-cli-skia.js \
 *   --json ./articles/prothomalo.json \
 *   --in ./photocards/photocard-image-only \
 *   --out ./photocards/prothomalo-photocard-skia \
 *   --font ./fonts/HindSiliguri-Bold.ttf
 */

import fs from "fs";
import path from "path";
import { Canvas, FontLibrary, loadImage } from "skia-canvas";

const args = process.argv.slice(2);
function argVal(key, def) {
  const i = args.indexOf(key);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
}

const JSON_PATH = argVal("--json", "../articles/prothomalo.json");
const IN_DIR = argVal("--in", "../photocards/prothomalo-photocard-image-only");
const OUT_DIR = argVal("--out", "../photocards/prothomalo-photocard-skia");
const FONT_PATH = argVal("--font", "../fonts/HindSiliguri-Bold.ttf");
const LIMIT = Number(argVal("--limit", "0"));

const COLORS = {
  red: "#C4161C",
  dark: "#222222",
  mid: "#4A4A4A",
  white: "#ffffff",
};

const BOX = {
  TITLE: { l: 0.06, t: 0.52, r: 0.9, b: 0.85 },
  DATE: { l: 0.4, t: 0.84, r: 0.6, b: 0.875 },
  SRC: { l: 0.36, t: 0.895, r: 0.64, b: 0.93 },
};

const SHIFT = {
  TITLE: -0.022,
  DATE: -0.035,
  SRC: -0.05,
  PILL: 0.065,
};

const FONTS = {
  TITLE: {
    start: 0.04,
    min: 0.035,
    lineHeight: 1.18,
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

function pxBox(boxPerc, W, H) {
  const l = Math.round(boxPerc.l * W);
  const t = Math.round(boxPerc.t * H);
  const r = Math.round(boxPerc.r * W);
  const b = Math.round(boxPerc.b * H);
  return { l, t, r, b, w: r - l, h: b - t };
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function drawTextAutoshrink(ctx, text, box, dyPx, style, fontFamily, weight = "700") {
  const { l, t, w, h } = box;
  const W = ctx.canvas.width;
  let fontPx = Math.round(style.start * W);
  const minPx = Math.round(style.min * W);
  const lh = style.lineHeight;

  function wrapLines(txt, fontSize) {
    ctx.font = `${weight} ${fontSize}px "${fontFamily}"`;
    const words = txt.split(/\s+/);
    const lines = [];
    let current = "";
    for (let word of words) {
      const test = current ? current + " " + word : word;
      if (ctx.measureText(test).width <= w) {
        current = test;
      } else {
        if (current) lines.push(current);
        current = word;
      }
    }
    if (current) lines.push(current);
    return lines.slice(0, 3);
  }

  let lines = [];
  while (fontPx >= minPx) {
    lines = wrapLines(text, fontPx);
    const totalHeight = lines.length * fontPx * lh;
    if (totalHeight <= h) break;
    fontPx -= 2;
  }

  const x = l + w / 2;
  const yStart = t + dyPx + (h - lines.length * fontPx * lh) / 2 + fontPx;
  ctx.fillStyle = style.color;
  ctx.textAlign = style.align;
  ctx.textBaseline = "alphabetic";
  ctx.font = `${weight} ${fontPx}px "${fontFamily}"`;

  let y = yStart;
  for (const line of lines) {
    ctx.fillText(line, x, y);
    y += fontPx * lh;
  }
}

(async () => {
  if (fs.existsSync(FONT_PATH)) {
    FontLibrary.use("HindSiliguri", [path.resolve(FONT_PATH)]);
  }
  const FONT_FAMILY = "HindSiliguri";

  const data = JSON.parse(fs.readFileSync(JSON_PATH, "utf8"));
  const articles = Array.isArray(data) ? data : data.articles || [data];
  const total = LIMIT > 0 ? Math.min(LIMIT, articles.length) : articles.length;

  ensureDir(OUT_DIR);
  for (let i = 0; i < total; i++) {
    const a = articles[i];
    const title = (a.article_title || "").trim();
    const date = (a.published_date_bn || "").trim();
    const src = (a.source || "").trim();
    const cat = (a.category_bn || "").trim();

    const inputPath = path.join(IN_DIR, `${i + 1}.png`);
    if (!fs.existsSync(inputPath)) {
      console.warn(`[${i + 1}] Skipped (no input image)`);
      continue;
    }

    try {
      const baseImage = await loadImage(inputPath);
      const W = baseImage.width;
      const H = baseImage.height;
      const canvas = new Canvas(W, H);
      const ctx = canvas.getContext("2d");

      ctx.drawImage(baseImage, 0, 0);

      if (cat) {
        const box = pxBox({ l: 0.5 - 0.25, t: 0.48, r: 0.5 + 0.25, b: 0.52 }, W, H);
        const dy = SHIFT.PILL * H;
        drawTextAutoshrink(ctx, cat, box, dy, FONTS.PILL, FONT_FAMILY);
      }
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

      const outPath = path.join(OUT_DIR, `${i + 1}.png`);
      await canvas.saveAs(outPath);
      console.log(`[${i + 1}/${total}] ✅ Saved -> ${path.basename(outPath)}`);
    } catch (err) {
      console.error(`[${i + 1}/${total}] ❌ FAIL: ${err.message}`);
    }
  }
})();