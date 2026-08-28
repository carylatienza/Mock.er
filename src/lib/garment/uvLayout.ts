/**
 * Front/back texture atlas for planar-mapped jersey meshes.
 * Left ~46% = front artwork, gutter, right ~46% = derived back + sides/sleeves.
 */
export type UvRect = { x: number; y: number; w: number; h: number };

export const ATLAS_WIDTH = 2048;
export const ATLAS_HEIGHT = 1024;

export const UV_ISLANDS = {
  front: { x: 0.02, y: 0, w: 0.46, h: 1 } satisfies UvRect,
  back: { x: 0.54, y: 0, w: 0.46, h: 1 } satisfies UvRect,
} as const;
