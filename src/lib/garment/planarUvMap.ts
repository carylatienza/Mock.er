import * as THREE from 'three';

const FRONT_FACING = 0.42;
const BACK_FACING = -0.42;

/**
 * Classify each vertex by world normal: chest → front atlas, back → derived back,
 * sides/sleeves → solid fill band (no front artwork bleed).
 */
export function applyPlanarUvMapping(mesh: THREE.Mesh, boundingBox: THREE.Box3): void {
  const geometry = mesh.geometry;
  const position = geometry.attributes.position;
  if (!position) return;

  if (!geometry.attributes.normal) {
    geometry.computeVertexNormals();
  }

  if (!geometry.attributes.uv) {
    geometry.setAttribute(
      'uv',
      new THREE.BufferAttribute(new Float32Array(position.count * 2), 2),
    );
  }

  const uv = geometry.attributes.uv;
  const vertex = new THREE.Vector3();
  const normal = new THREE.Vector3();
  const normalMatrix = new THREE.Matrix3();

  const min = boundingBox.min;
  const max = boundingBox.max;
  const spanX = max.x - min.x;
  const spanY = max.y - min.y;

  mesh.updateMatrixWorld(true);
  normalMatrix.getNormalMatrix(mesh.matrixWorld);

  for (let i = 0; i < position.count; i++) {
    vertex.fromBufferAttribute(position, i);
    vertex.applyMatrix4(mesh.matrixWorld);

    normal.fromBufferAttribute(geometry.attributes.normal!, i);
    normal.applyMatrix3(normalMatrix).normalize();

    let u = spanX > 0 ? (vertex.x - min.x) / spanX : 0.5;
    let v = spanY > 0 ? (vertex.y - min.y) / spanY : 0.5;
    u = Math.max(0, Math.min(1, u));
    v = Math.max(0, Math.min(1, v));

    const facing = normal.z;

    if (facing > FRONT_FACING) {
      u = (u * 0.46) + 0.02;
    } else if (facing < BACK_FACING) {
      u = 0.54 + (1 - u) * 0.44;
    } else {
      u = 0.72 + (u - 0.5) * 0.08;
    }

    uv.setXY(i, u, v);
  }

  uv.needsUpdate = true;
}

export function fitJerseyModel(root: THREE.Object3D, targetSize = 2.2): THREE.Box3 {
  const box = new THREE.Box3().setFromObject(root);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z);
  const scale = maxDim > 0 ? targetSize / maxDim : 1;

  root.scale.setScalar(scale);
  root.position.sub(center.multiplyScalar(scale));
  root.position.y -= 0.08;
  root.updateMatrixWorld(true);

  return new THREE.Box3().setFromObject(root);
}
