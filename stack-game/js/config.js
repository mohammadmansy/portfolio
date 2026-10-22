/* ============================================================
   Stack — tuning configuration
   All gameplay / feel numbers live here so designers can tune
   the game without touching logic.
   ============================================================ */

export const VIEW = {
  WIDTH: 480,
  HEIGHT: 480
};

export const CAMERA = {
  CX_MULT: 0.5,      // horizontal anchor of the projection
  CY_MULT: 0.6,      // vertical anchor (moves up as tower grows)
  K: 84,             // projection scale (px per world unit)
  FOLLOW: 0.14       // how fast the camera tracks the tower top
};

export const BLOCK = {
  HEIGHT: 1,         // block height in world units
  SIZE: 1,           // starting block footprint
  RANGE: 1.12,       // how far the moving block travels from centre
  PERFECT: 0.1       // max offset for a "perfect" landing
};

export const DEBRIS = {
  GRAVITY: 20,       // world units / s^2
  LIFT_MIN: 0.4,
  LIFT_MAX: 0.8,
  LIFE: 1,           // seconds before a piece is culled
  FADE: 0.42
};

export const PARTICLE = {
  GRAVITY: 8,
  PERFECT_COUNT: 18,
  PERFECT_SPEED: [0.7, 1.7],
  PERFECT_LIFT: [1.6, 4.0],
  DUST_COUNT: 7,
  DUST_LIFT: [0.5, 1.6],
  FADE: 1.1,
  MAX: 120
};

export const RING = {
  GROWTH: 3.4,       // ring radius per second
  FADE: 1.5
};

export const DIFFICULTY = {
  // Gentle onboarding → steady ramp → capped so it stays fair.
  // level is 1-based. Returns the block speed in world units / second.
  base: 1.35,
  perLevel: 0.045,   // how much faster each level gets
  cap: 1.45,         // maximum extra speed
  // A "tier" milestone every N levels (drives the Level Up celebration)
  tierEvery: 5
};

export function moveSpeedForLevel(level) {
  return DIFFICULTY.base + Math.min(DIFFICULTY.cap, level * DIFFICULTY.perLevel);
}

export const STORAGE_KEY = 'stack-game-v1';
