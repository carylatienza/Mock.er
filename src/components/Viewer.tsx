'use client';

import { Canvas } from '@react-three/fiber';

export default function Viewer() {
  return (
    <div className="h-screen w-screen">
      <Canvas className="h-full w-full" style={{ background: '#e8e8e8' }} />
    </div>
  );
}
