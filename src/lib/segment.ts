export type Mask = {
  width: number;
  height: number;
  alpha: Uint8Array;   // 0..255, length width*height, 255 = garment
  bbox: { minX: number; minY: number; maxX: number; maxY: number };
  coverage: number;    // fraction of the frame that is garment, 0..1
};

// ponytail: border flood-fill is not segmentation. It works on the flat-backdrop
// product shot it was written for and fails on busy, textured or gradient
// backgrounds, and on garments whose own colour touches the frame edge. Upgrade
// path when that starts biting: an ML matting model (MODNet / RMBG onnxruntime-web).
// 40/channel was loose enough to call near-white artwork "backdrop". Real flat
// backdrops vary by only a few levels; this still absorbs JPEG noise.
const TOL2 = 26 * 26 * 3;   // squared RGB distance from the backdrop reference

export function segment(pixels: Uint8ClampedArray, width: number, height: number): Mask {
  const n = width * height;
  const solid = new Uint8Array(n);

  let translucent = 0;
  for (let i = 0; i < n; i++) if (pixels[i * 4 + 3] < 250) translucent++;
  const hasAlpha = translucent > n * 0.05;

  if (hasAlpha) {
    for (let i = 0; i < n; i++) solid[i] = pixels[i * 4 + 3] >= 128 ? 1 : 0;
  } else {
    floodBackground(pixels, width, height, solid);
  }
  despeckle(solid, width, height);
  // Must run before keepLargest: the flood can tunnel through light-coloured
  // artwork that touches the silhouette (a white chest band on a white backdrop,
  // and then straight down the white piping beside a side stripe). That severs
  // the garment, and keepLargest would then discard everything it cut off.
  if (!hasAlpha) fillColumnSpans(solid, width, height);
  keepLargest(solid, width, height);

  const alpha = new Uint8Array(n);
  let count = 0, minX = width, minY = height, maxX = -1, maxY = -1;
  for (let y = 0, i = 0; y < height; y++) {
    for (let x = 0; x < width; x++, i++) {
      if (!solid[i]) continue;
      // keep the source's soft edge when it had one; synthesise a hard one otherwise
      alpha[i] = hasAlpha ? pixels[i * 4 + 3] : 255;
      count++;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) { minX = 0; minY = 0; maxX = -1; maxY = -1; }
  return { width, height, alpha, bbox: { minX, minY, maxX, maxY }, coverage: count / n };
}

/** Marks solid[i]=1 for everything the flood from the frame border could not reach. */
function floodBackground(pixels: Uint8ClampedArray, width: number, height: number, solid: Uint8Array) {
  const n = width * height;
  let rr = 0, gg = 0, bb = 0, m = 0;
  const sample = (i: number) => { rr += pixels[i * 4]; gg += pixels[i * 4 + 1]; bb += pixels[i * 4 + 2]; m++; };
  for (let x = 0; x < width; x++) { sample(x); sample((height - 1) * width + x); }
  for (let y = 0; y < height; y++) { sample(y * width); sample(y * width + width - 1); }
  const refR = rr / m, refG = gg / m, refB = bb / m;

  const bg = new Uint8Array(n);
  const stack = new Int32Array(n);
  let sp = 0;
  const near = (i: number) => {
    const dr = pixels[i * 4] - refR, dg = pixels[i * 4 + 1] - refG, db = pixels[i * 4 + 2] - refB;
    return dr * dr + dg * dg + db * db < TOL2;
  };
  const push = (i: number) => { if (!bg[i] && near(i)) { bg[i] = 1; stack[sp++] = i; } };
  for (let x = 0; x < width; x++) { push(x); push((height - 1) * width + x); }
  for (let y = 0; y < height; y++) { push(y * width); push(y * width + width - 1); }

  while (sp > 0) {
    const i = stack[--sp];
    const x = i % width;
    if (x > 0) push(i - 1);
    if (x < width - 1) push(i + 1);
    if (i >= width) push(i - width);
    if (i < n - width) push(i + width);
  }
  for (let i = 0; i < n; i++) solid[i] = bg[i] ? 0 : 1;
}

/** 3x3 binary majority — kills salt-and-pepper without eating thin features. */
function despeckle(solid: Uint8Array, width: number, height: number) {
  const src = solid.slice();
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let c = 0;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= height) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= width) continue;
          c += src[yy * width + xx];
        }
      }
      solid[y * width + x] = c >= 5 ? 1 : 0;
    }
  }
}

/**
 * Re-closes each column between its topmost and bottommost garment pixel.
 *
 * ponytail: assumes a front-facing garment, where every column is contiguous from
 * shoulder to hem. That holds for a jersey and repairs any tunnel the flood cut
 * through it. It would wrongly bridge a genuine vertical gap — a flat-lay with the
 * sleeves spread away from the body, or shorts photographed leg-apart.
 */
function fillColumnSpans(solid: Uint8Array, width: number, height: number) {
  for (let x = 0; x < width; x++) {
    let top = -1, bottom = -1;
    for (let y = 0; y < height; y++) if (solid[y * width + x]) { top = y; break; }
    if (top < 0) continue;
    for (let y = height - 1; y >= 0; y--) if (solid[y * width + x]) { bottom = y; break; }
    // A column spanning the entire frame means the flood never found a backdrop
    // on this column; filling it would invent garment out of a failed cutout.
    if (top === 0 && bottom === height - 1) continue;
    for (let y = top; y <= bottom; y++) solid[y * width + x] = 1;
  }
}

/** A logo printed on the backdrop is a separate blob — only the biggest one is the garment. */
function keepLargest(solid: Uint8Array, width: number, height: number) {
  const n = width * height;
  const label = new Int32Array(n);
  const stack = new Int32Array(n);
  let cur = 0, best = 0, bestSize = 0;
  for (let seed = 0; seed < n; seed++) {
    if (!solid[seed] || label[seed]) continue;
    cur++;
    let sp = 0, size = 0;
    label[seed] = cur; stack[sp++] = seed;
    while (sp > 0) {
      const i = stack[--sp];
      size++;
      const x = i % width;
      if (x > 0 && solid[i - 1] && !label[i - 1]) { label[i - 1] = cur; stack[sp++] = i - 1; }
      if (x < width - 1 && solid[i + 1] && !label[i + 1]) { label[i + 1] = cur; stack[sp++] = i + 1; }
      if (i >= width && solid[i - width] && !label[i - width]) { label[i - width] = cur; stack[sp++] = i - width; }
      if (i < n - width && solid[i + width] && !label[i + width]) { label[i + width] = cur; stack[sp++] = i + width; }
    }
    if (size > bestSize) { bestSize = size; best = cur; }
  }
  if (!best) return;
  for (let i = 0; i < n; i++) if (label[i] !== best) solid[i] = 0;
}
