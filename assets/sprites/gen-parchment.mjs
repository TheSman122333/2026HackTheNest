/**
 * Generates original "aged wanted-poster" parchment textures (no stock art): fibrous grain,
 * mottled browning, coffee stains, a burnt edge, torn ragged borders and a baked drop shadow.
 * Output: apps/mobile/assets/game/textures/parchment_{wide,square,tall}.webp (alpha).
 *   node assets/sprites/gen-parchment.mjs
 */
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, '../../apps/mobile/assets/game/textures');
mkdirSync(out, { recursive: true });

// Deterministic PRNG so the art is reproducible.
function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = Math.imul(s ^ (s >>> 15), 2246822507) ^ Math.imul(s ^ (s >>> 13), 3266489909)), (s >>>= 0) / 4294967296);
}

/** Smooth value noise with octaves, in [0,1]. */
function makeNoise(seed, cells) {
  const r = rng(seed);
  const grid = Array.from({ length: (cells + 1) * (cells + 1) }, () => r());
  const at = (x, y) => grid[y * (cells + 1) + x];
  const fade = (t) => t * t * (3 - 2 * t);
  return (u, v) => {
    const x = Math.min(u * cells, cells - 1e-6), y = Math.min(v * cells, cells - 1e-6);
    const x0 = Math.floor(x), y0 = Math.floor(y), fx = fade(x - x0), fy = fade(y - y0);
    const a = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * fx;
    const b = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * fx;
    return a + (b - a) * fy;
  };
}
function fbm(seed, octaves) {
  const layers = Array.from({ length: octaves }, (_, i) => makeNoise(seed + i * 101, 4 << i));
  return (u, v) => {
    let sum = 0, amp = 0.5, norm = 0;
    for (const n of layers) { sum += n(u, v) * amp; norm += amp; amp *= 0.5; }
    return sum / norm;
  };
}

async function make(name, W, H, seed) {
  const PAD = 18; // room for torn edges + shadow
  const w = W + PAD * 2, h = H + PAD * 2;
  const grain = fbm(seed, 6);
  const mottle = fbm(seed + 7, 4);
  const tear = fbm(seed + 13, 7);
  const r = rng(seed + 99);
  const stains = Array.from({ length: 4 }, () => ({ x: r() * W, y: r() * H, rad: 40 + r() * 90, ring: false }));
  const fibers = Array.from({ length: 260 }, () => ({ x: r() * W, y: r() * H, len: 10 + r() * 50, ang: (r() - 0.5) * 0.6, dark: r() < 0.5 }));

  const paper = Buffer.alloc(w * h * 4);
  const alpha = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const px = x - PAD, py = y - PAD;
      // Distance inside the sheet, with a ragged torn border driven by noise along each edge.
      const raggedL = 4 + tear(0.02, py / H) * 14, raggedR = 4 + tear(0.98, py / H) * 14;
      const raggedT = 4 + tear(px / W, 0.02) * 14, raggedB = 4 + tear(px / W, 0.98) * 14;
      const d = Math.min(px - raggedL, W - px - raggedR, py - raggedT, H - py - raggedB);
      const i = y * w + x;
      if (d <= 0) { alpha[i] = 0; continue; }
      alpha[i] = Math.min(1, d / 1.5);
      const u = px / W, v = py / H;
      // Base parchment with mottled browning.
      let R = 238, G = 210, B = 154;
      const m = mottle(u, v), g = grain(u * 3, v * 3);
      const tone = (m - 0.5) * 34 + (g - 0.5) * 18;
      R += tone; G += tone * 0.95; B += tone * 0.7;
      // Burnt, darker edge band (wanted-poster ageing).
      const edge = Math.max(0, 1 - d / (34 + m * 26));
      R -= edge * 95; G -= edge * 110; B -= edge * 105;
      if (d < 4) { R -= 60; G -= 70; B -= 60; } // scorched rim right at the tear
      // Coffee stains: soft blots and the odd ring.
      for (const s of stains) {
        const dist = Math.hypot(px - s.x, py - s.y) / s.rad;
        const k = s.ring ? Math.max(0, 1 - Math.abs(dist - 1) * 9) * 0.5 : Math.max(0, 1 - dist) * 0.22;
        R -= k * 50; G -= k * 62; B -= k * 70;
      }
      paper[i * 4] = Math.max(0, Math.min(255, R));
      paper[i * 4 + 1] = Math.max(0, Math.min(255, G));
      paper[i * 4 + 2] = Math.max(0, Math.min(255, B));
      paper[i * 4 + 3] = Math.round(alpha[i] * 255);
    }
  }
  // Paper fibres.
  for (const f of fibers) {
    for (let t = 0; t < f.len; t++) {
      const x = Math.round(PAD + f.x + Math.cos(f.ang) * t), y = Math.round(PAD + f.y + Math.sin(f.ang) * t);
      if (x < 0 || y < 0 || x >= w || y >= h) continue;
      const i = (y * w + x) * 4;
      if (!paper[i + 3]) continue;
      const k = f.dark ? -14 : 12;
      for (let c = 0; c < 3; c++) paper[i + c] = Math.max(0, Math.min(255, paper[i + c] + k));
    }
  }

  // Baked drop shadow: the sheet's silhouette, offset and blurred.
  const shadowRaw = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) { shadowRaw[i * 4 + 3] = Math.round(alpha[i] * 150); }
  const shadow = await sharp(shadowRaw, { raw: { width: w, height: h, channels: 4 } }).blur(5).png().toBuffer();
  const sheet = await sharp(paper, { raw: { width: w, height: h, channels: 4 } }).png().toBuffer();
  await sharp({ create: { width: w, height: h, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: shadow, left: 6, top: 8 }, { input: sheet, left: 0, top: 0 }])
    .webp({ quality: 82, alphaQuality: 90 })
    .toFile(join(out, `parchment_${name}.webp`));
  console.log('wrote', name, w, 'x', h);
}

await make('wide', 860, 520, 11);
await make('square', 640, 640, 23);
await make('tall', 520, 900, 37);
