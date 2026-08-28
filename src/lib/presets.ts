// Camera azimuth in degrees for each export/orbit preset.
// The front panel faces +Z, so 0 is dead front.
// Lives apart from Viewer.tsx so the UI can list presets without pulling
// three.js into the server-prerendered bundle.
export const PRESETS = { front: 0, '3/4': 35, right: 90, back: 180, left: -90 } as const;

export type Preset = keyof typeof PRESETS;
