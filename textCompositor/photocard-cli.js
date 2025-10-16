#!/usr/bin/env node
/**
 * Photocard CLI (image + text, template overlay) - Node.js
 * - Reads JSON: ./articles/prothomalo.json  (supports array or {articles: [...]})
 * - Reads template PNG: ./templates/version-1.png
 * - Places article_image into black box (cover fit)
 * - Reapplies template overlay (non-black pixels on top)
 * - Draws category pill, title, date, source (Bangla font supported)
 * - Saves PNGs into ./photocards/prothomalo-photocard-cli
 *
 * Run:
 * node photocard-cli.js \
 *   --template ./templates/version-1.png \
 *   --json ./articles/prothomalo.json \
 *   --out ./photocards/prothomalo-photocard-cli \
 *   --font ./fonts/HindSiliguri-Bold.ttf
 */

const fs = require("fs");
const path = require("path");
// const { createCanvas, loadImage, registerFont } = require("canvas");
const { Canvas, Image, FontLibrary } = require("skia-canvas");

// -------- CLI ARGS (no dependency) --------
const args = process.argv.slice(2);
function argVal(key, def) {
  const i = args.indexOf(key);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
}
const TEMPLATE_PATH = argVal("--template", "../templates/version-1.png");
const JSON_PATH     = argVal("--json", "../articles/prothomalo.json");
const OUT_DIR       = argVal("--out", "../photocards/prothomalo-photocard-cli");
const FONT_PATH     = argVal("--font", "../fonts/HindSiliguri-Bold.ttf");
const LIMIT         = Number(argVal("--limit", "0")); // 0 = no limit

// -------- Brand & Layout (mirrors your Python) --------
const COLORS = {
  red:  "#C4161C",
  dark: "#222222",
  mid:  "#4A4A4A",
  white:"#FFFFFF",
};

// % boxes (of template W/H)
const BOX = {
  TITLE: { l: 0.060, t: 0.62,  r: 0.940, b: 0.80 },
  DATE:  { l: 0.40,  t: 0.84,  r: 0.60,  b: 0.875 },
  SRC:   { l: 0.36,  t: 0.895, r: 0.64,  b: 0.93 },
};

// Tiny vertical nudges (in % of H)
const SHIFT = {
  TITLE: -0.022,
  DATE:  -0.03,
  SRC:   -0.05,
  PILL:   0.000,
};

// Pill geometry (% of W/H)
const PILL = {
  TOP_OFFSET: -0.025,
  MIN_W: 0.12,
  H:     0.045,
  HPAD:  0.020,
  RADIUS:0.022,
};

// Font sizing (% of W)
const FONTS = {
  TITLE: { start: 0.055, min: 0.035, lineHeight: 1.18, color: COLORS.red,  align: "center" },
  DATE:  { start: 0.018, min: 0.012, lineHeight: 1.12, color: COLORS.mid,  align: "center" },
  SRC:   { start: 0.018, min: 0.012, lineHeight: 1.12, color: COLORS.dark, align: "center" },
  PILL:  { start: 0.018, min: 0.014, lineHeight: 1.00, color: COLORS.white, align: "center" },
};

// -------- Utils --------
function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}
function safeSlug(s, max = 64) {
  const out = String(s).normalize("NFKD").replace(/[^\w\-]+/g, "_").replace(/^_+|_+$/g, "");
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
  const iw = img.width, ih = img.height;
  const srcRatio = iw / ih, tgtRatio = w / h;
  let dw, dh, dx, dy;
  if (srcRatio < tgtRatio) {
    dw = w; dh = Math.round(w / srcRatio);
    dx = x; dy = y - Math.round((dh - h) / 2);
  } else {
    dh = h; dw = Math.round(h * srcRatio);
    dy = y; dx = x - Math.round((dw - w) / 2);
  }
  ctx.drawImage(img, dx, dy, dw, dh);
}
function layoutWrappedLines(ctx, text, maxWidth, fontPx, lineHeight, fontFamily, weight = 700) {
  ctx.font = `${weight} ${fontPx}px ${fontFamily}`;
  const words = String(text).split(/\s+/);
  const lines = [];
  let cur = "";
  for (const w of words) {
    const t = cur ? cur + " " + w : w;
    if (ctx.measureText(t).width <= maxWidth) {
      cur = t;
    } else {
      if (cur) lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}
async function loadImageNode(src) {
  // node-canvas accepts buffer or URL; for remote, just pass URL
  return await loadImage(src);
}

// -------- Detect black window + build overlay mask (non-black template pixels) --------
function buildOverlayAndBlackRect(templateImage) {
  const W = templateImage.width, H = templateImage.height;
  const tCan = createCanvas(W, H);
  const tCtx = tCan.getContext("2d");
  tCtx.drawImage(templateImage, 0, 0);

  const img = tCtx.getImageData(0, 0, W, H);
  const data = img.data;

  const overlay = tCtx.createImageData(W, H);
  const od = overlay.data;

  const isBlack = (r, g, b) => (r <= 50 && g <= 50 && b <= 50);

  let minX = W, minY = H, maxX = 0, maxY = 0, count = 0;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
    if (isBlack(r, g, b)) {
      // transparent in overlay
      od[i] = 0; od[i + 1] = 0; od[i + 2] = 0; od[i + 3] = 0;
      const p = (i >> 2);
      const x = p % W;
      const y = (p / W) | 0;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
      count++;
    } else {
      // copy original pixel into overlay
      od[i] = data[i];
      od[i + 1] = data[i + 1];
      od[i + 2] = data[i + 2];
      od[i + 3] = data[i + 3];
    }
  }

  // Overlay canvas
  const overlayCanvas = createCanvas(W, H);
  overlayCanvas.getContext("2d").putImageData(overlay, 0, 0);

  // Find black rect (with small padding like Python)
  let rect;
  if (count > 0) {
    const pad = 2;
    const x = Math.max(0, minX + pad);
    const y = Math.max(0, minY + pad);
    const w = Math.max(1, (maxX - minX + 1) - 2 * pad);
    const h = Math.max(1, (maxY - minY + 1) - 2 * pad);
    rect = { x, y, w, h };
  } else {
    // Fallback
    const w = Math.round(W * 0.88);
    const h = Math.round(H * 0.46);
    const x = Math.round((W - w) / 2);
    const y = Math.round(H * 0.17);
    rect = { x, y, w, h };
  }
  return { overlayCanvas, rect };
}

// -------- Text drawing (autoshrink to fit box) --------
function drawTextAutoshrink(ctx, text, box, dyPx, style, fontFamily, weight = 700) {
  const { l, t, w, h } = box;
  const W = ctx.canvas.width, H = ctx.canvas.height;
  let fontPx = Math.round(style.start * W);
  const minPx = Math.round(style.min * W);
  const lh = style.lineHeight;

  while (fontPx >= minPx) {
    const lines = layoutWrappedLines(ctx, text, w, fontPx, lh, fontFamily, weight);
    const totalH = Math.ceil(lines.length * fontPx * lh);
    if (totalH <= h) {
      const x = l + w / 2;
      const y0 = t + dyPx + Math.round((h - totalH) / 2) + Math.round(fontPx);
      ctx.save();
      ctx.fillStyle = style.color;
      ctx.textAlign = style.align;
      ctx.textBaseline = "alphabetic";
      ctx.font = `${weight} ${fontPx}px ${fontFamily}`;
      let y = y0;
      for (const line of lines) {
        ctx.fillText(line, x, y);
        y += Math.round(fontPx * lh);
      }
      ctx.restore();
      return;
    }
    fontPx -= 2;
  }
  // fallback draw at min size, single line center
  ctx.save();
  ctx.fillStyle = style.color;
  ctx.textAlign = style.align;
  ctx.textBaseline = "middle";
  ctx.font = `${weight} ${minPx}px ${fontFamily}`;
  ctx.fillText(text, l + w / 2, t + h / 2 + dyPx);
  ctx.restore();
}

// -------- Rounded pill with centered text --------
function drawCategoryPill(ctx, text, photoRect, W, H, fontFamily) {
  if (!text) return;
  const pillH   = PILL.H * H;
  const minW    = PILL.MIN_W * W;
  const hpad    = PILL.HPAD * W;
  const radius  = PILL.RADIUS * W;
  const y       = photoRect.y + photoRect.h + (PILL.TOP_OFFSET + SHIFT.PILL) * H;

  // find font size that fits a width
  let fontPx = Math.round(FONTS.PILL.start * W);
  const minPx = Math.round(FONTS.PILL.min * W);

  const tmp = createCanvas(1, 1);
  const tctx = tmp.getContext("2d");
  while (fontPx >= minPx) {
    tctx.font = `700 ${fontPx}px ${fontFamily}`;
    const textW = Math.ceil(tctx.measureText(text).width + 2 * hpad);
    if (textW <= Math.max(minW, 0.5 * W)) break;
    fontPx -= 2;
  }
  tctx.font = `700 ${Math.max(fontPx, minPx)}px ${fontFamily}`;
  const pillW = Math.max(minW, Math.ceil(tctx.measureText(text).width + 2 * hpad));

  // draw rounded rect
  const x = Math.round((W - pillW) / 2);
  ctx.save();
  ctx.fillStyle = COLORS.red;
  roundRect(ctx, x, y, pillW, pillH, radius);
  ctx.fill();

  // text
  ctx.fillStyle = COLORS.white;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `700 ${Math.max(fontPx, minPx)}px ${fontFamily}`;
  ctx.fillText(text, x + pillW / 2, y + pillH / 2);
  ctx.restore();
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

// -------- JSON parsing --------
function readArticles(jsonPath) {
  const raw = fs.readFileSync(jsonPath, "utf-8");
  const data = JSON.parse(raw);
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.articles)) return data.articles;
  return [data];
}

// -------- MAIN --------
(async () => {
  try {
    // Register font for Bangla text
    if (fs.existsSync(FONT_PATH)) {
      registerFont(path.resolve(FONT_PATH), { family: "HindSiliguri" });
    } else {
      console.warn(`WARN: font not found at ${FONT_PATH}, falling back to system font`);
    }
    const FONT_FAMILY = fs.existsSync(FONT_PATH)
      ? "HindSiliguri, system-ui, sans-serif"
      : "system-ui, sans-serif";

    // Load template
    if (!fs.existsSync(TEMPLATE_PATH)) throw new Error(`Template not found: ${TEMPLATE_PATH}`);
    const templateImg = await loadImageNode(path.resolve(TEMPLATE_PATH));
    const W = templateImg.width, H = templateImg.height;

    // Build overlay & black rect from template
    const { overlayCanvas, rect } = buildOverlayAndBlackRect(templateImg);

    // Output dir
    ensureDir(OUT_DIR);

    // Read articles
    if (!fs.existsSync(JSON_PATH)) throw new Error(`JSON not found: ${JSON_PATH}`);
    const articles = readArticles(JSON_PATH);
    const total = LIMIT > 0 ? Math.min(LIMIT, articles.length) : articles.length;

    console.log(`Template: ${TEMPLATE_PATH} (${W}x${H})`);
    console.log(`Articles: ${JSON_PATH} (${articles.length} rows; processing ${total})`);
    console.log(`Output:   ${OUT_DIR}`);
    console.log(`Font:     ${FONT_PATH}`);

    for (let i = 0; i < total; i++) {
      const a = articles[i];
      const imgURL = String(a.article_image || "").trim();
      if (!imgURL) {
        console.log(`[${i + 1}/${total}] Skipped (no article_image)`);
        continue;
      }
      const title = (a.article_title || "").trim();
      const date  = (a.published_date_bn || "").trim();
      const src   = (a.source || "").trim();
      const cat   = (a.category_bn || "").trim();

      try {
        const canvas = createCanvas(W, H);
        const ctx = canvas.getContext("2d");

        // 1) base: template (not strictly necessary, but harmless)
        ctx.drawImage(templateImg, 0, 0);

        // 2) photo into black rect
        const photo = await loadImageNode(imgURL);
        drawCover(ctx, photo, rect.x, rect.y, rect.w, rect.h);

        // 3) overlay non-black pixels from template
        ctx.drawImage(overlayCanvas, 0, 0);

        // 4) texts
        // Category pill at bottom center of photo
        if (cat) drawCategoryPill(ctx, cat, rect, W, H, FONT_FAMILY);

        // Title
        if (title) {
          const box = pxBox(BOX.TITLE, W, H);
          const dy  = SHIFT.TITLE * H;
          drawTextAutoshrink(ctx, title, box, dy, FONTS.TITLE, FONT_FAMILY, 700);
        }

        // Date
        if (date) {
          const box = pxBox(BOX.DATE, W, H);
          const dy  = SHIFT.DATE * H;
          drawTextAutoshrink(ctx, date, box, dy, FONTS.DATE, FONT_FAMILY, 700);
        }

        // Source
        if (src) {
          const box = pxBox(BOX.SRC, W, H);
          const dy  = SHIFT.SRC * H;
          drawTextAutoshrink(ctx, src, box, dy, FONTS.SRC, FONT_FAMILY, 700);
        }

        // 5) save
        const baseName = title ? safeSlug(title) : String(i + 1).padStart(3, "0");
        const outPath = path.join(OUT_DIR, `${baseName}.png`);
        const buf = canvas.toBuffer("image/png");
        fs.writeFileSync(outPath, buf);
        console.log(`[${i + 1}/${total}] OK -> ${path.basename(outPath)}`);
      } catch (err) {
        console.log(`[${i + 1}/${total}] FAIL (${imgURL}): ${err.message || err}`);
      }
    }

    console.log("✅ Done.");
  } catch (e) {
    console.error("ERROR:", e.message || e);
    process.exit(1);
  }
})();
