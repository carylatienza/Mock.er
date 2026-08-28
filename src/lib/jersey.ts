import * as THREE from 'three';

/**
 * Procedural sleeveless basketball jersey.
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
 * armhole curve) and the BOTTOM is the hem; u runs across the panel's width, in
 * screen-left-to-right order when facing that panel. Each panel fills its rect
 * completely: the silhouette lives in the geometry's topEdge() function, never in
 * empty UV space. That is what lets an uploaded design be mapped silhouette-to-
 * silhouette so it wraps like fabric instead of being pasted on like a sticker.
 *
 * ponytail: procedural stand-in. Upgrade path is a properly UV-unwrapped .glb
 * (real shoulder seams, side-panel taper, collar rib) honoring this same contract —
 * swap buildJersey() for a loader, keep the four-island layout and the v=top rule.
 */

/** Tuning knobs. World units; the mesh is centered on the origin. */
export const JERSEY = {
  hemY: -0.7,
  shoulderY: 0.7, // y of the four shoulder peaks => overall height 1.4
  chestRX: 0.45, // chest half-width (side to side)
  depthRatio: 1.45, // width : depth — a torso is wider than it is deep
  superEllipseExp: 2.5, // 2 = ellipse, inf = box; 2.5 reads as flattened cloth
  hemScale: 0.9, // ring narrows toward the hem so it drapes instead of tubing
  topScale: 0.96, // and eases back in above the chest toward the shoulders
  chestT: 0.7, // t of the widest ring
  neckDepthFront: 0.3, // drop below shoulderY at front center
  neckDepthBack: 0.16, // real jerseys sit higher at the back
  armholeDepth: 0.42, // deepest cut of all
  neckHalfWidth: Math.PI * (40 / 180), // neck dips die out exactly at the shoulders
  armholeHalfWidth: Math.PI * (50 / 180), // ...and so do the armhole dips
} as const;

// Panel spans: front faces +Z, back -Z, sides ±X. Front/back take 100 degrees each,
// the two sides split the remaining 160. Panel boundaries are the garment's seams —
// separate geometries means hard shading edges there, which is intentional.
const DEG = Math.PI / 180;
const SEG_T = 40; // rings from hem to top edge
const SEG_A_FB = 40; // angular segments, front and back (2.5 deg each)
const SEG_A_SIDE = 32; // angular segments per side (2.5 deg each)
// Triangles = 2 * segA * SEG_T => front 3200 + back 3200 + 2560 + 2560 = 11520 total.

/** Superellipse ring radius at `theta`, measured from +Z (front center) toward +X. */
function ringRadius(theta: number): number {
  const n = JERSEY.superEllipseExp;
  const rz = JERSEY.chestRX / JERSEY.depthRatio;
  return Math.pow(
    Math.pow(Math.abs(Math.sin(theta) / JERSEY.chestRX), n) +
      Math.pow(Math.abs(Math.cos(theta) / rz), n),
    -1 / n,
  );
}

/**
 * Raised cosine notch: full `depth` at `center`, decaying to exactly 0 with zero
 * slope at ±`halfWidth`. Smooth at both ends so the dips meet the shoulder peaks
 * without a crease — a linear ramp here shows up as a faceted neckline.
 */
function dip(theta: number, center: number, halfWidth: number, depth: number): number {
  let d = Math.abs(theta - center) % (Math.PI * 2);
  if (d > Math.PI) d = Math.PI * 2 - d;
  if (d >= halfWidth) return 0;
  return depth * 0.5 * (1 + Math.cos((Math.PI * d) / halfWidth));
}

/**
 * y of the garment's top opening at `theta`. High at the four shoulder points
 * (±40 deg off front and back center), dipping at the front neck, the back neck and
 * both armholes. The four dip supports tile the circle exactly (0-40 front neck,
 * 40-140 armhole, 140-180 back neck), so each shoulder is a single peak at shoulderY.
 */
function topEdge(theta: number): number {
  return (
    JERSEY.shoulderY -
    dip(theta, 0, JERSEY.neckHalfWidth, JERSEY.neckDepthFront) -
    dip(theta, Math.PI, JERSEY.neckHalfWidth, JERSEY.neckDepthBack) -
    dip(theta, Math.PI / 2, JERSEY.armholeHalfWidth, JERSEY.armholeDepth) -
    dip(theta, -Math.PI / 2, JERSEY.armholeHalfWidth, JERSEY.armholeDepth)
  );
}

/** Ring width multiplier: narrow hem, widest at chestT, easing back in at the top. */
function heightScale(t: number): number {
  const { hemScale, topScale, chestT } = JERSEY;
  return t <= chestT
    ? THREE.MathUtils.lerp(hemScale, 1, THREE.MathUtils.smoothstep(t, 0, chestT))
    : THREE.MathUtils.lerp(1, topScale, THREE.MathUtils.smoothstep(t, chestT, 1));
}

/**
 * One indexed panel. `uvRect` is [u0, v0, u1, v1] of its island; t (0 = hem,
 * 1 = top edge) maps straight onto v0..v1, which is the contract's v=top rule.
 */
function buildPanel(
  thetaStart: number,
  thetaEnd: number,
  segA: number,
  uvRect: readonly [number, number, number, number],
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
    const u = THREE.MathUtils.lerp(u0, u1, a);

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
};

/**
 * sideR is the +X flank, sideL the -X flank — L/R as seen by a viewer facing the
 * front of the jersey, not the wearer's own left and right.
 */
export function buildJersey(): JerseyPanels {
  return {
    front: buildPanel(-50 * DEG, 50 * DEG, SEG_A_FB, [0.0, 0.5, 0.5, 1.0]),
    back: buildPanel(130 * DEG, 230 * DEG, SEG_A_FB, [0.5, 0.5, 1.0, 1.0]),
    sideL: buildPanel(230 * DEG, 310 * DEG, SEG_A_SIDE, [0.0, 0.0, 0.5, 0.5]),
    sideR: buildPanel(50 * DEG, 130 * DEG, SEG_A_SIDE, [0.5, 0.0, 1.0, 0.5]),
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
  };
}
