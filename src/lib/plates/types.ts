import type { Pt } from './kit';

/**
 * A colour on a plate: one of the species' palette roles, or a hex colour. Palette colours are
 * muted into a hand-tinted wash when the plate is drawn.
 */
export type Paint = 'back' | 'belly' | 'fin' | 'accent' | 'tip' | 'dark' | 'light' | 'pattern' | 'ink' | 'paper' | `#${string}`;

export interface Palette {
  /** The upper body (or the whole animal, for one-colour species). */
  back: string;
  /** The underside. */
  belly: string;
  /** Fins (defaults to a darker back). */
  fin?: string;
  accent?: string;
  /** Fin tips and edges. */
  tip?: string;
  /** Spots, bands and patches. */
  pattern?: string;
  /** Dark markings (defaults to a much darker back). */
  dark?: string;
}

/** An engraved line. `w` is its weight (1 = a fine engraving line); `detail` lines are left off small plates. */
export interface Line {
  pts: Pt[];
  w: number;
  o?: number;
  detail?: boolean;
  /**
   * Engraved lines swell and taper like a burin cut: 'both' thins to nothing at each end, 'start'
   * and 'end' at one end only. Untapered lines are plain strokes.
   */
  taper?: 'both' | 'start' | 'end';
}

/** A flat wash of colour (a tint or a marking). */
export interface Fill {
  poly: Pt[];
  paint: Paint;
  o?: number;
  /** Keep it inside the trunk or the whole body outline. */
  clip?: 'trunk' | 'body';
  /** Outline weight, if it has an inked edge. */
  edge?: number;
}

/** A fin or limb drawn as its own shape. */
export interface Part {
  poly: Pt[];
  paint: Paint;
  lines: Line[];
  /** Outline weight (default 0.85 of the body outline). */
  edge?: number;
  /** Marks painted on this part (fin tips, spots), kept inside it. */
  marks?: Fill[];
}

export interface Eye {
  c: Pt;
  r: number;
  /** Iris colour; without one the eye is a dark bead (sharks, whales). */
  iris?: Paint;
  /** 'w' for cuttlefish, 'bar' for octopus and goats, 'round' otherwise. */
  pupil?: 'round' | 'w' | 'bar';
  /** A pale ring of skin round the eye. */
  ring?: boolean;
}

/** Everything a plate is made of, in the 200×128 plate box. */
export interface PlateGeom {
  /** The whole outline: body with its median fins (and tail), as one shape. */
  body: Pt[];
  /** The body without fins: shading and body markings stay inside it. */
  trunk: Pt[];
  /** Washes under the engraving: the trunk's colour first, then belly, patches… */
  tint: Fill[];
  /** Median fins' own washes and lines (drawn between the body and trunk washes). */
  median: Part[];
  /** Shading lines on the trunk. */
  engraving: Line[];
  /** Fins behind the body (the far side). */
  far: Part[];
  /** Fins and limbs in front of the body. */
  near: Part[];
  /** Markings over the engraving (spots, bars, edges). */
  marks: Fill[];
  /** Fine details: gill slits, mouth, lateral line, scales, sutures. */
  lines: Line[];
  eyes: Eye[];
  /** Parts of the outline on the shadow side, inked heavier. */
  heavy: Pt[][];
}

export const emptyGeom = (): PlateGeom => ({
  body: [],
  trunk: [],
  tint: [],
  median: [],
  engraving: [],
  far: [],
  near: [],
  marks: [],
  lines: [],
  eyes: [],
  heavy: [],
});
