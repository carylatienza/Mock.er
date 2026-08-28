/* eslint-disable react/no-unknown-property */
'use client';

import { Environment, OrbitControls } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import { Suspense } from 'react';
import Jersey from '@/components/Jersey';
import type { Rgb } from '@/lib/garment/extractBaseColor';

interface ViewerProps {
  designUrl?: string | null;
  sideColor?: Rgb | null;
}

export default function Viewer({ designUrl, sideColor }: ViewerProps) {
  return (
    <div className="h-full w-full bg-gradient-to-b from-[#e8edf4] to-[#cfd8e6]">
      <Canvas
        className="h-full w-full"
        camera={{ position: [0, 0.15, 3.4], fov: 32 }}
        dpr={[1, 2]}
        shadows
      >
        <ambientLight intensity={0.55} />
        <directionalLight position={[5, 8, 6]} intensity={1.2} castShadow />
        <directionalLight position={[-4, 3, -3]} intensity={0.35} />
        <Suspense fallback={null}>
          <Environment preset="studio" environmentIntensity={0.45} />
          <Jersey designUrl={designUrl} sideColor={sideColor} />
        </Suspense>
        <OrbitControls
          makeDefault
          enableDamping
          dampingFactor={0.08}
          minDistance={2}
          maxDistance={5}
          minPolarAngle={Math.PI * 0.25}
          maxPolarAngle={Math.PI * 0.75}
        />
      </Canvas>
    </div>
  );
}
