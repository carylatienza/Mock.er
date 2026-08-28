'use client';

import { useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { ContactShadows, OrbitControls } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import * as THREE from 'three';

import { buildJersey } from '@/lib/jersey';
import { TEX_SIZE, drawComposite, makeFabricNormal, type CompositeOpts } from '@/lib/texture';
import { PRESETS, type Preset } from '@/lib/presets';

// Fixed export size so a client deliverable does not vary with window size.
const EXPORT_SIZE = 1600;
const CAM_DIST = 3.1;
const CAM_HEIGHT = 0.35;

export type ViewerHandle = {
  goTo: (preset: Preset) => void;
  exportPNG: () => void;
};

function cameraFor(azimuthDeg: number) {
  const a = (azimuthDeg * Math.PI) / 180;
  return new THREE.Vector3(Math.sin(a) * CAM_DIST, CAM_HEIGHT, Math.cos(a) * CAM_DIST);
}

type SceneProps = {
  composite: CompositeOpts;
  handleRef: React.RefObject<ViewerHandle | null>;
  onBackVisible: (visible: boolean) => void;
};

function Scene({ composite, handleRef, onBackVisible }: SceneProps) {
  const { gl, scene, camera } = useThree();
  const controls = useRef<OrbitControlsImpl>(null);
  const panels = useMemo(() => buildJersey(), []);

  // three.js resources are imperative and long-lived: created once, mutated in
  // place, disposed on unmount. Grouping them keeps that lifecycle in one spot.
  const gfx = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = TEX_SIZE;

    const map = new THREE.CanvasTexture(canvas);
    map.colorSpace = THREE.SRGBColorSpace;
    map.anisotropy = gl.capabilities.getMaxAnisotropy();

    const normalMap = new THREE.CanvasTexture(makeFabricNormal());
    normalMap.colorSpace = THREE.NoColorSpace;
    normalMap.wrapS = normalMap.wrapT = THREE.RepeatWrapping;
    // 24 tiled the 8-thread weave ~192x across a panel, which moires into
    // visible ribbing at screen resolution. 9 keeps it readable as cloth.
    normalMap.repeat.set(9, 9);

    const material = new THREE.MeshStandardMaterial({
      map,
      normalMap,
      normalScale: new THREE.Vector2(0.22, 0.22),
      roughness: 0.72,
      metalness: 0,
      // The tube is open at neck, hem and armholes, so backfaces are visible.
      side: THREE.DoubleSide,
    });

    return { canvas, map, normalMap, material };
  }, [gl]);

  // Redraw the 2048² atlas only when the composite inputs actually change.
  // Flagging it every frame would re-upload 16MB to the GPU per tick.
  useEffect(() => {
    drawComposite(gfx.canvas, composite);
    // three.js needs an explicit re-upload flag; mutated in place by design.
    // eslint-disable-next-line react-hooks/immutability
    gfx.map.needsUpdate = true;
  }, [gfx, composite]);

  useEffect(
    () => () => {
      gfx.map.dispose();
      gfx.normalMap.dispose();
      gfx.material.dispose();
      Object.values(panels).forEach((g) => g.dispose());
    },
    [gfx, panels],
  );

  useEffect(() => {
    const ref = handleRef;
    ref.current = {
      goTo(preset) {
        camera.position.copy(cameraFor(PRESETS[preset]));
        camera.lookAt(0, 0, 0);
        controls.current?.update();
      },
      exportPNG() {
        const size = gl.getSize(new THREE.Vector2());
        const pixelRatio = gl.getPixelRatio();
        const cam = camera as THREE.PerspectiveCamera;
        const aspect = cam.aspect;

        // Render synchronously at a fixed size: otherwise toDataURL captures
        // the previous frame, at whatever resolution the window happens to be.
        gl.setPixelRatio(1);
        gl.setSize(EXPORT_SIZE, EXPORT_SIZE, false);
        cam.aspect = 1;
        cam.updateProjectionMatrix();
        gl.render(scene, cam);
        const url = gl.domElement.toDataURL('image/png');

        gl.setPixelRatio(pixelRatio);
        gl.setSize(size.x, size.y, false);
        cam.aspect = aspect;
        cam.updateProjectionMatrix();
        gl.render(scene, cam);

        const a = document.createElement('a');
        a.href = url;
        a.download = `mocker-${Date.now()}.png`;
        a.click();
      },
    };
    return () => {
      ref.current = null;
    };
  }, [camera, gl, handleRef, scene]);

  const seenBack = useRef(false);
  useFrame(() => {
    const az = Math.abs((Math.atan2(camera.position.x, camera.position.z) * 180) / Math.PI);
    const back = az > 120;
    if (back !== seenBack.current) {
      seenBack.current = back;
      onBackVisible(back);
    }
  });

  return (
    <>
      {/* Three-point studio rig. No HDRI: drei's <Environment preset> fetches
          from a CDN at runtime, which breaks the client-only guarantee. */}
      <ambientLight intensity={0.55} />
      <directionalLight position={[3, 4, 4]} intensity={2.4} castShadow />
      <directionalLight position={[-4, 2, 2]} intensity={0.9} />
      <directionalLight position={[0, 2, -5]} intensity={1.5} />

      {Object.entries(panels).map(([name, geometry]) => (
        <mesh key={name} geometry={geometry} material={gfx.material} castShadow receiveShadow />
      ))}

      <ContactShadows position={[0, -0.75, 0]} opacity={0.45} scale={4} blur={2.4} far={1.2} />
      <OrbitControls
        ref={controls}
        enableDamping
        dampingFactor={0.08}
        minDistance={1.6}
        maxDistance={6}
        target={[0, 0, 0]}
      />
    </>
  );
}

export default function Viewer({ composite, handleRef, onBackVisible }: SceneProps) {
  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      camera={{ position: cameraFor(PRESETS['3/4']).toArray(), fov: 35 }}
      // Required, or toDataURL() returns a blank image.
      gl={{ preserveDrawingBuffer: true, antialias: true }}
      style={{ background: '#101013' }}
    >
      <Scene composite={composite} handleRef={handleRef} onBackVisible={onBackVisible} />
    </Canvas>
  );
}
