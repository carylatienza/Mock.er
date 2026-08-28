import type { Mask } from './segment';

export type Silhouette = {
  topY: Float32Array;     // per source column x, first garment row; NaN if column empty
  bottomY: Float32Array;  // per source column x, last garment row; NaN if column empty
  minX: number;
  maxX: number;
};

/** Below this there is nothing worth wrapping — callers should warn, not warp. */
export const MIN_COVERAGE = 0.10;
export const canWarp = (mask: Mask | null): boolean =>
  !!mask && mask.bbox.maxX >= mask.bbox.minX && mask.coverage >= MIN_COVERAGE;

/** ImageData is DOM-only; node:test needs the same shape to exercise warpToPanel. */
export function makeImageData(width: number, height: number): ImageData {
  const data = new Uint8ClampedArray(width * height * 4);
  if (typeof ImageData === 'function') return new ImageData(data, width, height);
  return { data, width, height, colorSpace: 'srgb' } as ImageData;
}

export function buildSilhouette(mask: Mask): Silhouette {
  const { width, height, alpha, bbox } = mask;
  const topY = new Float32Array(width).fill(NaN);
  const bottomY = new Float32Array(width).fill(NaN);
  for (let x = bbox.minX; x <= bbox.maxX; x++) {
    for (let y = 0; y < height; y++) if (alpha[y * width + x] >= 128) { topY[x] = y; break; }
    for (let y = height - 1; y >= 0; y--) if (alpha[y * width + x] >= 128) { bottomY[x] = y; break; }
  }
  // Raw per-column extrema are jagged (one stray pixel = one spike) and a jagged
  // contour reads as a wobbly neckline on the mesh. Bridge holes, then smooth.
  bridge(topY, bbox.minX, bbox.maxX);
  bridge(bottomY, bbox.minX, bbox.maxX);
  const r = Math.max(2, Math.round(width * 0.01));
  smooth(topY, bbox.minX, bbox.maxX, r);
  smooth(bottomY, bbox.minX, bbox.maxX, r);
  return { topY, bottomY, minX: bbox.minX, maxX: bbox.maxX };
}

/** Fraction of the panel height over which the top contour stops steering. */
const YOKE = 0.28;

/**
 * Inverse-maps the source into a destW x destH panel where v=1 is the garment's
 * top edge and v=0 its hem — so the artwork follows the silhouette instead of
 * being pasted in as a rectangle.
 */
export function warpToPanel(src: ImageData, mask: Mask, destW: number, destH: number): ImageData {
  const out = makeImageData(destW, destH);
  if (!canWarp(mask)) return out;
  const s = buildSilhouette(mask);
  const span = s.maxX - s.minX;
  const d = out.data, sd = src.data;

  // The shoulder line: the highest the garment reaches on any column. Below the
  // yoke the top contour stops steering, so a straight chest band stays straight
  // instead of chasing the neckline down the chest in a zigzag.
  let shoulder = Infinity;
  for (let x = s.minX; x <= s.maxX; x++) {
    const v = s.topY[x];
    if (!Number.isNaN(v) && v < shoulder) shoulder = v;
  }
  if (!Number.isFinite(shoulder)) shoulder = mask.bbox.minY;

  for (let dy = 0; dy < destH; dy++) {
    const t = (dy + 0.5) / destH;          // 0 at the neckline, 1 at the hem
    for (let dx = 0; dx < destW; dx++) {
      const o = (dy * destW + dx) * 4;
      const srcX = s.minX + ((dx + 0.5) / destW) * span;
      const x0 = Math.floor(srcX), fx = srcX - x0;
      const top = lerpCol(s.topY, x0, fx), bot = lerpCol(s.bottomY, x0, fx);
      if (Number.isNaN(top) || Number.isNaN(bot)) continue;
      // Follow this column's own neck/armhole cut at the very top, then ease over
      // to the common shoulder line by the bottom of the yoke (t = YOKE).
      const k = t >= YOKE ? 1 : (t / YOKE) * (t / YOKE) * (3 - 2 * (t / YOKE));
      const effTop = top + (shoulder - top) * k;
      const srcY = effTop + t * (bot - effTop);
      if (mask.alpha[Math.round(srcY) * mask.width + Math.round(srcX)] < 128) continue;
      sample(sd, src.width, src.height, srcX, srcY, d, o);
    }
  }
  return out;
}

function lerpCol(a: Float32Array, x0: number, fx: number): number {
  const v0 = a[Math.max(0, Math.min(a.length - 1, x0))];
  const v1 = a[Math.max(0, Math.min(a.length - 1, x0 + 1))];
  if (Number.isNaN(v1)) return v0;
  if (Number.isNaN(v0)) return v1;
  return v0 + (v1 - v0) * fx;
}

/** Linear fill across interior gaps (a hole in the mask must not blank a column). */
function bridge(a: Float32Array, minX: number, maxX: number) {
  let prev = -1;
  for (let x = minX; x <= maxX; x++) {
    if (Number.isNaN(a[x])) continue;
    if (prev >= 0 && x - prev > 1) {
      const step = (a[x] - a[prev]) / (x - prev);
      for (let g = prev + 1; g < x; g++) a[g] = a[prev] + step * (g - prev);
    }
    prev = x;
  }
}

function smooth(a: Float32Array, minX: number, maxX: number, r: number) {
  const src = a.slice();
  for (let x = minX; x <= maxX; x++) {
    let sum = 0, n = 0;
    for (let k = -r; k <= r; k++) {
      const xx = x + k;
      if (xx < minX || xx > maxX || Number.isNaN(src[xx])) continue;
      sum += src[xx]; n++;
    }
    if (n) a[x] = sum / n;
  }
}

function sample(sd: Uint8ClampedArray, w: number, h: number, x: number, y: number, out: Uint8ClampedArray, o: number) {
  const x0 = Math.max(0, Math.min(w - 1, Math.floor(x))), y0 = Math.max(0, Math.min(h - 1, Math.floor(y)));
  const x1 = Math.min(w - 1, x0 + 1), y1 = Math.min(h - 1, y0 + 1);
  const fx = x - x0, fy = y - y0;
  const i00 = (y0 * w + x0) * 4, i10 = (y0 * w + x1) * 4, i01 = (y1 * w + x0) * 4, i11 = (y1 * w + x1) * 4;
  for (let c = 0; c < 4; c++) {
    const a = sd[i00 + c] + (sd[i10 + c] - sd[i00 + c]) * fx;
    const b = sd[i01 + c] + (sd[i11 + c] - sd[i01 + c]) * fx;
    out[o + c] = a + (b - a) * fy;
  }
}
