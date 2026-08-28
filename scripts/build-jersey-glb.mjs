/**
 * Builds public/models/jersey.glb — jersey tube with front/back/side UV islands.
 * License: CC0 (generated for Mock.er).
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const UV = {
  front: { x: 0.02, y: 0.02, w: 0.46, h: 0.66 },
  back: { x: 0.52, y: 0.02, w: 0.46, h: 0.66 },
  sideLeft: { x: 0.02, y: 0.72, w: 0.22, h: 0.24 },
  sideRight: { x: 0.26, y: 0.72, w: 0.22, h: 0.24 },
};

function mapPlaneUVs(geometry, rect) {
  const uv = geometry.attributes.uv;
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, rect.x + uv.getX(i) * rect.w, rect.y + uv.getY(i) * rect.h);
  }
  uv.needsUpdate = true;
}

function createPanel(width, height, rect, rotation, position) {
  const geometry = new THREE.PlaneGeometry(width, height);
  mapPlaneUVs(geometry, rect);
  const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: '#cccccc' }));
  mesh.rotation.set(...rotation);
  mesh.position.set(...position);
  mesh.updateMatrix();
  geometry.applyMatrix4(mesh.matrix);
  return geometry;
}

const W = 1.05;
const H = 1.38;
const DEPTH = 0.38;

const front = createPanel(W, H, UV.front, [0, 0, 0], [0, 0, DEPTH / 2]);
const back = createPanel(W, H, UV.back, [0, Math.PI, 0], [0, 0, -DEPTH / 2]);
const sideLeft = createPanel(DEPTH, H, UV.sideLeft, [0, Math.PI / 2, 0], [-W / 2, 0, 0]);
const sideRight = createPanel(DEPTH, H, UV.sideRight, [0, -Math.PI / 2, 0], [W / 2, 0, 0]);

const merged = mergeGeometries([front, back, sideLeft, sideRight], false);
if (!merged) throw new Error('Failed to merge jersey panels');

const mesh = new THREE.Mesh(
  merged,
  new THREE.MeshStandardMaterial({ color: '#b8b8b8', side: THREE.DoubleSide }),
);
const scene = new THREE.Scene();
scene.add(mesh);

const exporter = new GLTFExporter();
exporter.parse(
  scene,
  (result) => {
    const dir = path.dirname(fileURLToPath(import.meta.url));
    const out = path.join(dir, '../public/models/jersey.glb');
    fs.writeFileSync(out, Buffer.from(result));
    console.log(`Wrote ${out}`);
  },
  (error) => {
    console.error(error);
    process.exit(1);
  },
  { binary: true },
);
