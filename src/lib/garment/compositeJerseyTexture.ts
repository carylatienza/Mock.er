import { extractBaseColor, type Rgb, rgbToCss } from '@/lib/garment/extractBaseColor';
import { ATLAS_HEIGHT, ATLAS_WIDTH, UV_ISLANDS, type UvRect } from '@/lib/garment/uvLayout';

function fillRect(ctx: CanvasRenderingContext2D, rect: UvRect, color: string) {
  ctx.fillStyle = color;
  ctx.fillRect(
    rect.x * ATLAS_WIDTH,
    rect.y * ATLAS_HEIGHT,
    rect.w * ATLAS_WIDTH,
    rect.h * ATLAS_HEIGHT,
  );
}

function drawImageContained(
  ctx: CanvasRenderingContext2D,
  image: CanvasImageSource,
  rect: UvRect,
) {
  const imgWidth =
    'width' in image && typeof image.width === 'number' ? image.width : 1;
  const imgHeight =
    'height' in image && typeof image.height === 'number' ? image.height : 1;

  const rx = rect.x * ATLAS_WIDTH;
  const ry = rect.y * ATLAS_HEIGHT;
  const rw = rect.w * ATLAS_WIDTH;
  const rh = rect.h * ATLAS_HEIGHT;
  const scale = Math.min(rw / imgWidth, rh / imgHeight);
  const dw = imgWidth * scale;
  const dh = imgHeight * scale;
  const dx = rx + (rw - dw) / 2;
  const dy = ry + (rh - dh) / 2;

  ctx.save();
  ctx.beginPath();
  ctx.rect(rx, ry, rw, rh);
  ctx.clip();
  ctx.drawImage(image, dx, dy, dw, dh);
  ctx.restore();
}

function carryFrontStripesToBack(ctx: CanvasRenderingContext2D, bandFraction = 0.12) {
  const front = UV_ISLANDS.front;
  const back = UV_ISLANDS.back;
  const bandHeight = front.h * ATLAS_HEIGHT * bandFraction;
  const sy = front.y * ATLAS_HEIGHT + front.h * ATLAS_HEIGHT - bandHeight;
  const sx = front.x * ATLAS_WIDTH;
  const sw = front.w * ATLAS_WIDTH;
  const dx = back.x * ATLAS_WIDTH;
  const dy = back.y * ATLAS_HEIGHT + back.h * ATLAS_HEIGHT - bandHeight;
  const dw = back.w * ATLAS_WIDTH;

  ctx.drawImage(ctx.canvas, sx, sy, sw, bandHeight, dx, dy, dw, bandHeight);
}

/** Gutter between front/back halves so side UVs don't sample artwork. */
function paintSeamGutter(ctx: CanvasRenderingContext2D, color: string) {
  const gutterX = ATLAS_WIDTH * 0.48;
  const gutterW = ATLAS_WIDTH * 0.04;
  ctx.fillStyle = color;
  ctx.fillRect(gutterX, 0, gutterW, ATLAS_HEIGHT);
}

export type CompositeOptions = {
  designImage: CanvasImageSource;
  sideColor?: Rgb | null;
};

export function compositeJerseyTexture(options: CompositeOptions): HTMLCanvasElement {
  const { designImage, sideColor } = options;
  const canvas = document.createElement('canvas');
  canvas.width = ATLAS_WIDTH;
  canvas.height = ATLAS_HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  const base = extractBaseColor(designImage);
  const fill = sideColor ?? base;
  const fillCss = rgbToCss(fill);

  ctx.fillStyle = fillCss;
  ctx.fillRect(0, 0, ATLAS_WIDTH, ATLAS_HEIGHT);

  fillRect(ctx, UV_ISLANDS.back, fillCss);
  fillRect(ctx, UV_ISLANDS.front, '#ffffff');

  drawImageContained(ctx, designImage, UV_ISLANDS.front);
  carryFrontStripesToBack(ctx);
  paintSeamGutter(ctx, fillCss);

  return canvas;
}
