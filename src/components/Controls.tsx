'use client';

import { useRef, useState } from 'react';
import { PRESETS, type Preset } from '@/lib/presets';
import { rgbToCmyk, rgbToHex, type RGB } from '@/lib/color';

export type Nudge = { x: number; y: number; scale: number };

type Props = {
  hasImage: boolean;
  mode: 'wrap' | 'graphic';
  setMode: (m: 'wrap' | 'graphic') => void;
  nudge: Nudge;
  setNudge: (n: Nudge) => void;
  baseColor: RGB;
  sideOverride: RGB | null;
  setSideOverride: (c: RGB | null) => void;
  readout: 'rgb' | 'cmyk';
  setReadout: (r: 'rgb' | 'cmyk') => void;
  warnings: string[];
  backVisible: boolean;
  busy: boolean;
  onUpload: (file: File) => void;
  onPreset: (p: Preset) => void;
  onExport: () => void;
};

function hexToRgb(hex: string): RGB {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-[11px] text-white/50">
      <span className="w-10 shrink-0">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1 flex-1 cursor-pointer appearance-none rounded-full bg-white/15 accent-white"
      />
      <span className="w-9 shrink-0 text-right tabular-nums text-white/35">{value.toFixed(2)}</span>
    </label>
  );
}

export default function Controls(p: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const cmyk = rgbToCmyk(...p.baseColor);
  const hex = rgbToHex(...p.baseColor);

  const dropClass = dragging
    ? 'border-white/60 bg-white/10 text-white'
    : 'border-white/20 text-white/45';

  return (
    <div className="pointer-events-none absolute inset-0 font-sans text-white">
      <div className="pointer-events-auto absolute left-6 top-5 text-[13px] font-medium tracking-tight">
        Mock<span className="text-white/40">.er</span>
      </div>

      {/* PRD 7: never show a derived back without disclosure. */}
      {p.backVisible && p.hasImage && (
        <div className="absolute left-1/2 top-5 max-w-[340px] -translate-x-1/2 rounded-full border border-amber-400/30 bg-amber-400/10 px-3 py-1.5 text-center text-[11px] leading-snug text-amber-200/90 backdrop-blur">
          Back panel is <span className="font-semibold">derived</span> — base colour with stripe
          carry-over, not your uploaded artwork
        </div>
      )}

      <div className="pointer-events-auto absolute bottom-6 left-6 flex w-[290px] flex-col gap-4 rounded-xl border border-white/10 bg-black/50 p-4 backdrop-blur-xl">
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            const f = e.dataTransfer.files[0];
            if (f) p.onUpload(f);
          }}
          onClick={() => inputRef.current?.click()}
          className={'cursor-pointer rounded-lg border border-dashed px-3 py-5 text-center text-[11px] transition ' + dropClass}
        >
          {p.busy ? 'Processing…' : p.hasImage ? 'Replace artwork' : 'Drop jersey artwork, or click'}
          <div className="mt-1 text-[10px] text-white/25">PNG or JPG · background optional</div>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) p.onUpload(f);
            e.target.value = '';
          }}
        />

        {p.warnings.map((w) => (
          <p key={w} className="-mt-2 text-[10px] leading-relaxed text-amber-300/70">
            {w}
          </p>
        ))}

        {p.hasImage && (
          <>
            <div className="flex gap-1 rounded-lg bg-white/5 p-1">
              {(['wrap', 'graphic'] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => p.setMode(m)}
                  className={
                    'flex-1 rounded-md px-2 py-1.5 text-[11px] transition ' +
                    (p.mode === m ? 'bg-white text-black' : 'text-white/50 hover:text-white/80')
                  }
                >
                  {m === 'wrap' ? 'Wrap garment' : 'Place graphic'}
                </button>
              ))}
            </div>

            {p.mode === 'graphic' && (
              <div className="flex flex-col gap-2">
                <Slider
                  label="X"
                  min={-1}
                  max={1}
                  step={0.01}
                  value={p.nudge.x}
                  onChange={(x) => p.setNudge({ ...p.nudge, x })}
                />
                <Slider
                  label="Y"
                  min={-1}
                  max={1}
                  step={0.01}
                  value={p.nudge.y}
                  onChange={(y) => p.setNudge({ ...p.nudge, y })}
                />
                <Slider
                  label="Scale"
                  min={0.2}
                  max={2}
                  step={0.01}
                  value={p.nudge.scale}
                  onChange={(scale) => p.setNudge({ ...p.nudge, scale })}
                />
              </div>
            )}

            <div className="flex items-center gap-3 border-t border-white/10 pt-3">
              <div
                className="size-8 shrink-0 rounded-md border border-white/15"
                style={{ background: hex }}
              />
              <div className="flex-1 leading-tight">
                <div className="mb-0.5 flex items-center gap-1.5">
                  <span className="text-[10px] uppercase tracking-wide text-white/35">
                    Base colour
                  </span>
                  <button
                    onClick={() => p.setReadout(p.readout === 'rgb' ? 'cmyk' : 'rgb')}
                    className="rounded bg-white/10 px-1.5 py-px text-[9px] text-white/60 hover:text-white"
                  >
                    {p.readout === 'rgb' ? 'RGB' : 'CMYK'}
                  </button>
                </div>
                <div className="font-mono text-[11px] tabular-nums text-white/75">
                  {p.readout === 'rgb'
                    ? hex + ' · ' + p.baseColor.join(', ')
                    : 'C' + cmyk.c + ' M' + cmyk.m + ' Y' + cmyk.y + ' K' + cmyk.k}
                </div>
                {p.readout === 'cmyk' && (
                  <div className="text-[9px] text-white/25">approximate — not a soft proof</div>
                )}
              </div>
            </div>

            <label className="flex items-center justify-between text-[11px] text-white/50">
              <span>Side panels</span>
              <span className="flex items-center gap-2">
                {p.sideOverride && (
                  <button
                    onClick={() => p.setSideOverride(null)}
                    className="text-[10px] text-white/35 hover:text-white/70"
                  >
                    reset
                  </button>
                )}
                <input
                  type="color"
                  value={rgbToHex(...(p.sideOverride ?? p.baseColor))}
                  onChange={(e) => p.setSideOverride(hexToRgb(e.target.value))}
                  className="size-6 cursor-pointer rounded border border-white/15 bg-transparent"
                />
              </span>
            </label>
          </>
        )}
      </div>

      <div className="pointer-events-auto absolute bottom-6 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full border border-white/10 bg-black/50 p-1 backdrop-blur-xl">
        {(Object.keys(PRESETS) as Preset[]).map((k) => (
          <button
            key={k}
            onClick={() => p.onPreset(k)}
            className="rounded-full px-3 py-1.5 text-[11px] capitalize text-white/55 transition hover:bg-white/10 hover:text-white"
          >
            {k}
          </button>
        ))}
        <button
          onClick={p.onExport}
          className="ml-1 rounded-full bg-white px-3.5 py-1.5 text-[11px] font-medium text-black transition hover:bg-white/85"
        >
          Export PNG
        </button>
      </div>
    </div>
  );
}
