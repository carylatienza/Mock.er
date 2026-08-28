import type { Mask } from './segment';
import type { RGB } from './color';
import { fitRect, rgbToHex } from './color';
import { canWarp, warpToPanel } from './warp';

export const TEX_SIZE = 2048;
const P = TEX_SIZE / 2;

// UV contract: v runs bottom-up, canvas y runs top-down, hence the v0.5-1.0 islands
// living in the TOP half of the canvas.
export const REGION: Record<'front' | 'back' | 'sideL' | 'sideR', { x: number; y: number; w: number; h: number }> = {
  front: { x: 0, y: 0, w: P, h: P },
  back: { x: P, y: 0, w: P, h: P },
  sideL: { x: 0, y: P, w: P, h: P },
  sideR: { x: P, y: P, w: P, h: P },
};

export type CompositeOpts = {
  image: ImageData | null;
  mask: Mask | null;
  mode: 'wrap' | 'graphic';
  nudge: { x: number; y: number; scale: number };  // graphic mode only; x/y in -1..1, scale ~0.2..2
  baseColor: RGB;
  sideOverride: RGB | null;
};

const EDGE = 0.12;  // fraction of panel width carried front -> back

export function drawComposite(canvas: HTMLCanvasElement, opts: CompositeOpts): void {
  canvas.width = canvas.height = TEX_SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const side = opts.sideOverride ?? opts.baseColor;

  ctx.fillStyle = rgbToHex(...side);
  for (const r of [REGION.back, REGION.sideL, REGION.sideR]) ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.fillStyle = rgbToHex(...opts.baseColor);
  ctx.fillRect(REGION.front.x, REGION.front.y, REGION.front.w, REGION.front.h);

  const F = REGION.front;
  if (opts.image) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(F.x, F.y, F.w, F.h);
    ctx.clip();
    if (opts.mode === 'wrap' && canWarp(opts.mask) && opts.mask) {
      ctx.drawImage(toCanvas(warpToPanel(opts.image, opts.mask, F.w, F.h)), F.x, F.y);
    } else {
      const n = opts.nudge;
      const f = fitRect(opts.image.width, opts.image.height, F.w, F.h);
      const w = f.w * n.scale, h = f.h * n.scale;
      ctx.drawImage(toCanvas(opts.image),
        F.x + (F.w - w) / 2 + (n.x * F.w) / 2,
        F.y + (F.h - h) / 2 + (n.y * F.h) / 2, w, h);
    }
    ctx.restore();
  }

  // Derived back: stripe carry-over, not a reconstruction. Whatever runs off the
  // front's side seams continues around the body; the middle stays base colour.
  const s = Math.round(F.w * EDGE);
  const front = document.createElement('canvas');
  front.width = F.w; front.height = F.h;
  front.getContext('2d')?.drawImage(canvas, F.x, F.y, F.w, F.h, 0, 0, F.w, F.h);
  const B = REGION.back;
  ctx.save();
  ctx.translate(B.x, B.y); ctx.scale(-1, 1);
  ctx.drawImage(front, 0, 0, s, F.h, -s, 0, s, F.h);
  ctx.restore();
  ctx.save();
  ctx.translate(B.x + B.w, B.y); ctx.scale(-1, 1);
  ctx.drawImage(front, F.w - s, 0, s, F.h, 0, 0, s, F.h);
  ctx.restore();
}

function toCanvas(img: ImageData): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = img.width; c.height = img.height;
  c.getContext('2d')?.putImageData(img, 0, 0);
  return c;
}

/** Tiling over/under weave, finite-differenced into a tangent-space normal map. */
export function makeFabricNormal(size = 64): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  if (!ctx) return c;
  const img = ctx.createImageData(size, size);
  const T = 8;  // thread pitch in px
  const ridge = (p: number) => Math.cos(((p % T) / T - 0.5) * Math.PI);
  // over/under checker: warp thread on top in one cell, weft on top in the next
  const height = (x: number, y: number) =>
    ((Math.floor(x / T) + Math.floor(y / T)) & 1) === 0 ? ridge(x) : ridge(y);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = height((x + 1) % size, y) - height((x + size - 1) % size, y);
      const dy = height(x, (y + 1) % size) - height(x, (y + size - 1) % size);
      const nx = -dx * 0.5, ny = -dy * 0.5, len = Math.hypot(nx, ny, 1);
      const o = (y * size + x) * 4;
      img.data[o] = ((nx / len) * 0.5 + 0.5) * 255;
      img.data[o + 1] = ((ny / len) * 0.5 + 0.5) * 255;
      img.data[o + 2] = (1 / len) * 0.5 * 255 + 127.5;
      img.data[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}
