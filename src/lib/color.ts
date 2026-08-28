export type RGB = [number, number, number];

// 4 bits per channel -> 4096 buckets. Coarse enough that antialiasing and jpeg
// noise collapse into the colour they came from.
const bucketOf = (r: number, g: number, b: number) => ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);

/** Modal colour, not mean — the mean of a striped jersey is mud. */
export function extractBaseColor(pixels: Uint8ClampedArray, mask?: Uint8Array): RGB {
  const n = pixels.length >> 2;
  const count = new Int32Array(4096);
  const sr = new Float64Array(4096), sg = new Float64Array(4096), sb = new Float64Array(4096);
  for (let i = 0; i < n; i++) {
    if (pixels[i * 4 + 3] < 128) continue;
    if (mask && mask[i] < 128) continue;
    const r = pixels[i * 4], g = pixels[i * 4 + 1], b = pixels[i * 4 + 2];
    const k = bucketOf(r, g, b);
    count[k]++; sr[k] += r; sg[k] += g; sb[k] += b;
  }
  let best = -1, bestN = 0;
  for (let k = 0; k < 4096; k++) if (count[k] > bestN) { bestN = count[k]; best = k; }
  if (best < 0) return [128, 128, 128];
  // average of the actual pixels in the winning bucket, not the bucket centre
  return [Math.round(sr[best] / bestN), Math.round(sg[best] / bestN), Math.round(sb[best] / bestN)];
}

export function rgbToCmyk(r: number, g: number, b: number): { c: number; m: number; y: number; k: number } {
  const R = r / 255, G = g / 255, B = b / 255;
  const k = 1 - Math.max(R, G, B);
  if (k >= 1) return { c: 0, m: 0, y: 0, k: 100 };
  const d = 1 - k;
  return {
    c: Math.round(((d - R) / d) * 100),
    m: Math.round(((d - G) / d) * 100),
    y: Math.round(((d - B) / d) * 100),
    k: Math.round(k * 100),
  };
}

export function rgbToHex(r: number, g: number, b: number): string {
  return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
}

/**
 * Flat vector art uses a handful of spot colours; even with antialiased edges it
 * rarely spans more than ~60 of the 4096 buckets. A photographed or 3D-rendered
 * jersey carries shading ramps that sweep dozens of buckets per hue and lands in
 * the hundreds. 128 (3% of the bucket space) sits in the empty gap between them.
 */
export function looksBaked(pixels: Uint8ClampedArray, mask?: Uint8Array): boolean {
  const n = pixels.length >> 2;
  const seen = new Uint8Array(4096);
  let distinct = 0;
  for (let i = 0; i < n; i++) {
    if (pixels[i * 4 + 3] < 128) continue;
    if (mask && mask[i] < 128) continue;
    const k = bucketOf(pixels[i * 4], pixels[i * 4 + 1], pixels[i * 4 + 2]);
    if (!seen[k]) { seen[k] = 1; if (++distinct > 128) return true; }
  }
  return false;
}

export function fitRect(imgW: number, imgH: number, boxW: number, boxH: number): { x: number; y: number; w: number; h: number } {
  const s = Math.min(boxW / imgW, boxH / imgH);
  const w = imgW * s, h = imgH * s;
  return { x: (boxW - w) / 2, y: (boxH - h) / 2, w, h };
}
