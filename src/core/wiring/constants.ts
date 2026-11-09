/**
 * Wiring numbers from the vision doc's Wiring spec v1. Distances are on-screen pixels:
 * the session divides them by the zoom, so a target feels the same size at every zoom.
 * They are starting values to tune — change them here and the case catalogue tells you what moved.
 */
export const WIRING = {
  /** Press and move further than this = drag wiring; less = click-click wiring. */
  dragThreshold: 6,
  /** Posture is decided by the first movement longer than this away from the anchor. */
  postureDecide: 10,
  /** Within this of a terminal the wire attaches (strong evidence). */
  attachZone: 14,
  /** Within this of a terminal it is noticed and suggested (medium evidence); an attachment holds while inside it. */
  noticeZone: 22,
  /** Approach corridor: half-width, and how far it runs out from the terminal along its axis. */
  corridorHalfWidth: 12,
  corridorLength: 110,
  /** A corridor attachment holds a little beyond the corridor so its edge doesn't flicker. */
  corridorKeepHalfWidth: 14,
  corridorKeepLength: 130,
  /** Movement must point this straight at the terminal (cosine) for a corridor to attach. */
  corridorAttachAlignment: 0.85,
  /** Moving back out along a corridor this clearly (cosine) releases it. */
  corridorReleaseAlignment: 0.5,
  /** Movement direction is read over this window. Shorter movements count as standing still. */
  motionWindowMs: 120,
  motionMinDistance: 5,
  /** Hovering within this of a part's body counts as over the part (part target). */
  partTargetMargin: 8,
  /** Auto-pan when the cursor is this close to the canvas edge. */
  autoPanEdge: 40,
} as const

/** Grid units (world), not pixels: wires leave and enter terminals straight for at least one grid step. */
export const STUB = 20
/** Grid units: parts are kept this far clear by the router. */
export const PART_CLEARANCE = 10
/** Router: cost of a bend, in grid steps. Higher = fewer corners, longer wires. */
export const BEND_COST = 3
/** Router: extra cost per grid step outside the box between the two ends. Keeps detours from overshooting. */
export const OUTSIDE_COST = 1
