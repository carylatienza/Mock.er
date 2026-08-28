import * as THREE from 'three';
import { GLTFLoader } from 'three-stdlib';

/**
 * Loads a real garment mesh and forces it onto the project's UV contract.
 *
 * The point: a sewn garment has shoulders, a set-in sleeve cap, a collar and
 * drape that a swept superellipse cannot fake. Any jersey .glb gives us that for
 * free — we just cannot use its own UVs, which on a generated or scanned asset
 * are a single arbitrary atlas rather than front/back/side islands.
 *
 * So the mesh supplies geometry only. UVs are recomputed here from vertex
 * position, exactly as jersey.ts does procedurally:
 *
 *   | Panel  | theta            | UV island            |
 *   |--------|------------------|----------------------|
 *   | Front  | -90..90          | u 0.0-0.5, v 0.5-1.0 |
 *   | Side R | 90..140          | u 0.5-1.0, v 0.0-0.5 |
 *   | Back   | 140..220         | u 0.5-1.0, v 0.5-1.0 |
 *   | Side L | 220..270         | u 0.0-0.5, v 0.0-0.5 |
 *
 * v = 1 is the garment's top edge *at that angle*, measured off the mesh itself,
 * so an uploaded design's neckline still lands on the mesh's neckline.
 *
 * ponytail: faces are assigned to a panel by centroid angle and the result is
 * non-indexed, which duplicates vertices but keeps UVs from interpolating across
 * a panel boundary and smearing the atlas. Fine at this scale; if a mesh ever
 * arrives dense enough for that to hurt, split only the boundary faces.
 */

const BINS = 180; // angular bins for the per-angle top-edge profile
const TARGET_HEIGHT = 1.24; // matches the procedural mesh, so the camera is unchanged

/** Angular span and UV island of each panel, in degrees from front centre. */
const PANELS = [
  { lo: -90, hi: 90, u0: 0.0, u1: 0.5, v0: 0.5, v1: 1.0, project: true },
  { lo: 90, hi: 140, u0: 0.5, u1: 1.0, v0: 0.0, v1: 0.5, project: false },
  { lo: 140, hi: 220, u0: 0.5, u1: 1.0, v0: 0.5, v1: 1.0, project: false },
  { lo: 220, hi: 270, u0: 0.0, u1: 0.5, v0: 0.0, v1: 0.5, project: false },
] as const;

function panelFor(deg: number) {
  const d = ((deg % 360) + 360) % 360; // 0..360, 0 = front centre
  const signed = d > 180 ? d - 360 : d; // -180..180
  if (signed >= -90 && signed <= 90) return PANELS[0];
  if (d > 90 && d <= 140) return PANELS[1];
  if (d > 140 && d < 220) return PANELS[2];
  return PANELS[3];
}

/**
 * Flattens every mesh in the scene into one world-space, non-indexed triangle
 * soup. A file called a "lineup" may hold several garments, so the caller picks
 * one; here we just gather what a single object contains.
 */
function collect(root: THREE.Object3D): THREE.Mesh[] {
  const out: THREE.Mesh[] = [];
  root.updateWorldMatrix(true, true);
  root.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) out.push(o as THREE.Mesh);
  });
  return out;
}

function toWorldTriangles(meshes: THREE.Mesh[]): { pos: Float32Array; nrm: Float32Array } {
  const positions: number[] = [];
  const normals: number[] = [];
  const v = new THREE.Vector3();
  const nm = new THREE.Matrix3();

  for (const mesh of meshes) {
    const g = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry;
    const p = g.getAttribute('position');
    const n = g.getAttribute('normal');
    nm.getNormalMatrix(mesh.matrixWorld);
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).applyMatrix4(mesh.matrixWorld);
      positions.push(v.x, v.y, v.z);
      if (n) {
        v.fromBufferAttribute(n, i).applyMatrix3(nm).normalize();
        normals.push(v.x, v.y, v.z);
      }
    }
    if (g !== mesh.geometry) g.dispose();
  }
  return { pos: new Float32Array(positions), nrm: new Float32Array(normals) };
}

/** Highest y the mesh reaches in each angular bin — the garment's top edge. */
function topEdgeProfile(pos: Float32Array): Float32Array {
  const top = new Float32Array(BINS).fill(-Infinity);
  for (let i = 0; i < pos.length; i += 3) {
    const deg = (Math.atan2(pos[i], pos[i + 2]) * 180) / Math.PI;
    const b = Math.min(BINS - 1, Math.max(0, Math.floor((((deg % 360) + 360) % 360) / (360 / BINS))));
    if (pos[i + 1] > top[b]) top[b] = pos[i + 1];
  }
  // Bridge empty bins, then smooth: raw per-bin maxima give a jagged neckline.
  let last = -Infinity;
  for (let b = 0; b < BINS; b++) if (Number.isFinite(top[b])) last = top[b];
  for (let b = 0; b < BINS; b++) if (!Number.isFinite(top[b])) top[b] = last;
  const sm = new Float32Array(BINS);
  const r = 3;
  for (let b = 0; b < BINS; b++) {
    let sum = 0;
    for (let k = -r; k <= r; k++) sum += top[(b + k + BINS) % BINS];
    sm[b] = sum / (2 * r + 1);
  }
  return sm;
}

export type LoadedJersey = { geometry: THREE.BufferGeometry; meshes: number; triangles: number };

/**
 * Returns null when the file is absent — the caller falls back to the procedural
 * mesh, so a missing asset degrades instead of breaking the app.
 */
export async function loadJerseyGLB(url: string): Promise<LoadedJersey | null> {
  const head = await fetch(url, { method: 'HEAD' }).catch(() => null);
  if (!head || !head.ok) return null;

  const gltf = await new GLTFLoader().loadAsync(url).catch(() => null);
  if (!gltf) return null;

  const all = collect(gltf.scene);
  if (!all.length) return null;

  // A "lineup" file can hold several garments. Keep the largest by bounding-box
  // volume and drop the rest, rather than merging a rack of shirts into one blob.
  let chosen = all;
  if (all.length > 1) {
    let best: THREE.Mesh | null = null;
    let bestVol = -1;
    const box = new THREE.Box3();
    const size = new THREE.Vector3();
    for (const m of all) {
      box.setFromObject(m).getSize(size);
      const vol = size.x * size.y * size.z;
      if (vol > bestVol) {
        bestVol = vol;
        best = m;
      }
    }
    if (best) chosen = [best];
  }

  const { pos, nrm } = toWorldTriangles(chosen);
  if (pos.length < 9) return null;

  // Centre on the origin in x/z, sit the hem at -TARGET_HEIGHT/2, scale to fit.
  const bb = new THREE.Box3().setFromArray(pos);
  const c = bb.getCenter(new THREE.Vector3());
  const sz = bb.getSize(new THREE.Vector3());
  const scale = sz.y > 1e-6 ? TARGET_HEIGHT / sz.y : 1;
  for (let i = 0; i < pos.length; i += 3) {
    pos[i] = (pos[i] - c.x) * scale;
    pos[i + 1] = (pos[i + 1] - c.y) * scale;
    pos[i + 2] = (pos[i + 2] - c.z) * scale;
  }

  const bb2 = new THREE.Box3().setFromArray(pos);
  const hemY = bb2.min.y;
  const top = topEdgeProfile(pos);
  const uvs = new Float32Array((pos.length / 3) * 2);

  for (let t = 0; t < pos.length; t += 9) {
    const cx = (pos[t] + pos[t + 3] + pos[t + 6]) / 3;
    const cz = (pos[t + 2] + pos[t + 5] + pos[t + 8]) / 3;
    // One panel per face, from its centroid: a face straddling a seam would
    // otherwise interpolate right across the atlas.
    const panel = panelFor((Math.atan2(cx, cz) * 180) / Math.PI);
    const span = panel.hi - panel.lo;

    for (let k = 0; k < 3; k++) {
      const i = t + k * 3;
      const x = pos[i], y = pos[i + 1], z = pos[i + 2];
      let deg = (Math.atan2(x, z) * 180) / Math.PI;
      // Unwrap into this panel's own range so a face near +/-180 stays contiguous.
      while (deg < panel.lo) deg += 360;
      while (deg > panel.hi) deg -= 360;

      const a = span > 0 ? (deg - panel.lo) / span : 0;
      const uT = panel.project ? (Math.sin((deg * Math.PI) / 180) + 1) / 2 : a;

      const b = Math.min(BINS - 1, Math.max(0, Math.floor((((deg % 360) + 360) % 360) / (360 / BINS))));
      const h = Math.max(1e-6, top[b] - hemY);
      const vT = Math.min(1, Math.max(0, (y - hemY) / h));

      const o = (i / 3) * 2;
      uvs[o] = panel.u0 + (panel.u1 - panel.u0) * Math.min(1, Math.max(0, uT));
      uvs[o + 1] = panel.v0 + (panel.v1 - panel.v0) * vT;
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  if (nrm.length === pos.length) {
    geometry.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  } else {
    geometry.computeVertexNormals();
  }

  return { geometry, meshes: all.length, triangles: pos.length / 9 };
}
