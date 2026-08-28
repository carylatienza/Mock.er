import test from 'node:test';
import assert from 'node:assert/strict';
import { extractBaseColor, rgbToCmyk, fitRect } from './color.ts';
import type { Mask } from './segment';
import { makeImageData, warpToPanel } from './warp.ts';

test('extractBaseColor picks the dominant stripe, not the mean', () => {
  // 3/4 navy, 1/4 white. The mean is a muddy blue-grey; the mode is navy.
  const n = 400;
  const px = new Uint8ClampedArray(n * 4);
  for (let i = 0; i < n; i++) {
    const white = i % 4 === 0;
    px[i * 4] = white ? 250 : 20;
    px[i * 4 + 1] = white ? 250 : 30;
    px[i * 4 + 2] = white ? 250 : 90;
    px[i * 4 + 3] = 255;
  }
  const [r, g, b] = extractBaseColor(px);
  const d = (a: number[], c: number[]) => Math.hypot(a[0] - c[0], a[1] - c[1], a[2] - c[2]);
  assert.ok(d([r, g, b], [20, 30, 90]) < 12, `expected navy, got ${r},${g},${b}`);
  assert.ok(d([r, g, b], [77, 85, 130]) > 60, 'must not be the mean');
});

test('rgbToCmyk', () => {
  assert.deepEqual(rgbToCmyk(0, 0, 0), { c: 0, m: 0, y: 0, k: 100 });
  assert.deepEqual(rgbToCmyk(255, 255, 255), { c: 0, m: 0, y: 0, k: 0 });
  assert.deepEqual(rgbToCmyk(255, 0, 0), { c: 0, m: 100, y: 100, k: 0 });
});

test('fitRect letterboxes in both orientations', () => {
  const wide = fitRect(200, 100, 100, 100);
  assert.deepEqual(wide, { x: 0, y: 25, w: 100, h: 50 });
  const tall = fitRect(100, 200, 100, 100);
  assert.deepEqual(tall, { x: 25, y: 0, w: 50, h: 100 });
});

// --- regression guard: the artwork must follow the garment contour ---------
const W = 100, H = 100, MIN_X = 10, MAX_X = 89, HEM = 89, SHOULDER = 18, DIP = 20;
const topAt = (x: number) => Math.round(SHOULDER + DIP * (0.5 - 0.5 * Math.cos((2 * Math.PI * (x - MIN_X)) / (MAX_X - MIN_X))));

function jersey() {
  const alpha = new Uint8Array(W * H);
  const img = makeImageData(W, H);
  const p = img.data;
  for (let x = MIN_X; x <= MAX_X; x++) {
    const t = topAt(x);
    for (let y = t; y <= HEM; y++) {
      const i = y * W + x;
      alpha[i] = 255;
      // neckline band red, hem band green, body white
      const red = y < t + 6, green = y > HEM - 6;
      p[i * 4] = red || !green ? 255 : 0;
      p[i * 4 + 1] = red ? 0 : 255;
      p[i * 4 + 2] = red || green ? 0 : 255;
      p[i * 4 + 3] = 255;
    }
  }
  const mask: Mask = {
    width: W, height: H, alpha,
    bbox: { minX: MIN_X, minY: SHOULDER, maxX: MAX_X, maxY: HEM },
    coverage: alpha.reduce<number>((a, v) => a + (v ? 1 : 0), 0) / (W * H),
  };
  return { img, mask };
}

test('warpToPanel maps the neckline to v=1 and the hem to v=0', () => {
  const { img, mask } = jersey();
  const D = 64;
  const out = warpToPanel(img, mask, D, D);
  const at = (dx: number, dy: number) => {
    const o = (dy * D + dx) * 4;
    return [out.data[o], out.data[o + 1], out.data[o + 2], out.data[o + 3]];
  };
  for (let dx = 0; dx < D; dx++) {
    const [r, g, , a] = at(dx, 0);
    // <255 only from bilinear touching the transparent pixel just above the neckline
    assert.ok(a > 200, `top row col ${dx} is transparent — contour lost`);
    assert.ok(r > 200 && g < 60, `top row col ${dx} should be the neckline band, got ${r},${g}`);
    const [r2, g2, , a2] = at(dx, D - 1);
    assert.ok(a2 > 200, `bottom row col ${dx} is transparent`);
    assert.ok(g2 > 200 && r2 < 60, `bottom row col ${dx} should be the hem band, got ${r2},${g2}`);
  }

  // A rectangular paste samples the bbox uniformly, so at the neckline dip the
  // top row lands on empty backdrop above the garment — this is the bug.
  const srcX = Math.round(MIN_X + 0.5 * (MAX_X - MIN_X));
  const srcY = Math.round(SHOULDER + (0.5 / D) * (HEM - SHOULDER));
  assert.equal(mask.alpha[srcY * W + srcX], 0, 'rect paste should land off-garment at the dip');
  assert.ok(topAt(srcX) - srcY > 15, 'the dip must be deep enough to be a real test');
});
