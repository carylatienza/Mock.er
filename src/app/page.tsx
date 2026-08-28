'use client';

import dynamic from 'next/dynamic';
import { useCallback, useMemo, useRef, useState } from 'react';

import Controls, { type Nudge } from '@/components/Controls';
import type { ViewerHandle } from '@/components/Viewer';
import { extractBaseColor, looksBaked, type RGB } from '@/lib/color';
import { segment, type Mask } from '@/lib/segment';
import type { CompositeOpts } from '@/lib/texture';
import type { Preset } from '@/lib/presets';

// three.js touches window at module scope, so the viewer is client-only.
const Viewer = dynamic(() => import('@/components/Viewer'), {
  ssr: false,
  loading: () => <div className="absolute inset-0 bg-[#101013]" />,
});

// Segmentation and the warp run over every pixel. A 6000px phone photo would
// stall the main thread for seconds with no visible benefit at 1024px of UV.
const WORK_MAX = 1400;

const NEUTRAL: RGB = [46, 50, 58];

async function loadImageData(file: File): Promise<ImageData> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, WORK_MAX / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * scale));
  const h = Math.max(1, Math.round(bmp.height * scale));

  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Canvas 2D is unavailable in this browser.');
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close();
  return ctx.getImageData(0, 0, w, h);
}

export default function Home() {
  const handleRef = useRef<ViewerHandle | null>(null);

  const [image, setImage] = useState<ImageData | null>(null);
  const [mask, setMask] = useState<Mask | null>(null);
  const [baseColor, setBaseColor] = useState<RGB>(NEUTRAL);
  const [sideOverride, setSideOverride] = useState<RGB | null>(null);
  const [mode, setMode] = useState<'wrap' | 'graphic'>('wrap');
  const [nudge, setNudge] = useState<Nudge>({ x: 0, y: 0, scale: 1 });
  const [readout, setReadout] = useState<'rgb' | 'cmyk'>('rgb');
  const [warnings, setWarnings] = useState<string[]>([]);
  const [backVisible, setBackVisible] = useState(false);
  const [busy, setBusy] = useState(false);

  const onUpload = useCallback(async (file: File) => {
    setBusy(true);
    try {
      const data = await loadImageData(file);
      const m = segment(data.data, data.width, data.height);
      const next: string[] = [];

      // Silently wrapping a failed cutout is worse than saying it failed.
      if (m.coverage < 0.1) {
        next.push(
          'Could not isolate a garment — the background may be busy or low-contrast. Try a PNG with transparency, or use Place graphic.',
        );
      }
      if (looksBaked(data.data, m.alpha)) {
        next.push(
          'This looks like a shaded mockup render rather than flat artwork. The renderer will light it a second time, so it may come out muddy.',
        );
      }

      setImage(data);
      setMask(m);
      setBaseColor(extractBaseColor(data.data, m.alpha));
      setSideOverride(null);
      setWarnings(next);
    } catch (err) {
      setWarnings([err instanceof Error ? err.message : 'Could not read that file.']);
    } finally {
      setBusy(false);
    }
  }, []);

  const composite = useMemo<CompositeOpts>(
    () => ({ image, mask, mode, nudge, baseColor, sideOverride }),
    [image, mask, mode, nudge, baseColor, sideOverride],
  );

  const onPreset = useCallback((p: Preset) => handleRef.current?.goTo(p), []);
  const onExport = useCallback(() => handleRef.current?.exportPNG(), []);

  return (
    <main className="relative h-screen w-screen overflow-hidden">
      <Viewer composite={composite} handleRef={handleRef} onBackVisible={setBackVisible} />
      <Controls
        hasImage={image !== null}
        mode={mode}
        setMode={setMode}
        nudge={nudge}
        setNudge={setNudge}
        baseColor={baseColor}
        sideOverride={sideOverride}
        setSideOverride={setSideOverride}
        readout={readout}
        setReadout={setReadout}
        warnings={warnings}
        backVisible={backVisible}
        busy={busy}
        onUpload={onUpload}
        onPreset={onPreset}
        onExport={onExport}
      />
    </main>
  );
}
