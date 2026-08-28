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
  neckDepthFront: 0.17, // drop below shoulderY at front center
  neckDepthBack: 0.07, // real jerseys sit higher at the back
  // With sleeves attached the shoulder is covered, so the body's top edge only
  // eases down toward the underarm seam. The old 0.42 cut here made four spikes.
  armholeDepth: 0.09,
  neckHalfWidth: Math.PI * (38 / 180), // neck dips die out exactly at the shoulders
  armholeHalfWidth: Math.PI * (46 / 180), // ...and so do the armhole dips

  // Short set-in sleeve. The base ring is buried a little inside the body so the
  // join never shows a gap as the garment is orbited.
  sleeveLength: 0.32,
  sleeveBaseR: 0.25, // close to the body's half-depth, so the join has no notch
  sleeveCuffR: 0.2,
  sleeveDrop: 0.3, // downward component of the sleeve axis; 0 = straight out
  sleeveInset: 0.6, // fraction of chestRX at which the sleeve ring is centred
  // The ring extends +/-sleeveBaseR about its centre, so the centre has to sit a
  // full radius below the shoulder or the sleeve stands up above the shoulder line.
  sleeveDropFromShoulder: 0.21,
} as const;

// Panel spans: front faces +Z, back -Z, sides ±X. Front/back take 100 degrees each,
// the two sides split the remaining 160. Panel boundaries are the garment's seams —
// separate geometries means hard shading edges there, which is intentional.
const DEG = Math.PI / 180;
const SEG_T = 40; // rings from hem to top edge
const SEG_A_FRONT = 64; // angular segments across the 180-degree front
const SEG_A_BACK = 32; // across the 80-degree back
const SEG_A_SIDE = 20; // per 50-degree side flank
const SEG_SLEEVE_A = 24; // around the sleeve tube
const SEG_SLEEVE_L = 10; // along it
// Triangles = 2 * segA * SEG_T => front 5120 + back 2560 + sides 1600x2,
// plus 480 per sleeve => 11,840 total, well under the 50k ceiling in the PRD.

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

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geo.setIndex(new THREE.BufferAttribute(indices, 1));
  geo.computeVertexNormals();
  return geo;
}

/**
 * A short set-in sleeve: a tapered tube swept along an axis that runs outward and
 * down from the shoulder. `sign` is +1 for the +X flank, -1 for -X.
 *
 * Sleeves share the side panels' UV island, so they take the side colour (or the
 * override swatch) — which is how the great majority of real teamwear is cut.
 */
function buildSleeve(
  sign: 1 | -1,
  uvRect: readonly [number, number, number, number],
): THREE.BufferGeometry {
  const [u0, v0, u1, v1] = uvRect;
  const { sleeveLength, sleeveBaseR, sleeveCuffR, sleeveDrop, sleeveInset } = JERSEY;

  const dir = new THREE.Vector3(sign, -sleeveDrop, 0).normalize();
  // Ring basis: e1 along Z (front-back), e2 perpendicular to both.
  const e1 = new THREE.Vector3(0, 0, 1);
  const e2 = new THREE.Vector3().crossVectors(dir, e1).normalize();
  const base = new THREE.Vector3(
    sign * JERSEY.chestRX * sleeveInset,
    JERSEY.shoulderY - JERSEY.sleeveDropFromShoulder,
    0,
  );

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
      const r = THREE.MathUtils.lerp(sleeveBaseR, sleeveCuffR, sT);
      const i = ia * rows + is;
      const cx = base.x + dir.x * sleeveLength * sT;
      const cy = base.y + dir.y * sleeveLength * sT;
      const cz = base.z + dir.z * sleeveLength * sT;
      positions[i * 3] = cx + (e1.x * cosP + e2.x * sinP) * r;
      positions[i * 3 + 1] = cy + (e1.y * cosP + e2.y * sinP) * r;
      positions[i * 3 + 2] = cz + (e1.z * cosP + e2.z * sinP) * r;
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
};

/**
 * sideR is the +X flank, sideL the -X flank — L/R as seen by a viewer facing the
 * front of the jersey, not the wearer's own left and right.
 */
export function buildJersey(): JerseyPanels {
  return {
    // A front view of a jersey shows side seam to side seam: 180 degrees, not 100.
    // Mapping the full source width into a 100-degree panel crushed the design.
    front: buildPanel(-90 * DEG, 90 * DEG, SEG_A_FRONT, [0.0, 0.5, 0.5, 1.0], true),
    sideR: buildPanel(90 * DEG, 140 * DEG, SEG_A_SIDE, [0.5, 0.0, 1.0, 0.5]),
    back: buildPanel(140 * DEG, 220 * DEG, SEG_A_BACK, [0.5, 0.5, 1.0, 1.0]),
    sideL: buildPanel(220 * DEG, 270 * DEG, SEG_A_SIDE, [0.0, 0.0, 0.5, 0.5]),
    sleeveL: buildSleeve(-1, [0.0, 0.0, 0.5, 0.5]),
    sleeveR: buildSleeve(1, [0.5, 0.0, 1.0, 0.5]),
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
  };
}
