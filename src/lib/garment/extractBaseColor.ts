export type Rgb = { r: number; g: number; b: number };

function opaqueBounds(
  data: Uint8ClampedArray,
  width: number,
  height: number,
): { minX: number; minY: number; maxX: number; maxY: number } | null {
  let minX = width;
  let minY = height;
  let maxX = 0;
  let maxY = 0;
  let found = false;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const alpha = data[(y * width + x) * 4 + 3];
      if (alpha < 32) continue;
      found = true;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  if (!found) return null;
  return { minX, minY, maxX, maxY };
}

/**
 * Base garment color from flat artwork — prefers trim/border pixels so all-black
 * jerseys don't paint the whole derived back pure black.
 */
export function extractBaseColor(image: CanvasImageSource): Rgb {
  const canvas = document.createElement('canvas');
  const width =
    'width' in image && typeof image.width === 'number' ? image.width : 1;
  const height =
    'height' in image && typeof image.height === 'number' ? image.height : 1;
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return { r: 200, g: 200, b: 200 };

  ctx.drawImage(image, 0, 0);
  const { data } = ctx.getImageData(0, 0, width, height);
  const bounds = opaqueBounds(data, width, height);
  if (!bounds) return { r: 200, g: 200, b: 200 };

  const padX = Math.max(2, Math.floor((bounds.maxX - bounds.minX) * 0.06));
  const padY = Math.max(2, Math.floor((bounds.maxY - bounds.minY) * 0.06));

  let r = 0;
  let g = 0;
  let b = 0;
  let count = 0;

  for (let y = bounds.minY; y <= bounds.maxY; y++) {
    for (let x = bounds.minX; x <= bounds.maxX; x++) {
      const onEdge =
        x <= bounds.minX + padX ||
        x >= bounds.maxX - padX ||
        y <= bounds.minY + padY ||
        y >= bounds.maxY - padY;
      if (!onEdge) continue;

      const i = (y * width + x) * 4;
      const alpha = data[i + 3];
      if (alpha < 32) continue;
      r += data[i];
      g += data[i + 1];
      b += data[i + 2];
      count += 1;
    }
  }

  if (count === 0) {
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] < 32) continue;
      r += data[i];
      g += data[i + 1];
      b += data[i + 2];
      count += 1;
    }
  }

  if (count === 0) return { r: 200, g: 200, b: 200 };

  return {
    r: Math.round(r / count),
    g: Math.round(g / count),
    b: Math.round(b / count),
  };
}

export function rgbToCss({ r, g, b }: Rgb): string {
  return `rgb(${r}, ${g}, ${b})`;
}
