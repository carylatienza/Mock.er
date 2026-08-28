'use client';

import { useCallback, useEffect, useState } from 'react';
import type { Rgb } from '@/lib/garment/extractBaseColor';
import Viewer from '@/components/Viewer';

function parseHexColor(hex: string): Rgb | null {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return null;
  const n = parseInt(match[1], 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export default function MockupShell() {
  const [designUrl, setDesignUrl] = useState<string | null>(null);
  const [sideColor, setSideColor] = useState<Rgb | null>(null);
  const [hasDesign, setHasDesign] = useState(false);

  const handleFileChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setDesignUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(file);
    });
    setHasDesign(true);
    setSideColor(null);
  }, []);

  useEffect(() => {
    return () => {
      if (designUrl) URL.revokeObjectURL(designUrl);
    };
  }, [designUrl]);

  return (
    <div className="flex h-screen flex-col bg-zinc-100">
      <div className="min-h-0 flex-1">
        <Viewer designUrl={designUrl} sideColor={sideColor} />
      </div>
      <footer className="flex flex-wrap items-center gap-3 border-t border-zinc-200 bg-white p-3">
        <label className="text-sm text-zinc-700" htmlFor="design-upload">
          Upload jersey design (PNG)
        </label>
        <input
          id="design-upload"
          type="file"
          accept="image/png,image/webp"
          onChange={handleFileChange}
          className="text-sm"
        />
        <button
          type="button"
          className="text-sm text-blue-600 underline"
          onClick={() => {
            setDesignUrl('/sample-design.png');
            setHasDesign(true);
          }}
        >
          Try sample
        </button>
        {hasDesign && (
          <label className="flex items-center gap-2 text-sm text-zinc-700">
            Side color override
            <input
              type="color"
              defaultValue="#cccccc"
              onChange={(e) => setSideColor(parseHexColor(e.target.value))}
              className="h-8 w-10 cursor-pointer border border-zinc-300"
            />
          </label>
        )}
        {hasDesign && (
          <span
            className="rounded border border-amber-300 bg-amber-50 px-2 py-1 text-xs font-medium text-amber-900"
            title="Back panel is filled from extracted base color, not uploaded artwork"
          >
            Back: derived
          </span>
        )}
        <span className="text-xs text-zinc-500">Flat artwork, transparent PNG</span>
      </footer>
    </div>
  );
}
