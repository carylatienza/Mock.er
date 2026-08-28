'use client';

import dynamic from 'next/dynamic';

const MockupShell = dynamic(() => import('@/components/MockupShell'), { ssr: false });

export default function Home() {
  return <MockupShell />;
}
