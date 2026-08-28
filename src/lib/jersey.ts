import * as THREE from 'three';

/**
 * Procedural short-sleeve team jersey.
 *
 * UV CONTRACT (fixed — the texture pipeline is written against this):
 *
 *   | Panel  | UV island            |
 *   |--------|----------------------|
 *   | Front  | u 0.0-0.5, v 0.5-1.0 |
 *   | Back   | u 0.5-1.0, v 0.5-1.0 |
 *   | Side L | u 0.0-0.5, v 0.0-0.5 |
 *   | Side R | u 0.5-1.0, v 0.0-0.5 |
 *
 * Within every island the TOP of the rect is the garment's top edge (neckline /
 * shoulder line) and the BOTTOM is the hem; u runs across the panel's width, in
 * screen-left-to-right order when facing that panel. Each panel fills its rect
 * completely: the silhouette lives in the geometry's topEdge() function, never in
 * empty UV space. That is what lets an uploaded design be mapped silhouette-to-
 * silhouette so it wraps like fabric instead of being pasted on like a sticker.
 *
 * What makes it read as a shirt rather than a tube with cylinders stuck on:
 *   - the top edge SLOPES from the neck out to the shoulder point, so the sleeve
 *     continues a line instead of butting into a flat rim;
 *   - the body has a chest, a slight waist and a little flare at the hem;
 *   - sleeve cross-sections are ellipses flattened front-to-back, tapering to the
 *     cuff, with the cap's top edge meeting the body exactly at the shoulder;
 *   - the hem is capped, so the garment does not read as an open box.
 *
 * ponytail: procedural stand-in. Upgrade path is a properly UV-unwrapped .glb
 * (real shoulder seams, collar rib, cuff hem) honoring this same contract — swap
 * buildJersey() for a loader, keep the four-island layout and the v=top rule.
 */

/** Tuning knobs. World units; the mesh is centered on the origin. */
export const JERSEY = {
  hemY: -0.62,
  shoulderY: 0.62, // height 1.24 against a 1.04 chest — a shirt, not a chimney
  chestRX: 0.52, // chest half-width (side to side)
  depthRatio: 1.5, // width : depth — a torso is wider than it is deep
  superEllipseExp: 2.6, // 2 = ellipse, inf = box; 2.6 reads as flattened cloth

  // Ring width down the body. A jersey is widest across the chest, eases in a
  // little at the waist and falls slightly open again at the hem.
  hemScale: 0.99,
  waistScale: 0.935,
  waistT: 0.34,
  chestScale: 1.0,
  chestT: 0.76,
  topScale: 0.9, // shoulders sit just inside the chest

  neckDropFront: 0.17, // below shoulderY at front centre
  neckDropBack: 0.07, // real jerseys sit higher at the back
  shoulderSlope: 0.05, // neck corner down to the shoulder point

  // Landmarks in degrees from front centre. The armhole is a real cut, not a
  // gentle dip: the body is absent from the armpit up to the shoulder point, and
  // the sleeve fills that opening. A merely wavy top edge reads as a vase.
  neckHalfDeg: 30,
  shoulderPtDeg: 64,
  armpitDeg: 90,
  armpitDrop: 0.28, // how far below shoulderY the underarm sits

  // Short set-in sleeve, elliptical so it is flattened front-to-back like cloth.
  // The cap is sized to the armhole opening it has to cover.
  sleeveLength: 0.3,
  sleeveCapRZ: 0.3, // half-depth of the cap, front to back
  sleeveCuffScale: 0.82,
  sleeveDrop: 0.36, // downward component of the sleeve axis; 0 = straight out
  sleeveInset: 0.7, // fraction of chestRX at which the cap ring is centred
} as const;

// Panel spans: the front takes the full 180 degrees a front-view photo depicts,
// side seam to side seam. Panel boundaries are the garment's seams — separate
// geometries means hard shading edges there, which is intentional.
const DEG = Math.PI / 180;
const SEG_T = 40; // rings from hem to top edge
const SEG_A_FRONT = 64; // angular segments across the 180-degree front
const SEG_A_BACK = 32; // across the 80-degree back
const SEG_A_SIDE = 20; // per 50-degree side flank
const SEG_SLEEVE_A = 24; // around the sleeve tube
const SEG_SLEEVE_L = 12; // along it
// Triangles: front 5120 + back 2560 + sides 1600x2 + sleeves 576x2 + hem cap 96
// => 12,224 total, well under the ~50k ceiling in the PRD.

/** Superellipse ring radius at `theta`, measured from +Z (front centre) toward +X. */
function ringRadius(theta: number): number {
  const n = JERSEY.superEllipseExp;
  const rz = JERSEY.chestRX / JERSEY.depthRatio;
  return Math.pow(
    Math.pow(Math.abs(Math.sin(theta) / JERSEY.chestRX), n) +
      Math.pow(Math.abs(Math.cos(theta) / rz), n),
    -1 / n,
  );
}

/** Smootherstep-free helper: cosine ease, 0 at d=0 rising to 1 at d=1. */
function ease(d: number): number {
  const c = Math.min(1, Math.max(0, d));
  return 0.5 * (1 - Math.cos(Math.PI * c));
}

/**
 * y of the garment's top opening at `theta`.
 *
 * Front centre sits at the neckline bottom, rises to full shoulder height at the
 * neck corner, then falls away along the shoulder slope to the shoulder point at
 * theta = ±90. The back repeats it with a shallower scoop.
 */
function topEdge(theta: number): number {
  // Fold to [0, 180] degrees: 0 = front centre, 180 = back centre.
  let d = Math.abs(theta) % (Math.PI * 2);
  if (d > Math.PI) d = Math.PI * 2 - d;
  const deg = (d * 180) / Math.PI;

  const { neckHalfDeg, shoulderPtDeg, armpitDeg, armpitDrop } = JERSEY;
  const { shoulderY, shoulderSlope, neckDropFront, neckDropBack } = JERSEY;

  const front = deg <= armpitDeg;
  const fromCentre = front ? deg : 180 - deg;
  const drop = front ? neckDropFront : neckDropBack;

  if (fromCentre <= neckHalfDeg) {
    // Neck scoop: deepest at centre, back to shoulder height at the neck corner.
    return shoulderY - drop * (1 - ease(fromCentre / neckHalfDeg));
  }
  const shoulderPt = shoulderY - shoulderSlope;
  if (fromCentre <= shoulderPtDeg) {
    // Shoulder seam: neck corner out to the shoulder point.
    const s = (fromCentre - neckHalfDeg) / (shoulderPtDeg - neckHalfDeg);
    return shoulderY - shoulderSlope * ease(s);
  }
  // Armhole: dives from the shoulder point to the underarm. The sleeve covers it.
  const s = (fromCentre - shoulderPtDeg) / (armpitDeg - shoulderPtDeg);
  return shoulderPt - (shoulderPt - (shoulderY - armpitDrop)) * ease(s);
}

/** The armhole opening this sleeve has to cover: [bottom y, top y]. */
function armholeSpan(): [number, number] {
  return [JERSEY.shoulderY - JERSEY.armpitDrop, JERSEY.shoulderY - JERSEY.shoulderSlope];
}

/** Ring width multiplier from hem (t=0) to top edge (t=1). */
function heightScale(t: number): number {
  const { hemScale, waistScale, waistT, chestScale, chestT, topScale } = JERSEY;
  if (t <= waistT) {
    return THREE.MathUtils.lerp(hemScale, waistScale, THREE.MathUtils.smoothstep(t, 0, waistT));
  }
  if (t <= chestT) {
    return THREE.MathUtils.lerp(
      waistScale,
      chestScale,
      THREE.MathUtils.smoothstep(t, waistT, chestT),
    );
  }
  return THREE.MathUtils.lerp(chestScale, topScale, THREE.MathUtils.smoothstep(t, chestT, 1));
}

/**
 * One indexed body panel. `uvRect` is [u0, v0, u1, v1] of its island; t (0 = hem,
 * 1 = top edge) maps straight onto v0..v1, which is the contract's v=top rule.
 */
function buildPanel(
  thetaStart: number,
  thetaEnd: number,
  segA: number,
  uvRect: readonly [number, number, number, number],
  project = false,
): THREE.BufferGeometry {
  const [u0, v0, u1, v1] = uvRect;
  const cols = segA + 1;
  const rows = SEG_T + 1;
  const positions = new Float32Array(cols * rows * 3);
  const uvs = new Float32Array(cols * rows * 2);
  const indices = new Uint32Array(segA * SEG_T * 6);

  for (let ia = 0; ia < cols; ia++) {
    const a = ia / segA;
    const theta = THREE.MathUtils.lerp(thetaStart, thetaEnd, a);
    const r = ringRadius(theta);
    const sx = Math.sin(theta);
    const cz = Math.cos(theta);
    const yTop = topEdge(theta);
    // A front-view photo is a projection: a point at angle theta lands at
    // x proportional to sin(theta). Undoing that here means the artwork keeps its
    // proportions instead of being stretched toward the silhouette edges.
    const uT = project ? (Math.sin(theta) + 1) / 2 : a;
    const u = THREE.MathUtils.lerp(u0, u1, uT);

    for (let it = 0; it < rows; it++) {
      const t = it / SEG_T;
      const rr = r * heightScale(t);
      const i = ia * rows + it;
      positions[i * 3] = rr * sx;
      // t=1 lands on the top edge whatever the angle — the v=1 landmark.
      positions[i * 3 + 1] = THREE.MathUtils.lerp(JERSEY.hemY, yTop, t);
      positions[i * 3 + 2] = rr * cz;
      uvs[i * 2] = u;
      uvs[i * 2 + 1] = THREE.MathUtils.lerp(v0, v1, t);
    }
  }

  // Indexed so the panel shades smoothly inside itself. Winding is CCW seen from
  // outside: +theta crossed with +t gives the outward normal.
  let k = 0;
  for (let ia = 0; ia < segA; ia++) {
    for (let it = 0; it < SEG_T; it++) {
      const a = ia * rows + it;
      const b = a + rows;
      indices[k++] = a;
      indices[k++] = b;
      indices[k++] = a + 1;
      indices[k++] = b;
      indices[k++] = b + 1;
      indices[k++] = a + 1;
    }
  }

  return finish(positions, uvs, indices);
}

/**
 * A short set-in sleeve: an elliptical tube swept outward and down from the
 * shoulder. `sign` is +1 for the +X flank, -1 for -X.
 *
 * The cap ring is centred a full cap-height below shoulderY so the top of the
 * sleeve meets the body exactly at the shoulder line rather than standing proud
 * of it, and it is sunk inside the body so the join never opens a gap.
 *
 * Sleeves share the side panels' UV island, so they take the side colour (or the
 * override swatch) — which is how the great majority of real teamwear is cut.
 */
function buildSleeve(
  sign: 1 | -1,
  uvRect: readonly [number, number, number, number],
): THREE.BufferGeometry {
  const [u0, v0, u1, v1] = uvRect;
  const { sleeveLength, sleeveCapRZ, sleeveCuffScale, sleeveDrop, sleeveInset } = JERSEY;
  const [armLow, armHigh] = armholeSpan();
  // Cap the armhole exactly: centred on it, tall enough to close it.
  const sleeveCapRY = (armHigh - armLow) / 2 + 0.015;

  const dir = new THREE.Vector3(sign, -sleeveDrop, 0).normalize();
  // Ring basis: e1 along Z (front-back), e2 perpendicular to both (mostly up).
  const e1 = new THREE.Vector3(0, 0, 1);
  const e2 = new THREE.Vector3().crossVectors(dir, e1).normalize();
  const baseX = sign * JERSEY.chestRX * sleeveInset;
  const baseY = (armHigh + armLow) / 2;

  const cols = SEG_SLEEVE_A + 1;
  const rows = SEG_SLEEVE_L + 1;
  const positions = new Float32Array(cols * rows * 3);
  const uvs = new Float32Array(cols * rows * 2);
  const indices = new Uint32Array(SEG_SLEEVE_A * SEG_SLEEVE_L * 6);

  for (let ia = 0; ia < cols; ia++) {
    const a = ia / SEG_SLEEVE_A;
    const phi = a * Math.PI * 2;
    const cosP = Math.cos(phi);
    const sinP = Math.sin(phi);
    for (let is = 0; is < rows; is++) {
      const sT = is / SEG_SLEEVE_L;
      const k = THREE.MathUtils.lerp(1, sleeveCuffScale, sT);
      const rz = sleeveCapRZ * k;
      const ry = sleeveCapRY * k;
      const i = ia * rows + is;
      const cx = baseX + dir.x * sleeveLength * sT;
      const cy = baseY + dir.y * sleeveLength * sT;
      const cz = dir.z * sleeveLength * sT;
      positions[i * 3] = cx + e1.x * cosP * rz + e2.x * sinP * ry;
      positions[i * 3 + 1] = cy + e1.y * cosP * rz + e2.y * sinP * ry;
      positions[i * 3 + 2] = cz + e1.z * cosP * rz + e2.z * sinP * ry;
      uvs[i * 2] = THREE.MathUtils.lerp(u0, u1, a);
      // Shoulder end is the garment's top edge, same v=top rule as the body.
      uvs[i * 2 + 1] = THREE.MathUtils.lerp(v1, v0, sT);
    }
  }

  let k = 0;
  const wind = sign > 0;
  for (let ia = 0; ia < SEG_SLEEVE_A; ia++) {
    for (let is = 0; is < SEG_SLEEVE_L; is++) {
      const a = ia * rows + is;
      const b = a + rows;
      if (wind) {
        indices[k++] = a; indices[k++] = b; indices[k++] = a + 1;
        indices[k++] = b; indices[k++] = b + 1; indices[k++] = a + 1;
      } else {
        indices[k++] = a; indices[k++] = a + 1; indices[k++] = b;
        indices[k++] = b; indices[k++] = a + 1; indices[k++] = b + 1;
      }
    }
  }

  return finish(positions, uvs, indices);
}

/**
 * Closes the bottom of the garment. Without it you look straight up into an open
 * tube and it reads as a paper bag rather than a shirt on an invisible mannequin.
 * Every vertex takes one flat point of the side island, so it picks up the base
 * colour and never shows artwork.
 */
function buildHemCap(): THREE.BufferGeometry {
  const seg = 96;
  const scale = heightScale(0);
  const positions = new Float32Array((seg + 2) * 3);
  const uvs = new Float32Array((seg + 2) * 2);
  const indices = new Uint32Array(seg * 3);

  positions[0] = 0;
  positions[1] = JERSEY.hemY;
  positions[2] = 0;
  for (let i = 0; i <= seg; i++) {
    const theta = (i / seg) * Math.PI * 2;
    const r = ringRadius(theta) * scale;
    const o = (i + 1) * 3;
    positions[o] = r * Math.sin(theta);
    positions[o + 1] = JERSEY.hemY;
    positions[o + 2] = r * Math.cos(theta);
  }
  // Flat spot low in the side island: base colour, never artwork.
  for (let i = 0; i < seg + 2; i++) {
    uvs[i * 2] = 0.25;
    uvs[i * 2 + 1] = 0.1;
  }
  for (let i = 0; i < seg; i++) {
    indices[i * 3] = 0;
    indices[i * 3 + 1] = i + 1;
    indices[i * 3 + 2] = i + 2;
  }
  return finish(positions, uvs, indices);
}

function finish(
  positions: Float32Array,
  uvs: Float32Array,
  indices: Uint32Array,
): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geo.setIndex(new THREE.BufferAttribute(indices, 1));
  geo.computeVertexNormals();
  return geo;
}

export type JerseyPanels = {
  front: THREE.BufferGeometry;
  back: THREE.BufferGeometry;
  sideL: THREE.BufferGeometry;
  sideR: THREE.BufferGeometry;
  sleeveL: THREE.BufferGeometry;
  sleeveR: THREE.BufferGeometry;
  hem: THREE.BufferGeometry;
};

/**
 * sideR is the +X flank, sideL the -X flank — L/R as seen by a viewer facing the
 * front of the jersey, not the wearer's own left and right.
 */
export function buildJersey(): JerseyPanels {
  return {
    front: buildPanel(-90 * DEG, 90 * DEG, SEG_A_FRONT, [0.0, 0.5, 0.5, 1.0], true),
    sideR: buildPanel(90 * DEG, 140 * DEG, SEG_A_SIDE, [0.5, 0.0, 1.0, 0.5]),
    back: buildPanel(140 * DEG, 220 * DEG, SEG_A_BACK, [0.5, 0.5, 1.0, 1.0]),
    sideL: buildPanel(220 * DEG, 270 * DEG, SEG_A_SIDE, [0.0, 0.0, 0.5, 0.5]),
    sleeveL: buildSleeve(-1, [0.0, 0.0, 0.5, 0.5]),
    sleeveR: buildSleeve(1, [0.5, 0.0, 1.0, 0.5]),
    hem: buildHemCap(),
  };
}

export type PanelCount = { vertices: number; triangles: number };

/** Self-check: vertex and triangle counts per panel. */
export function panelCounts(panels: JerseyPanels): Record<keyof JerseyPanels, PanelCount> {
  const count = (g: THREE.BufferGeometry): PanelCount => ({
    vertices: g.getAttribute('position').count,
    triangles: (g.getIndex()?.count ?? 0) / 3,
  });
  return {
    front: count(panels.front),
    back: count(panels.back),
    sideL: count(panels.sideL),
    sideR: count(panels.sideR),
    sleeveL: count(panels.sleeveL),
    sleeveR: count(panels.sleeveR),
    hem: count(panels.hem),
  };
}
