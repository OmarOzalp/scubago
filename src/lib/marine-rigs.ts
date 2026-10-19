/**
 * Procedural swim rigs for the species models.
 *
 * The bone layouts here are shared by the asset generator
 * (scripts/art/build-species.ts), which places the bones and bakes a preview
 * loop, and by the runtime, which drives the same bones every frame so tail
 * beats, turns and wing strokes respond to how the animal is actually moving.
 *
 * Model space: nose along +Z, Y up, +X on the animal's left. Shark models are
 * one body length long (snout to tail tip); the manta's wingspan is one unit.
 * This module is dependency-free so Node scripts can import it directly.
 */

export type SwimRigModel = 'tiger-shark' | 'whale-shark' | 'great-white-shark' | 'scalloped-hammerhead' | 'reef-manta' | 'mola-mola' | 'green-turtle' | 'bottlenose-dolphin'
  | 'day-octopus' | 'giant-cuttlefish' | 'giant-moray' | 'great-barracuda' | 'sailfish' | 'clownfish'
  | 'spotted-eagle-ray' | 'california-sea-lion' | 'golden-jellyfish' | 'humpback-whale' | 'sperm-whale' | 'oceanic-whitetip' | 'leatherback-turtle'
  | 'oceanic-manta' | 'harbor-seal' | 'sea-otter' | 'garibaldi' | 'leafy-seadragon' | 'orca'
  | 'marine-iguana' | 'galapagos-shark' | 'thresher-shark' | 'giant-trevally' | 'king-angelfish'
  | 'dugong' | 'sawfish' | 'lemon-shark' | 'southern-stingray' | 'tarpon';

export const SHARK_BONES = [
  'Root', 'Head', 'Spine1', 'Spine2', 'RearBody', 'TailBase', 'Tail', 'TailUpper', 'TailLower',
  'Dorsal', 'PectoralL', 'PectoralR',
] as const;
export const MANTA_BONES = [
  'Root', 'Head', 'CephalicL', 'CephalicR',
  'WingL1', 'WingL2', 'WingL3', 'WingL4', 'WingL5',
  'WingR1', 'WingR2', 'WingR3', 'WingR4', 'WingR5',
  'Tail1', 'Tail2', 'Tail3',
] as const;
export const SUNFISH_BONES = [
  'Root', 'Dorsal1', 'Dorsal2', 'Anal1', 'Anal2', 'Clavus1', 'Clavus2', 'Clavus3', 'PectoralL', 'PectoralR',
] as const;
export const TURTLE_BONES = [
  'Root', 'Head', 'FrontL1', 'FrontL2', 'FrontR1', 'FrontR2', 'RearL', 'RearR', 'Tail',
] as const;
/** Dolphins: the spine chain of the sharks, but `Tail` carries the horizontal flukes, whose tips flex on `FlukeL/R`. */
export const DOLPHIN_BONES = [
  'Root', 'Head', 'Spine1', 'Spine2', 'RearBody', 'TailBase', 'Tail', 'FlukeL', 'FlukeR', 'PectoralL', 'PectoralR',
] as const;
/**
 * The octopus's eight arms around the crown, each of four segments, named by side and position from
 * front to back, with the direction each one points in the bind pose (rad from straight ahead, +Z,
 * toward the animal's left, +X; the right side mirrors). Shared with the generator.
 */
export const OCTOPUS_ARMS = [
  { name: 'L1', angle: .34 }, { name: 'L2', angle: .98 }, { name: 'L3', angle: 1.72 }, { name: 'L4', angle: 2.42 },
  { name: 'R1', angle: -.34 }, { name: 'R2', angle: -.98 }, { name: 'R3', angle: -1.72 }, { name: 'R4', angle: -2.42 },
] as const;
export const OCTOPUS_SEGMENTS = 4;
export const octopusArmBone = (arm: string, segment: number) => `Arm${arm}_${segment}`;
export const OCTOPUS_BONES: readonly string[] = ['Root', 'Mantle',
  ...OCTOPUS_ARMS.flatMap(({ name }) => Array.from({ length: OCTOPUS_SEGMENTS }, (_, s) => octopusArmBone(name, s + 1)))];
/**
 * The cuttlefish's mantle seen from above: half its width (model units) along its length, from the
 * front edge over the head (z = .2) to the rounded rear (z = -.5). Shared with the generator, so the
 * fin bones' hinges follow the mantle's edge.
 */
export function cuttlefishHalfWidth(z: number) {
  const u = z >= -.14 ? (z + .14) / .48 : (z + .14) / .36;
  return .158 * Math.sqrt(Math.max(0, 1 - u * u));
}
/** The fin skirt's bones along each side of the mantle, front to back: where each hinge sits and the edge's direction there (rad from +Z toward +X, left side). */
export const CUTTLEFISH_FINS = Array.from({ length: 7 }, (_, i) => {
  const z = .16 - i * .1, h = .004;
  return { z, x: cuttlefishHalfWidth(z), yaw: Math.atan2((cuttlefishHalfWidth(z + h) - cuttlefishHalfWidth(z - h)) / (2 * h), 1) };
});
export const CUTTLEFISH_BONES: readonly string[] = ['Root', 'Mantle', 'Head',
  ...CUTTLEFISH_FINS.map((_, i) => `FinL${i + 1}`), ...CUTTLEFISH_FINS.map((_, i) => `FinR${i + 1}`),
  'ArmLU1', 'ArmLU2', 'ArmRU1', 'ArmRU2', 'ArmLD1', 'ArmLD2', 'ArmRD1', 'ArmRD2'];
/**
 * Sea lions: the shark's spine chain (`Head` at the base of the long neck, `Tail` the hind flippers'
 * root), the long fore flippers in two parts (`ForeL1` the arm, `ForeL2` the hand) and the hind flippers.
 */
export const PINNIPED_BONES = [
  'Root', 'Head', 'Spine1', 'Spine2', 'RearBody', 'TailBase', 'Tail', 'ForeL1', 'ForeL2', 'ForeR1', 'ForeR2', 'HindL', 'HindR',
] as const;
/**
 * The jellyfish: `Bell` (its dome) and `Rim` (the margin) scale to pulse; eight oral arms hang from
 * under the bell, each in two parts (`Arm1A`, `Arm1B`), the first at `jellyArmAngle(0)` (rad from +Z
 * toward +X). Shared with the generator.
 */
export const JELLY_ARMS = 8;
export const jellyArmAngle = (i: number) => (i + .5) * Math.PI * 2 / JELLY_ARMS;
export const JELLY_BONES: readonly string[] = ['Root', 'Bell', 'Rim',
  ...Array.from({ length: JELLY_ARMS }, (_, i) => [`Arm${i + 1}A`, `Arm${i + 1}B`]).flat()];
/** The moray: `Root` at the neck, `Head` and its lower `Jaw` ahead of it, and eight body bones behind it to the tail. */
export const MORAY_BONES = ['Root', 'Head', 'Jaw', 'Body1', 'Body2', 'Body3', 'Body4', 'Body5', 'Body6', 'Body7', 'Body8'] as const;
export type SharkBone = typeof SHARK_BONES[number];
export type MantaBone = typeof MANTA_BONES[number];
/** Every bone rotation is an intrinsic Z·X·Y Euler: flap/roll, then pitch/twist, then yaw. */
export const RIG_EULER_ORDER = 'ZXY';

export type SharkRig = {
  kind: 'shark';
  /** Spine joints measured from the snout (0) to the tail tip (1): Root/Spine1, Spine2, RearBody, TailBase, Tail. */
  joints: readonly [number, number, number, number, number];
  dorsalParent: 'Spine1' | 'Spine2';
  /** Axial position of the first dorsal fin's base, for its sway timing. */
  dorsalAt: number;
  /** Tail beats per second at cruising effort. */
  frequency: number;
  /** Body wave length in body lengths. Longer waves keep the front of the body stiffer. */
  wavelength: number;
  /** Lateral excursion in body lengths at the tail tip, the root joint and the snout. */
  tailAmplitude: number;
  rootAmplitude: number;
  headAmplitude: number;
  /** Envelope exponent; higher values concentrate the motion in the rear body and tail. */
  envelope: number;
  /** Share of the swimming sway the head follows (1 unless set); turns still lead with the head. */
  headSteady?: number;
  /** Extra flex of each caudal lobe (rad) trailing the tail stroke, and the lobes' angles from horizontal. */
  lobes: { upper: number; lower: number; upperAngle: number; lowerAngle: number; lag: number };
  /** Secondary sway of the first dorsal fin (rad). */
  dorsal: number;
  /**
   * Pectoral fins: cyclic flap and pitch (rad), plus responses to turning (per rad/s) and climbing.
   * `row` (rad) sweeps them back and forth like oars, one after the other (a clownfish), harder as a
   * hovering fish's tail rests.
   */
  pectoral: { flap: number; pitch: number; turn: number; climb: number; row?: number };
  /** Body roll with each tail beat (rad). */
  roll: number;
  /** Share of the path curvature expressed as a bend in the body when turning. */
  bend: number;
  /**
   * A fish that hangs still in the water (a lurking barracuda): the share of its tail stroke left at
   * its slowest (1 unless set), so it holds its place with barely a flicker and the pectorals sculling.
   */
  hover?: number;
  /**
   * A sail on `Dorsal` that folds down into its groove (a sailfish): its height when folded (share of
   * full height), and how far it stands raised when nothing says otherwise. `SwimDrive.sail` sets it
   * (0 folded, 1 fully raised); sideways it still sways with the stroke.
   */
  sail?: { folded: number; cruise: number };
};

export type MantaRig = {
  kind: 'manta';
  /** Wing strokes per second at cruising effort. */
  frequency: number;
  /** Local flap amplitude of each wing segment, body to tip (rad). */
  flap: readonly number[];
  /** Phase delay between neighboring wing segments; the wave travels toward the tips. */
  waveLag: number;
  /** Chordwise twist of each segment (rad); the trailing edge lags the leading edge. */
  twist: readonly number[];
  /** Tips-up dihedral held while gliding (rad per segment). */
  glideDihedral: readonly number[];
  /** Outer wing works harder in turns: fractional amplitude change per rad/s of turn. */
  turnAsymmetry: number;
  /** Stronger strokes while climbing, gentler while descending. */
  climbGain: number;
  /** Body rises on the downstroke (units of wingspan) and pitches gently (rad). */
  bob: number;
  pitch: number;
  /** Cephalic lobe curl (rad) and trailing tail wave (rad per segment). */
  cephalic: number;
  tail: readonly number[];
};

export type SunfishRig = {
  kind: 'sunfish';
  /** Fin beats per second at cruising effort. */
  frequency: number;
  /** Side-to-side sweep of the dorsal and anal fins at the base, and extra flex toward the tips (rad). */
  sweep: number;
  flex: number;
  /** Phase lag of the fin tips behind their bases, and of the anal fin behind the dorsal fin. */
  tipLag: number;
  analLag: number;
  /** The stiff disc sways against each beat (rad of yaw) and barely rolls (rad). */
  bodyYaw: number;
  bodyRoll: number;
  /** Clavus: a gentle ripple along its scalloped edge (rad), plus rudder deflection per rad/s of turn. */
  clavus: number;
  rudder: number;
  /** Small pectoral flutter (rad), at twice the fin beat so the loop stays seamless. */
  pectoral: number;
};

export type TurtleRig = {
  kind: 'turtle';
  /** Front flipper strokes per second while actively swimming. */
  frequency: number;
  /** Front flipper stroke: flap up and down, sweep fore and aft, feathering twist, and the forearm's extra lagging flex (rad). */
  flap: number;
  sweep: number;
  feather: number;
  elbow: number;
  /** Phase delay of the right flipper behind the left (0 = perfectly synchronized strokes). */
  offset: number;
  /** Glide pose: front flippers swept back along the shell and slightly lowered (rad). */
  glideSweep: number;
  glideDroop: number;
  /** Strokes per bout (min, max) and glide seconds between bouts (min, max); each bout varies. */
  bout: readonly [number, number];
  glide: readonly [number, number];
  /** Body pitch (rad) and rise (units of body length) with each stroke, and the head's gentle counter-bob (rad). */
  pitch: number;
  bob: number;
  head: number;
  /** Rear flippers: steering yaw per rad/s of turn and a slight paddle while stroking (rad). */
  rudder: number;
  paddle: number;
};

export type CetaceanRig = {
  kind: 'cetacean';
  /** Spine joints from the beak tip (0) to the fluke tips (1): Root/Spine1, Spine2, RearBody, TailBase, Tail (the flukes' root). */
  joints: readonly [number, number, number, number, number];
  /** Fluke beats per second at cruising effort. */
  frequency: number;
  /** Body wave length in body lengths: long, so the front of the body barely moves. */
  wavelength: number;
  /** Vertical excursion in body lengths at the fluke tips, the root joint and the beak. */
  tailAmplitude: number;
  rootAmplitude: number;
  headAmplitude: number;
  /** Envelope exponent; higher values concentrate the motion in the tail stock and flukes. */
  envelope: number;
  /** Extra pitch of the flukes against the stroke (rad), trailing it by `flukeLag`: they angle into each beat. */
  fluke: number;
  flukeLag: number;
  /** Spanwise flex of the fluke tips, trailing the flukes (rad). */
  flukeFlex: number;
  /** Pectoral flippers: slight trim with each beat, and responses to turning (per rad/s) and climbing (rad). */
  pectoral: { flap: number; turn: number; climb: number };
  /** The body rises and falls a little against the flukes (body lengths). */
  heave: number;
  /** Share of the path curvature expressed as a sideways bend when turning. */
  bend: number;
};

export type OctopusRig = {
  kind: 'octopus';
  /** Arm cycles per second while crawling at its cruising pace (slower, but never still, when it rests). */
  frequency: number;
  /** Each arm's own phase and vigor (around 1), so no two arms move alike. */
  phases: readonly number[];
  vigor: readonly number[];
  /** A slow sideways wave traveling out along each arm (rad per segment, growing toward the tip), and its lag between segments (rad). */
  curl: number; curlLag: number;
  /** Crawling: arms reach forward and pull back (rad at the base, front arms most), tips pressing to the floor and lifting on the way back (rad). */
  reach: number; press: number;
  /** Resting: the arms coil to one side, most at the tips (rad), and the body settles (units). */
  coil: number; settle: number;
  /** Breathing: the mantle's pulse (scale fraction) and breaths per second. */
  breath: number; breathRate: number;
  /** As it crawls, the mantle rides up and down (rad) and the body bobs (units). */
  mantle: number; bob: number;
  /** Jetting: the arms sweep back together behind it (share of the way), the mantle squeezes (scale fraction) and lowers into the line of travel (rad). */
  trail: number; squeeze: number; streamline: number;
  /** Turning, the arms lag behind the body's turn (rad per rad/s of turn). */
  swirl: number;
};

export type CuttlefishRig = {
  kind: 'cuttlefish';
  /** Fin waves per second at its cruising pace; hovering, the ripple slows but never stops. */
  frequency: number;
  /** Phase lag between neighboring fin bones, front to back, so the wave travels backward along the skirt. */
  waveLag: number;
  /** How far the fin's margin rolls up and down (rad) cruising, and hovering. */
  amplitude: number; hover: number;
  /** In a turn the outer fin ripples harder (fraction per rad/s). */
  turnAsymmetry: number;
  /** Arms: a gentle sway (rad), the upper pair held up a little while hovering (rad), and how far they close together and straighten when it speeds up or jets (0..1). */
  sway: number; raise: number; trail: number;
  /** Breathing (mantle pulse, scale fraction; breaths per second); jetting squeezes the mantle (scale fraction) and folds the fins down (rad). */
  breath: number; breathRate: number; squeeze: number; fold: number;
  /** The body rides up and down with the ripple (units) and pitches into climbs (rad). */
  bob: number; pitch: number;
};

export type MorayRig = {
  kind: 'moray';
  /** Spine joints from the snout (0) to the tail tip (1): `Root` and `Body1` at the neck, then `Body2`–`Body8`. */
  joints: readonly [number, number, number, number, number, number, number, number];
  /** Swimming: body waves per second at its cruising pace, the wave's length and its sideways reach at the tail tip and at the head (body lengths), growing along the body by `envelope`. */
  frequency: number; wavelength: number; amplitude: number; headAmplitude: number; envelope: number;
  /** Share of the path's curvature taken up as a bend in the body. */
  bend: number;
  /**
   * Resting in its den: a lazy curve along its body, a slow sway (units), the head looking about
   * (rad), and the mouth opening and closing as it breathes (rad, breaths per second). `curve` is a
   * gentle S (units) in the front half, the part out of the den, back to straight where the body
   * goes into the rock.
   */
  drape: number; sway: number; look: number; gape: number; breathRate: number; curve: number;
};

export type PinnipedRig = {
  kind: 'pinniped';
  /** Spine joints from the nose (0) to the hind flipper tips (1): the neck's base (`Head`, `Spine1`), `Spine2`, `RearBody`, the hips (`TailBase`) and the hind flippers' root (`Tail`). */
  joints: readonly [number, number, number, number, number];
  /** Fore flipper strokes per second while actively swimming. */
  frequency: number;
  /** Fore flipper stroke: raise and lower, sweep fore and aft, feathering twist, and the hand's lagging flex (rad). */
  flap: number; sweep: number; feather: number; wrist: number;
  /** Glide pose: fore flippers swept back along the flanks and a little lowered (rad). */
  glideSweep: number; glideDroop: number;
  /** Strokes per bout (min, max) and glide seconds between bouts (min, max); each bout varies. */
  bout: readonly [number, number]; glide: readonly [number, number];
  /** Body pitch (rad) and rise (body lengths) with each stroke, and a gentle wave running down the spine (rad). */
  pitch: number; bob: number; wave: number;
  /** Share of the path curvature taken up as a bend along the whole supple body. */
  bend: number;
  /** The head on its long neck: a nod against each stroke (rad), leading into turns (rad per rad/s), and looking about while gliding (rad; looks per second). */
  head: number; lead: number; look: number; lookRate: number;
  /** Hind flippers: following the body's curve in turns (rad per rad/s), and parting a little on each stroke (rad). */
  rudder: number; splay: number;
  /**
   * What drives it (fore, the default): the sea lion flies with its fore flippers. A true seal
   * (`hind`) sweeps its hind flippers and rear body from side to side, its short fore flippers
   * pressed to its flanks. A sea otter (`otter`) undulates its body up and down and paddles with its
   * big hind feet, its small forepaws tucked; at rest (SwimDrive.rest) it floats on its back, paws
   * on its chest, head and feet up, sculling with its tail.
   */
  stroke?: 'fore' | 'hind' | 'otter';
};

export type JellyRig = {
  kind: 'jelly';
  /** Bell pulses per second at its cruising pace. */
  frequency: number;
  /** A pulse narrows the rim (scale fraction; the dome half as much) and deepens the bell; `contract` is the share of each cycle spent contracting, the rest the slower relaxation. */
  squeeze: number; stretch: number; contract: number;
  /** Oral arms: their swing in and out behind the pulse (rad), the lag down each arm (rad), and how far they trail behind the drift (rad). */
  sway: number; lag: number; trail: number;
  /** The bell tilts into its drift (rad at cruising pace) and turns slowly about its axis (rad per second). */
  tilt: number; spin: number;
  /** Rise with each pulse (bell diameters). */
  bob: number;
};

export type SwimRigSpec = SharkRig | MantaRig | SunfishRig | TurtleRig | CetaceanRig | OctopusRig | CuttlefishRig | MorayRig | PinnipedRig | JellyRig;

/**
 * Species animation configuration. Swimming speed and turning live in
 * src/lib/marine-motion.ts; these values shape how the body moves at that speed.
 */
export const SWIM_RIGS: Record<SwimRigModel, SwimRigSpec> = {
  // Heavy, controlled carangiform swimmer: stiff front, driving rear third, long flexible upper lobe.
  'tiger-shark': {
    kind: 'shark', joints: [.27, .43, .565, .675, .765], dorsalParent: 'Spine1', dorsalAt: .37,
    frequency: .44, wavelength: .98, tailAmplitude: .105, rootAmplitude: .0035, headAmplitude: .007, envelope: 2.2,
    lobes: { upper: .2, lower: .08, upperAngle: .62, lowerAngle: .95, lag: 1.1 },
    dorsal: .05, pectoral: { flap: .035, pitch: .03, turn: .45, climb: .22 }, roll: .018, bend: .8,
  },
  // Enormous and slow: long sweeps concentrated in the rear, almost no head movement, a gentle roll.
  'whale-shark': {
    kind: 'shark', joints: [.3, .47, .6, .7, .78], dorsalParent: 'Spine2', dorsalAt: .52,
    frequency: .17, wavelength: 1.12, tailAmplitude: .12, rootAmplitude: .002, headAmplitude: .003, envelope: 2.35,
    lobes: { upper: .13, lower: .07, upperAngle: .72, lowerAngle: .88, lag: 1.25 },
    dorsal: .035, pectoral: { flap: .015, pitch: .012, turn: .25, climb: .12 }, roll: .03, bend: .55,
  },
  // Powerful, near-thunniform: rigid torpedo body, motion packed into the keeled peduncle and stiff crescent tail.
  'great-white-shark': {
    kind: 'shark', joints: [.28, .45, .59, .7, .8], dorsalParent: 'Spine1', dorsalAt: .37,
    frequency: .6, wavelength: 1.32, tailAmplitude: .088, rootAmplitude: .0025, headAmplitude: .004, envelope: 3.3,
    lobes: { upper: .07, lower: .05, upperAngle: .85, lowerAngle: .85, lag: .8 },
    dorsal: .025, pectoral: { flap: .02, pitch: .025, turn: .6, climb: .3 }, roll: .022, bend: .7,
  },
  // A slow, deliberate cruiser of the open ocean: lazy beats of the tail, the long paddle pectorals held
  // out wide like wings and steering in turns.
  'oceanic-whitetip': {
    kind: 'shark', joints: [.28, .45, .59, .7, .8], dorsalParent: 'Spine1', dorsalAt: .37,
    frequency: .46, wavelength: 1.3, tailAmplitude: .085, rootAmplitude: .003, headAmplitude: .004, envelope: 3.1,
    lobes: { upper: .07, lower: .05, upperAngle: .85, lowerAngle: .85, lag: .8 },
    dorsal: .025, pectoral: { flap: .03, pitch: .03, turn: .7, climb: .35 }, roll: .028, bend: .75,
  },
  // Agile and a little serpentine: the wave starts earlier in the body than the great white's and swells
  // toward the long upper lobe, while the wide head (the cephalofoil) stays almost still.
  'scalloped-hammerhead': {
    kind: 'shark', joints: [.26, .42, .56, .665, .74], dorsalParent: 'Spine1', dorsalAt: .35,
    frequency: .52, wavelength: .92, tailAmplitude: .09, rootAmplitude: .005, headAmplitude: .0015, envelope: 1.75, headSteady: .4,
    lobes: { upper: .14, lower: .06, upperAngle: .6, lowerAngle: 1, lag: 1 },
    dorsal: .045, pectoral: { flap: .03, pitch: .03, turn: .55, climb: .25 }, roll: .012, bend: .95,
  },
  // Underwater flight: a flexible sheet with a wave running outward and backward across each wing.
  'reef-manta': {
    kind: 'manta', frequency: .3,
    flap: [.08, .125, .15, .16, .17], waveLag: .34,
    twist: [0, .03, .06, .1, .14], glideDihedral: [.015, .02, .025, .03, .035],
    turnAsymmetry: .5, climbGain: .6, bob: .012, pitch: .02, cephalic: .12, tail: [.05, .09, .14],
  },
  // The same flight as the reef manta's, slower and statelier for the larger ray.
  'oceanic-manta': {
    kind: 'manta', frequency: .25,
    flap: [.08, .125, .15, .16, .17], waveLag: .36,
    twist: [0, .03, .06, .1, .14], glideDihedral: [.015, .02, .025, .03, .035],
    turnAsymmetry: .5, climbGain: .55, bob: .01, pitch: .018, cephalic: .1, tail: [.05, .09, .14],
  },
  // Smaller and quicker than the manta: deep, steady wingbeats from the shoulders out to the pointed
  // tips (it flies rather than glides), the long whip of a tail trailing its own slow wave.
  'spotted-eagle-ray': {
    kind: 'manta', frequency: .5,
    flap: [.1, .16, .2, .22, .24], waveLag: .3,
    twist: [0, .04, .08, .12, .16], glideDihedral: [.02, .025, .03, .035, .04],
    turnAsymmetry: .5, climbGain: .5, bob: .014, pitch: .025, cephalic: 0, tail: [.04, .06, .09],
  },
  // Flies with its long fore flippers: a bout of one or two strong strokes, then a glide with them
  // pressed back along its flanks; the supple body bends right round in turns, the head leading on its
  // long neck and looking about as it glides.
  'california-sea-lion': {
    kind: 'pinniped', joints: [.2, .38, .55, .7, .82], frequency: .8,
    flap: .55, sweep: .5, feather: .5, wrist: .3, glideSweep: .9, glideDroop: .2,
    bout: [1, 2], glide: [1.4, 2.8], pitch: .05, bob: .006, wave: .08, bend: .9,
    head: .08, lead: .4, look: .35, lookRate: .15, rudder: .4, splay: .12,
  },
  // Sweeps its rear body and hind flippers from side to side, the flippers beating alternately, its
  // short fore flippers pressed to its flanks; short bouts of strokes and long, curious glides.
  'harbor-seal': {
    kind: 'pinniped', stroke: 'hind', joints: [.15, .32, .5, .67, .82], frequency: .9,
    flap: .45, sweep: 0, feather: 0, wrist: 0, glideSweep: .35, glideDroop: .2,
    bout: [2, 4], glide: [1.2, 2.8], pitch: .02, bob: .003, wave: .2, bend: .85,
    head: .05, lead: .35, look: .3, lookRate: .12, rudder: .3, splay: .22,
  },
  // Undulates its long body up and down and paddles with its big webbed hind feet in quick bouts; at
  // rest it floats on its back, paws on its chest, sculling with its tail.
  'sea-otter': {
    kind: 'pinniped', stroke: 'otter', joints: [.14, .3, .46, .6, .74], frequency: 1.15,
    flap: .5, sweep: 0, feather: 0, wrist: 0, glideSweep: .3, glideDroop: .25,
    bout: [2, 5], glide: [.8, 1.8], pitch: .04, bob: .004, wave: .28, bend: .85,
    head: .06, lead: .3, look: .35, lookRate: .14, rudder: .3, splay: .12,
  },
  // A big damselfish: hovers by its rock rowing with its pectorals, the deep body nearly still, and
  // darts with quick beats of its broad tail.
  garibaldi: {
    kind: 'shark', joints: [.3, .45, .58, .69, .78], dorsalParent: 'Spine2', dorsalAt: .5,
    frequency: 1.6, wavelength: .95, tailAmplitude: .09, rootAmplitude: .005, headAmplitude: .014, envelope: 1.7,
    lobes: { upper: .1, lower: .1, upperAngle: 1, lowerAngle: 1, lag: 1 },
    dorsal: .04, pectoral: { flap: .1, pitch: .07, turn: .6, climb: .3, row: .5 }, roll: .03, bend: .85, hover: .35,
  },
  // Barely swims at all: its body held stiff, it drifts on tiny, fluttering transparent fins, the
  // leafy lobes swaying with the water.
  'leafy-seadragon': {
    kind: 'shark', joints: [.22, .4, .56, .7, .84], dorsalParent: 'Spine2', dorsalAt: .5,
    frequency: 1.4, wavelength: 1.4, tailAmplitude: .03, rootAmplitude: .004, headAmplitude: .006, envelope: 1.2,
    lobes: { upper: .02, lower: .02, upperAngle: .6, lowerAngle: .6, lag: 1 },
    dorsal: .25, pectoral: { flap: .3, pitch: .1, turn: .3, climb: .2, row: .4 }, roll: .02, bend: .5, hover: .6,
  },
  // The dolphin's stroke, stronger and slower in the much bigger body: powerful beats of the broad
  // flukes, the tall dorsal fin steady, the paddle flippers trimming it through turns.
  orca: {
    kind: 'cetacean', joints: [.3, .5, .64, .76, .865], frequency: .48, wavelength: 1.3,
    tailAmplitude: .07, rootAmplitude: .003, headAmplitude: .003, envelope: 3,
    fluke: .17, flukeLag: 1.2, flukeFlex: .12, pectoral: { flap: .035, turn: .5, climb: .3 }, heave: .004, bend: .8,
  },
  // Rows with its bell: a quick squeeze and a slower relaxation, the frilly oral arms swinging behind
  // each pulse; it drifts bell-first, tilted into its path, turning slowly about its axis.
  'golden-jellyfish': {
    kind: 'jelly', frequency: .9, squeeze: .16, stretch: .12, contract: .38, sway: .22, lag: .9, trail: .12, tilt: .35, spin: .25, bob: .02,
  },
  // Lift-based fin flapping: the tall dorsal and anal fins beat together from side to side while the
  // stiff disc barely flexes; the scalloped clavus trims and steers.
  'mola-mola': {
    kind: 'sunfish', frequency: .36, sweep: .4, flex: .24, tipLag: .65, analLag: .2,
    bodyYaw: .035, bodyRoll: .015, clavus: .07, rudder: .55, pectoral: .3,
  },
  // Aquatic flight: short bouts of nearly synchronized front flipper strokes, then long glides with
  // the flippers swept back along the shell. The small rear flippers steer.
  'green-turtle': {
    kind: 'turtle', frequency: .42, flap: .6, sweep: .42, feather: .55, elbow: .32, offset: .12,
    glideSweep: .62, glideDroop: .1, bout: [2, 3], glide: [2.5, 5.5],
    pitch: .04, bob: .006, head: .07, rudder: .55, paddle: .14,
  },
  // The green turtle's stroke on the leatherback's enormous front flippers: deeper, slower and more
  // wing-like, with long glides; an ocean traveller rather than a reef grazer.
  'leatherback-turtle': {
    kind: 'turtle', frequency: .34, flap: .7, sweep: .45, feather: .6, elbow: .3, offset: .12,
    glideSweep: .66, glideDroop: .12, bout: [2, 4], glide: [3, 6],
    pitch: .035, bob: .006, head: .05, rudder: .5, paddle: .12,
  },
  // Up-and-down propulsion: the tail stock heaves the horizontal flukes, which angle into every beat,
  // while the head and front body stay steady. Quicker beats than any shark.
  'bottlenose-dolphin': {
    kind: 'cetacean', joints: [.3, .5, .64, .76, .865], frequency: .78, wavelength: 1.25,
    tailAmplitude: .075, rootAmplitude: .003, headAmplitude: .004, envelope: 2.9,
    fluke: .18, flukeLag: 1.2, flukeFlex: .12, pectoral: { flap: .04, turn: .5, climb: .3 }, heave: .004, bend: .85,
  },
  // The dolphin's stroke, slowed to a whale's: long, unhurried beats of the broad flukes, the huge
  // body barely heaving; the long flippers trim and bank it through turns like wings.
  'humpback-whale': {
    kind: 'cetacean', joints: [.32, .5, .64, .76, .87], frequency: .3, wavelength: 1.4,
    tailAmplitude: .062, rootAmplitude: .002, headAmplitude: .002, envelope: 3.1,
    fluke: .2, flukeLag: 1.2, flukeFlex: .15, pectoral: { flap: .05, turn: .45, climb: .25 }, heave: .003, bend: .6,
  },
  // The great square head is held steady while the rear third of the body drives slow, deep strokes of
  // the triangular flukes; the stubby flippers barely move.
  'sperm-whale': {
    kind: 'cetacean', joints: [.38, .55, .67, .78, .875], frequency: .26, wavelength: 1.5,
    tailAmplitude: .06, rootAmplitude: .0015, headAmplitude: .0015, envelope: 3.4,
    fluke: .18, flukeLag: 1.2, flukeFlex: .1, pectoral: { flap: .03, turn: .3, climb: .2 }, heave: .002, bend: .5,
  },
  // A crawler, not a swimmer: eight arms each with its own rhythm, reaching and pulling over the reef,
  // a slow wave running out along each; at rest they coil and the mantle settles and breathes; a jet
  // sweeps them back together behind the squeezed mantle.
  'day-octopus': {
    kind: 'octopus', frequency: .34, phases: [0, 2.3, 4.1, 1.2, 3.6, 5.5, .7, 2.9], vigor: [1, .85, 1.1, .9, .95, 1.15, .8, 1.05],
    curl: .22, curlLag: .9, reach: .3, press: .14, coil: .6, settle: .008, breath: .05, breathRate: .32,
    mantle: .1, bob: .004, trail: .94, squeeze: .14, streamline: .42, swirl: .25,
  },
  // No tail: a wave rippling backward along the fin skirt around the mantle moves it, smooth and
  // hovering, while the body stays level; a jet squeezes the mantle and folds the fins.
  'giant-cuttlefish': {
    kind: 'cuttlefish', frequency: .95, waveLag: .78, amplitude: .62, hover: .38, turnAsymmetry: .6,
    sway: .08, raise: .24, trail: .85, breath: .035, breathRate: .4, squeeze: .1, fold: .4, bob: .0025, pitch: .1,
  },
  // Anguilliform: the whole long body waves, the wave growing toward the tail; resting in its den it
  // lies in a lazy curve, looking about and breathing through its slowly opening mouth.
  // Subcarangiform and stiff-bodied: the stroke lives in the rear third and the forked tail. Lurking,
  // it hangs almost motionless (the tail barely flickers, the pectorals scull); bursts beat hard.
  'great-barracuda': {
    kind: 'shark', joints: [.29, .45, .59, .71, .815], dorsalParent: 'Spine2', dorsalAt: .425,
    frequency: .82, wavelength: 1.05, tailAmplitude: .085, rootAmplitude: .003, headAmplitude: .004, envelope: 2.6,
    lobes: { upper: .07, lower: .07, upperAngle: .8, lowerAngle: .8, lag: .9 },
    dorsal: .03, pectoral: { flap: .12, pitch: .06, turn: .5, climb: .25 }, roll: .012, bend: .8, hover: .12,
  },
  // Built for speed: a stiff, near-thunniform stroke packed into the keeled tail stock and the tall
  // crescent tail. The sail stands partly raised cruising, rises fully as it slows and turns, and
  // folds flat into its groove for a burst.
  sailfish: {
    kind: 'shark', joints: [.33, .48, .61, .72, .83], dorsalParent: 'Spine1', dorsalAt: .4,
    frequency: .95, wavelength: 1.3, tailAmplitude: .07, rootAmplitude: .0025, headAmplitude: .003, envelope: 3.2,
    lobes: { upper: .05, lower: .05, upperAngle: .9, lowerAngle: .9, lag: .8 },
    dorsal: .04, pectoral: { flap: .03, pitch: .03, turn: .55, climb: .25 }, roll: .01, bend: .7, hover: .35,
    sail: { folded: .07, cruise: .72 },
  },
  // Labriform with a waggle: it rows with its paddle pectorals, the deep little body wagging from
  // the head back to the rounded tail; by its anemone it all but stops the tail and hovers on its oars.
  clownfish: {
    kind: 'shark', joints: [.3, .45, .58, .69, .78], dorsalParent: 'Spine2', dorsalAt: .56,
    frequency: 2.1, wavelength: .95, tailAmplitude: .1, rootAmplitude: .006, headAmplitude: .018, envelope: 1.6,
    lobes: { upper: .12, lower: .12, upperAngle: 1.15, lowerAngle: 1.15, lag: 1 },
    dorsal: .05, pectoral: { flap: .12, pitch: .08, turn: .6, climb: .3, row: .55 }, roll: .03, bend: .9, hover: .3,
  },
  // A classic requiem shark of remote islands: steady, confident beats of the tail, the stiff front
  // carrying the tall dorsal fin level, the broad pectorals trimming it through turns.
  'galapagos-shark': {
    kind: 'shark', joints: [.28, .44, .58, .69, .79], dorsalParent: 'Spine1', dorsalAt: .36,
    frequency: .55, wavelength: 1.1, tailAmplitude: .095, rootAmplitude: .003, headAmplitude: .005, envelope: 2.6,
    lobes: { upper: .12, lower: .06, upperAngle: .7, lowerAngle: .9, lag: 1 },
    dorsal: .035, pectoral: { flap: .03, pitch: .03, turn: .55, climb: .28 }, roll: .02, bend: .8,
  },
  // Half of it is tail: a slim body swims with slow, deep strokes, and the great scythe of the upper
  // lobe sweeps in a wide arc behind, bending along its length as it trails each stroke.
  'thresher-shark': {
    kind: 'shark', joints: [.17, .28, .38, .46, .52], dorsalParent: 'Spine1', dorsalAt: .3,
    frequency: .5, wavelength: 1.9, tailAmplitude: .1, rootAmplitude: .003, headAmplitude: .004, envelope: 1.7,
    lobes: { upper: .03, lower: .05, upperAngle: .32, lowerAngle: .85, lag: .6 },
    dorsal: .03, pectoral: { flap: .02, pitch: .025, turn: .45, climb: .25 }, roll: .016, bend: .85,
  },
  // A stiff-bodied jack: quick, strong beats packed into the narrow tail stock and the deeply forked
  // tail, the deep silver body hardly bending; the sickle pectorals held out to steer.
  'giant-trevally': {
    kind: 'shark', joints: [.3, .45, .59, .7, .79], dorsalParent: 'Spine2', dorsalAt: .45,
    frequency: 1.1, wavelength: 1.15, tailAmplitude: .095, rootAmplitude: .003, headAmplitude: .006, envelope: 2.8,
    lobes: { upper: .11, lower: .11, upperAngle: .95, lowerAngle: .95, lag: .85 },
    dorsal: .03, pectoral: { flap: .05, pitch: .04, turn: .35, climb: .25 }, roll: .015, bend: .75,
  },
  // An angelfish's unhurried rowing: the pectorals sweep it along by the rocks, the tall disc of a
  // body tilting and turning on the spot, the tail adding a beat for a burst.
  'king-angelfish': {
    kind: 'shark', joints: [.3, .45, .58, .7, .8], dorsalParent: 'Spine2', dorsalAt: .45,
    frequency: 1.5, wavelength: .95, tailAmplitude: .085, rootAmplitude: .005, headAmplitude: .012, envelope: 1.7,
    lobes: { upper: .1, lower: .1, upperAngle: 1.05, lowerAngle: 1.05, lag: 1 },
    dorsal: .08, pectoral: { flap: .1, pitch: .07, turn: .6, climb: .3, row: .5 }, roll: .03, bend: .85, hover: .35,
  },
  // Swims like a crocodile: legs folded back against its flanks, the long, flattened tail sweeping it
  // along in slow waves that grow toward the whip of its tip, the head held steady and high.
  'marine-iguana': {
    kind: 'shark', joints: [.2, .33, .45, .58, .72], dorsalParent: 'Spine1', dorsalAt: .25,
    frequency: .8, wavelength: .95, tailAmplitude: .1, rootAmplitude: .006, headAmplitude: .008, envelope: 1.5, headSteady: .5,
    lobes: { upper: .22, lower: .22, upperAngle: 0, lowerAngle: 0, lag: 1.2 },
    dorsal: 0, pectoral: { flap: .05, pitch: .04, turn: .3, climb: .2 }, roll: .02, bend: .9,
  },
  // A sea cow's unhurried stroke: slow, gentle beats of the broad fluked tail, the heavy body hardly
  // heaving, the paddle flippers steering and touching down on the seagrass as it grazes.
  dugong: {
    kind: 'cetacean', joints: [.24, .42, .58, .72, .84], frequency: .42, wavelength: 1.3,
    tailAmplitude: .075, rootAmplitude: .002, headAmplitude: .004, envelope: 2.6,
    fluke: .16, flukeLag: 1.1, flukeFlex: .08, pectoral: { flap: .07, turn: .5, climb: .3 }, heave: .004, bend: .75,
  },
  // A ray built like a shark: slow, sinuous sweeps of the big tail, the long saw held steady out in
  // front (swung only in turns), the broad pectorals trimming it close over the bottom.
  sawfish: {
    kind: 'shark', joints: [.36, .5, .62, .72, .8], dorsalParent: 'Spine2', dorsalAt: .5,
    frequency: .42, wavelength: 1, tailAmplitude: .095, rootAmplitude: .003, headAmplitude: .003, envelope: 2.2, headSteady: .4,
    lobes: { upper: .12, lower: .08, upperAngle: .7, lowerAngle: .9, lag: 1 },
    dorsal: .03, pectoral: { flap: .045, pitch: .03, turn: .5, climb: .3 }, roll: .012, bend: .8,
  },
  // A stocky requiem shark of the shallows: easy, steady beats, the two near-equal dorsal fins
  // riding level, cruising slowly over the flats and among the roots.
  'lemon-shark': {
    kind: 'shark', joints: [.28, .44, .58, .69, .79], dorsalParent: 'Spine1', dorsalAt: .44,
    frequency: .5, wavelength: 1.05, tailAmplitude: .095, rootAmplitude: .003, headAmplitude: .005, envelope: 2.4,
    lobes: { upper: .12, lower: .06, upperAngle: .7, lowerAngle: .9, lag: 1 },
    dorsal: .035, pectoral: { flap: .03, pitch: .03, turn: .55, climb: .28 }, roll: .02, bend: .8,
  },
  // Undulates rather than flaps: low ripples running back along the disc's margins, the long whip of
  // a tail trailing; it glides low over the sand.
  'southern-stingray': {
    kind: 'manta', frequency: .7,
    flap: [.02, .04, .065, .09, .115], waveLag: .75,
    twist: [.05, .1, .15, .2, .25], glideDihedral: [0, .005, .01, .015, .02],
    turnAsymmetry: .4, climbGain: .4, bob: .005, pitch: .015, cephalic: 0, tail: [.05, .09, .14],
  },
  // The silver king: a big, stiff-bodied herring cousin cruising with slow beats of its deeply forked
  // tail, often hanging almost still in the shade of the roots.
  tarpon: {
    kind: 'shark', joints: [.3, .45, .58, .7, .8], dorsalParent: 'Spine2', dorsalAt: .48,
    frequency: .8, wavelength: 1.1, tailAmplitude: .09, rootAmplitude: .003, headAmplitude: .005, envelope: 2.5,
    lobes: { upper: .08, lower: .08, upperAngle: .9, lowerAngle: .9, lag: .9 },
    dorsal: .06, pectoral: { flap: .05, pitch: .04, turn: .45, climb: .25 }, roll: .015, bend: .75, hover: .3,
  },
  'giant-moray': {
    kind: 'moray', joints: [.13, .25, .37, .49, .6, .71, .81, .9],
    frequency: .85, wavelength: .62, amplitude: .085, headAmplitude: .012, envelope: 1.1, bend: .9,
    drape: .9, sway: .012, look: .3, gape: .36, breathRate: .28, curve: .035,
  },
};

const BONES: Record<SwimRigSpec['kind'], readonly string[]> = {
  shark: SHARK_BONES, manta: MANTA_BONES, sunfish: SUNFISH_BONES, turtle: TURTLE_BONES, cetacean: DOLPHIN_BONES,
  octopus: OCTOPUS_BONES, cuttlefish: CUTTLEFISH_BONES, moray: MORAY_BONES, pinniped: PINNIPED_BONES, jelly: JELLY_BONES,
};
export function rigBones(model: SwimRigModel): readonly string[] {
  return BONES[SWIM_RIGS[model].kind];
}
/** Bones a rig also scales (the mantles that breathe and squeeze), besides rotating them. */
export function scaledBones(model: SwimRigModel): readonly string[] {
  const spec = SWIM_RIGS[model];
  if (spec.kind === 'shark' && spec.sail) return ['Dorsal'];
  if (spec.kind === 'jelly') return ['Bell', 'Rim'];
  return spec.kind === 'octopus' || spec.kind === 'cuttlefish' ? ['Mantle'] : [];
}

export type SwimDrive = {
  /** Current speed relative to the species' cruising speed (1 = cruising). */
  effort: number;
  /** Heading change in rad/s; positive turns toward the animal's left (+X). */
  turn: number;
  /** Path curvature in 1/body lengths, positive toward the left. */
  curvature: number;
  /** Climb from -1 (descending) to 1 (climbing). */
  climb: number;
  /** 0 to 1: how far the body is out of the water, as in a dolphin's leap; the stroke stills (0 unless set). */
  air?: number;
  /** Reef animals (0 to 1): settled and resting (the moray in its den), jetting, and on the seabed rather than swimming (1 unless set). */
  rest?: number; jet?: number; ground?: number;
  /** A sailfish's sail, 0 (folded into its groove) to 1 (fully raised); its rig's cruising setting unless set. */
  sail?: number;
};
export const CRUISE: SwimDrive = { effort: 1, turn: 0, curvature: 0, climb: 0 };

const TAU = Math.PI * 2;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
/** Deterministic 0..1 value per integer, so every turtle's bouts vary without randomness. */
const variation = (n: number) => { const v = Math.sin(n * 12.9898 + 78.233) * 43758.5453; return v - Math.floor(v); };
const ease = (current: number, target: number, rate: number, dt: number) => current + (target - current) * (1 - Math.exp(-rate * dt));

/** Tail beats and wing strokes slow down and shorten with speed, but never stop. */
export function strokeFrequency(spec: SwimRigSpec, effort: number) {
  return spec.frequency * (.5 + .5 * clamp(effort, .25, 1.6));
}

/**
 * One swimmer's rig state. `rotation` holds Z·X·Y Euler angles (x, y, z per
 * bone, in `bones` order); `offset` is the root bone's translation from rest.
 */
export function createSwimRig(model: SwimRigModel, phase = 0) {
  const spec = SWIM_RIGS[model];
  const bones = rigBones(model);
  const rotation = new Float32Array(bones.length * 3);
  const offset = { x: 0, y: 0, z: 0 };
  const scaled = scaledBones(model).map((bone) => bones.indexOf(bone));
  const scale = new Float32Array(bones.length * 3).fill(1);
  const state: RigState = {
    phase: ((phase % TAU) + TAU) % TAU, effort: 1, turn: 0, curvature: 0, climb: 0, air: 0,
    // Turtles only: how actively the flippers stroke (0 = gliding), strokes left in this bout, glide time left.
    activity: 1, strokes: 0, glide: 0, bouts: Math.floor(phase * 7),
    // Reef animals only: resting, jetting, on the seabed, and their breathing's own phase.
    rest: 0, jet: 0, ground: 1, breath: ((phase * 1.7) % TAU + TAU) % TAU,
    // Sailfish only: how far the sail stands.
    sail: spec.kind === 'shark' && spec.sail ? spec.sail.cruise : 1,
  };
  if (spec.kind === 'turtle' || spec.kind === 'pinniped') state.strokes = spec.bout[0];
  const slot = Object.fromEntries(bones.map((bone, index) => [bone, index * 3])) as Record<string, number>;
  const set = (bone: string, x: number, y: number, z: number) => {
    const i = slot[bone];
    rotation[i] = x; rotation[i + 1] = y; rotation[i + 2] = z;
  };
  const setScale = (bone: string, x: number, y: number, z: number) => {
    const i = slot[bone];
    scale[i] = x; scale[i + 1] = y; scale[i + 2] = z;
  };
  const pose = () => {
    if (spec.kind === 'shark') poseShark(spec, state, set, offset, setScale);
    else if (spec.kind === 'manta') poseManta(spec, state, set, offset);
    else if (spec.kind === 'sunfish') poseSunfish(spec, state, set, offset);
    else if (spec.kind === 'cetacean') poseCetacean(spec, state, set, offset);
    else if (spec.kind === 'octopus') poseOctopus(spec, state, set, offset, setScale);
    else if (spec.kind === 'cuttlefish') poseCuttlefish(spec, state, set, offset, setScale);
    else if (spec.kind === 'moray') poseMoray(spec, state, set, offset);
    else if (spec.kind === 'pinniped') posePinniped(spec, state, set, offset);
    else if (spec.kind === 'jelly') poseJelly(spec, state, set, offset, setScale);
    else poseTurtle(spec, state, set, offset);
  };
  // A slow phase of its own: reef animals breathe on it, a sea lion looks about, a jellyfish turns.
  const breathRate = 'breathRate' in spec ? spec.breathRate : spec.kind === 'pinniped' ? spec.lookRate : spec.kind === 'jelly' ? spec.spin / TAU : 0;
  pose();
  return {
    model, spec, bones, rotation, offset,
    /** Per-bone scale (x, y, z per bone, in `bones` order); only the bones in `scaled` (indices) ever change from 1. */
    scale, scaled,
    get phase() { return state.phase; },
    /** Advance by `dt` seconds. Inputs are eased so sudden changes never snap the pose. */
    step(dt: number, drive: SwimDrive) {
      if (dt <= 0) return;
      state.effort = ease(state.effort, clamp(drive.effort, .25, 1.6), 1.6, dt);
      state.turn = ease(state.turn, clamp(drive.turn, -1.2, 1.2), 2.2, dt);
      state.curvature = ease(state.curvature, clamp(drive.curvature, -1.5, 1.5), 2.2, dt);
      state.climb = ease(state.climb, clamp(drive.climb, -1, 1), 1.4, dt);
      state.air = ease(state.air, clamp(drive.air ?? 0, 0, 1), 6, dt);
      // A jet comes on fast and fades as the glide slows; settling and getting up are gentle.
      const jet = clamp(drive.jet ?? 0, 0, 1);
      state.jet = ease(state.jet, jet, jet > state.jet ? 9 : 2.4, dt);
      state.rest = ease(state.rest, clamp(drive.rest ?? 0, 0, 1), 1.6, dt);
      state.ground = ease(state.ground, clamp(drive.ground ?? 1, 0, 1), 3, dt);
      // A sail folds quickly for a burst and rises more slowly.
      if (spec.kind === 'shark' && spec.sail) {
        const sail = clamp(drive.sail ?? spec.sail.cruise, 0, 1);
        state.sail = ease(state.sail, sail, sail < state.sail ? 3.5 : 1.8, dt);
      }
      state.breath = (state.breath + TAU * breathRate * dt) % TAU;
      if (spec.kind === 'turtle' || spec.kind === 'pinniped') stepBouts(spec, state, dt);
      else state.phase = (state.phase + TAU * strokeFrequency(spec, state.effort) * dt) % TAU;
      pose();
    },
    /** Pose at an exact cycle phase with steady inputs; used to bake seamless loops. */
    sample(at: number, drive: SwimDrive = CRUISE) {
      state.phase = ((at % TAU) + TAU) % TAU;
      state.effort = clamp(drive.effort, .25, 1.6);
      state.turn = drive.turn; state.curvature = drive.curvature; state.climb = drive.climb; state.air = drive.air ?? 0;
      state.rest = drive.rest ?? 0; state.jet = drive.jet ?? 0; state.ground = drive.ground ?? 1;
      if (spec.kind === 'shark' && spec.sail) state.sail = clamp(drive.sail ?? spec.sail.cruise, 0, 1);
      // One breath per stroke while baking, so the loop stays seamless (and no turning for a jellyfish).
      state.breath = spec.kind === 'jelly' ? 0 : state.phase;
      state.activity = 1;
      pose();
    },
  };
}
export type SwimRig = ReturnType<typeof createSwimRig>;

type RigState = {
  phase: number; effort: number; turn: number; curvature: number; climb: number; air: number;
  activity: number; strokes: number; glide: number; bouts: number;
  rest: number; jet: number; ground: number; breath: number;
  sail: number;
};
type SetBone = (bone: string, x: number, y: number, z: number) => void;

/**
 * Z·X·Y Euler angles for a bone whose segment points `theta` (rad from +Z toward +X) in its parent's
 * frame: swung `beta` sideways about the vertical and tipped `alpha` down about the horizontal axis
 * across it (R = Ry(theta + beta)·Rx(alpha)·Ry(-theta)), in closed form so arms bend about their own
 * axes, whichever way they point.
 */
function armRotation(set: SetBone, bone: string, theta: number, beta: number, alpha: number) {
  const c1 = Math.cos(theta + beta), s1 = Math.sin(theta + beta), c2 = Math.cos(theta), s2 = -Math.sin(theta);
  const ca = Math.cos(alpha), sa = Math.sin(alpha);
  set(bone, Math.asin(clamp(c1 * sa, -1, 1)), Math.atan2(s1 * c2 + c1 * ca * s2, c1 * ca * c2 - s1 * s2), Math.atan2(-s1 * sa, ca));
}
/** Z·X·Y Euler angles for a roll of `alpha` about the horizontal hinge line along `psi` (rad from +Z toward +X): R = Ry(psi)·Rz(alpha)·Ry(-psi). */
function hingeRotation(set: SetBone, bone: string, psi: number, alpha: number) {
  const c = Math.cos(psi), s = Math.sin(psi), ca = Math.cos(alpha), sa = Math.sin(alpha);
  set(bone, Math.asin(clamp(s * sa, -1, 1)), Math.atan2(-s * c * (1 - ca), s * s * ca + c * c), Math.atan2(c * sa, ca));
}

/**
 * A traveling wave runs down the body midline; the amplitude envelope grows
 * toward the tail so the head stays steady. Each spine bone takes the change in
 * midline angle across its segment, so the caudal fin lags the peduncle the way
 * a real tail stroke does. Turning adds a C-shaped bend toward the inside.
 */
function poseShark(spec: SharkRig, s: RigState, set: SetBone, offset: { x: number; y: number; z: number }, setScale: SetBone) {
  const [root, spine2, rearBody, tailBase, tail] = spec.joints;
  const k = TAU / spec.wavelength;
  // A hovering fish all but stops its tail below half its cruising pace.
  const still = spec.hover === undefined ? 1 : 1 - (1 - spec.hover) * clamp((.65 - s.effort) / .35, 0, 1) ** 1.5;
  const strength = (.7 + .3 * s.effort) * still;
  const bend = .5 * spec.bend * s.curvature;
  const envelope = (x: number) => x >= root
    ? spec.rootAmplitude + (spec.tailAmplitude - spec.rootAmplitude) * ((x - root) / (1 - root)) ** spec.envelope
    : spec.rootAmplitude + (spec.headAmplitude - spec.rootAmplitude) * ((root - x) / root) ** 2;
  const sway = (x: number) => envelope(x) * strength * Math.sin(s.phase - k * (x - root));
  const lateral = (x: number) => sway(x) + bend * (x - root) ** 2;

  // The whole body sways slightly with the root; the head only yaws a little against it (less still
  // for a steady-headed species), but leads into turns.
  offset.x = lateral(root);
  offset.y = 0;
  offset.z = 0;
  set('Root', 0, 0, spec.roll * strength * Math.sin(s.phase - k * (.75 - root)));
  set('Head', 0, Math.atan2((spec.headSteady ?? 1) * (sway(0) - sway(root)) + bend * root * root, root), 0);
  const chain = [root, spine2, rearBody, tailBase, tail, 1];
  const names = ['Spine1', 'Spine2', 'RearBody', 'TailBase', 'Tail'];
  let previous = 0;
  for (let i = 0; i < names.length; i++) {
    const angle = -Math.atan2(lateral(chain[i + 1]) - lateral(chain[i]), chain[i + 1] - chain[i]);
    set(names[i], 0, angle - previous, 0);
    previous = angle;
  }

  // Lobes trail the stroke: positive flex swings a lobe tip toward the right (-X).
  const tailPhase = s.phase - k * (1 - root);
  const upper = spec.lobes.upper * strength * Math.cos(tailPhase - spec.lobes.lag);
  const lower = spec.lobes.lower * strength * Math.cos(tailPhase - spec.lobes.lag);
  set('TailUpper', 0, upper * Math.cos(spec.lobes.upperAngle), upper * Math.sin(spec.lobes.upperAngle));
  set('TailLower', 0, lower * Math.cos(spec.lobes.lowerAngle), -lower * Math.sin(spec.lobes.lowerAngle));
  set('Dorsal', 0, 0, spec.dorsal * strength * Math.cos(s.phase - k * (spec.dorsalAt - root) - .6));
  // A sail folds down onto the back: its height shrinks toward the fold (its length stays).
  if (spec.sail) setScale('Dorsal', 1, spec.sail.folded + (1 - spec.sail.folded) * s.sail, 1);

  // Pectorals: a slight rhythmic trim, the inside fin dips in a turn, both pitch up to climb. A
  // hovering fish sculls them harder to hold its place.
  const trim = spec.pectoral.flap * (1 + 1.5 * (1 - still)) * Math.sin(s.phase + 1.3);
  const lift = spec.pectoral.pitch * Math.sin(s.phase + 2.2) - spec.pectoral.climb * s.climb;
  const turn = spec.pectoral.turn * s.turn;
  // Rowing: each fin sweeps back broadside and returns feathered, the right half a stroke behind the
  // left (mirrored, so the same yaw on both fins puts them in opposite phases).
  const row = (spec.pectoral.row ?? 0) * (1 + .6 * (1 - still));
  const sweep = row * Math.sin(s.phase + .4);
  const feather = .45 * row * Math.cos(s.phase + .4);
  set('PectoralL', lift + feather, sweep, trim - Math.max(0, turn) + .4 * Math.max(0, -turn));
  set('PectoralR', lift - feather, sweep, -(trim - Math.max(0, -turn) + .4 * Math.max(0, turn)));
}

/**
 * The dolphin's stroke is the shark's turned on its side: a traveling wave runs down the body in
 * the vertical plane, growing toward the flukes, so each spine bone pitches (rotation about X)
 * instead of yawing and the flukes heave up and down. The flukes also angle into each beat
 * (trailing the stroke) and their tips flex. The head and front body stay steady; turns add a
 * sideways C-bend, as a dolphin flexes into a turn.
 */
function poseCetacean(spec: CetaceanRig, s: RigState, set: SetBone, offset: { x: number; y: number; z: number }) {
  const [root, spine2, rearBody, tailBase, tail] = spec.joints;
  const k = TAU / spec.wavelength;
  // In the air the stroke all but stops and the body stretches out straight.
  const strength = (.7 + .3 * s.effort) * (1 + .15 * s.climb) * (1 - .9 * s.air);
  const bend = .5 * spec.bend * s.curvature;
  const envelope = (x: number) => x >= root
    ? spec.rootAmplitude + (spec.tailAmplitude - spec.rootAmplitude) * ((x - root) / (1 - root)) ** spec.envelope
    : spec.rootAmplitude + (spec.headAmplitude - spec.rootAmplitude) * ((root - x) / root) ** 2;
  const vertical = (x: number) => envelope(x) * strength * Math.sin(s.phase - k * (x - root));
  const lateral = (x: number) => bend * (x - root) ** 2;

  // The body rides a little against the flukes; the head pitches slightly against the root, and leads turns.
  offset.x = 0;
  offset.y = vertical(root) - spec.heave * strength * Math.sin(s.phase - k * (1 - root));
  offset.z = 0;
  set('Root', 0, 0, 0);
  set('Head', -Math.atan2(vertical(0) - vertical(root), root), Math.atan2(lateral(0) - lateral(root), root), 0);
  // Positive pitch raises the bones behind a joint (the tail runs along -Z); positive yaw swings them toward -X.
  const chain = [root, spine2, rearBody, tailBase, tail, 1];
  const names = ['Spine1', 'Spine2', 'RearBody', 'TailBase', 'Tail'];
  let pitched = 0, yawed = 0;
  for (let i = 0; i < names.length; i++) {
    const length = chain[i + 1] - chain[i];
    const pitch = Math.atan2(vertical(chain[i + 1]) - vertical(chain[i]), length);
    const yaw = -Math.atan2(lateral(chain[i + 1]) - lateral(chain[i]), length);
    // The flukes add their own angle, trailing the stroke.
    const extra = names[i] === 'Tail' ? spec.fluke * strength * Math.cos(s.phase - k * (1 - root) - spec.flukeLag) : 0;
    set(names[i], pitch - pitched + extra, yaw - yawed, 0);
    pitched = pitch; yawed = yaw;
  }
  // Fluke tips: a roll about the body axis raises the left tip for positive values and lowers the right.
  const flex = spec.flukeFlex * strength * Math.cos(s.phase - k * (1 - root) - spec.flukeLag - .7);
  set('FlukeL', 0, 0, flex);
  set('FlukeR', 0, 0, -flex);

  // Flippers: a slight trim with each beat, the inside one dips into a turn, both pitch up to climb.
  const trim = spec.pectoral.flap * Math.sin(s.phase + 1.1);
  const lift = -spec.pectoral.climb * s.climb;
  const turn = spec.pectoral.turn * s.turn;
  // In the air they fold in against the flanks.
  const tuck = .35 * s.air;
  set('PectoralL', lift * (1 - s.air), 0, trim + tuck - Math.max(0, turn) + .4 * Math.max(0, -turn));
  set('PectoralR', lift * (1 - s.air), 0, -(trim + tuck - Math.max(0, -turn) + .4 * Math.max(0, turn)));
}

/**
 * Wing segments flap about axes parallel to the body with a growing phase delay,
 * so each stroke rolls outward from the shoulder to the tip. Twist lags the flap
 * by a quarter cycle, lifting the trailing edge after the leading edge. The body
 * rides up on each downstroke; the outer wing strokes harder through turns.
 */
function poseManta(spec: MantaRig, s: RigState, set: SetBone, offset: { x: number; y: number; z: number }) {
  const effort = clamp(s.effort, .25, 1.6);
  // Below cruising effort the manta increasingly glides, holding its wings in a shallow V.
  const glide = clamp((1 - effort) / .5, 0, 1);
  const stroke = (.35 + .65 * effort) * (1 + spec.climbGain * s.climb) * (1 - .45 * glide);
  const asymmetry = clamp(spec.turnAsymmetry * s.turn, -.45, .45);
  const left = stroke * (1 - asymmetry), right = stroke * (1 + asymmetry);
  for (let i = 0; i < spec.flap.length; i++) {
    const wave = s.phase - i * spec.waveLag;
    const hold = spec.glideDihedral[i] * glide;
    const twist = -spec.twist[i] * stroke * Math.cos(wave);
    set(`WingL${i + 1}`, twist, 0, spec.flap[i] * left * Math.sin(wave) + hold);
    set(`WingR${i + 1}`, twist, 0, -(spec.flap[i] * right * Math.sin(wave) + hold));
  }
  offset.x = 0;
  offset.y = -spec.bob * stroke * Math.sin(s.phase - .5);
  offset.z = 0;
  set('Root', spec.pitch * stroke * Math.cos(s.phase - .5), 0, 0);
  set('Head', -.5 * spec.pitch * stroke * Math.cos(s.phase - .9), 0, 0);
  const curl = spec.cephalic * (.6 + .4 * Math.sin(s.phase - 1.2));
  set('CephalicL', .3 * curl, 0, curl);
  set('CephalicR', .3 * curl, 0, -curl);
  for (let i = 0; i < spec.tail.length; i++) {
    set(`Tail${i + 1}`, spec.tail[i] * stroke * Math.sin(s.phase - 1.6 - .75 * i), -.12 * s.turn * (i + 1), 0);
  }
}

/**
 * The dorsal and anal fins beat together from side to side (both tips swing to the same side),
 * so their sideways forces add while their rolling forces cancel: the stiff disc only sways a
 * little against each beat. The tips lag their bases, curling each fin through the stroke.
 */
function poseSunfish(spec: SunfishRig, s: RigState, set: SetBone, offset: { x: number; y: number; z: number }) {
  const strength = .65 + .35 * clamp(s.effort, .25, 1.6);
  const beat = (lag: number) => Math.sin(s.phase - lag);
  // The dorsal fin points up: a positive roll about the body axis swings its tip toward -X.
  // The anal fin points down, so the opposite sign swings its tip to the same side.
  set('Dorsal1', 0, 0, spec.sweep * strength * beat(0));
  set('Dorsal2', 0, 0, spec.flex * strength * beat(spec.tipLag));
  set('Anal1', 0, 0, -spec.sweep * strength * beat(spec.analLag));
  set('Anal2', 0, 0, -spec.flex * strength * beat(spec.analLag + spec.tipLag));
  set('Root', -.06 * s.climb, spec.bodyYaw * strength * beat(.9), spec.bodyRoll * strength * beat(.4));
  offset.x = .006 * strength * beat(1.3);
  offset.y = 0;
  offset.z = 0;
  // The clavus ripples down its length and deflects like a rudder into turns.
  const rudder = clamp(spec.rudder * s.turn, -.45, .45);
  for (let i = 0; i < 3; i++) set(`Clavus${i + 1}`, 0, spec.clavus * strength * beat(1.1 + .5 * i) + rudder, 0);
  const flutter = spec.pectoral * Math.sin(2 * s.phase + .7);
  set('PectoralL', 0, flutter, 0);
  set('PectoralR', 0, -flutter, 0);
}

/**
 * Bouts of strokes, then glides (turtles and sea lions). A stroke cycle starts and ends with the
 * flippers swept back (phase 0), so a bout can end at any cycle boundary and ease straight into the
 * glide pose.
 */
function stepBouts(spec: TurtleRig | PinnipedRig, s: RigState, dt: number) {
  if (s.glide > 0) {
    s.glide = Math.max(0, s.glide - dt);
    s.activity = ease(s.activity, 0, 1.4, dt);
    if (s.glide === 0) {
      s.bouts++;
      s.strokes = spec.bout[0] + Math.round(variation(s.bouts) * (spec.bout[1] - spec.bout[0]));
    }
    return;
  }
  s.activity = ease(s.activity, 1, 2.6, dt);
  const next = s.phase + TAU * strokeFrequency(spec, s.effort) * dt;
  if (next < TAU) { s.phase = next; return; }
  s.strokes--;
  if (s.strokes > 0) { s.phase = next - TAU; return; }
  // Faster swimming shortens the glides; gliding never lasts less than a second.
  s.phase = 0;
  const [short, long] = spec.glide;
  s.glide = Math.max(1, (short + (long - short) * variation(s.bouts + .5)) / clamp(s.effort, .6, 1.6));
}

/**
 * Front flippers trace an elongated loop: up and forward on the recovery, then down and back on
 * the power stroke, feathered edge-on while recovering. While gliding they hold swept back along
 * the shell. The outer flipper works harder through turns; the rear flippers steer.
 */
function poseTurtle(spec: TurtleRig, s: RigState, set: SetBone, offset: { x: number; y: number; z: number }) {
  const a = s.activity;
  const strength = (.75 + .25 * clamp(s.effort, .25, 1.6)) * (1 + .25 * s.climb);
  const asymmetry = clamp(.45 * s.turn, -.35, .35);
  for (const [side, mirror, lag, power] of [['L', 1, 0, 1 - asymmetry], ['R', -1, spec.offset, 1 + asymmetry]] as const) {
    const p = s.phase - lag;
    const stroke = strength * power;
    // Stroke pose blended with the glide pose. Mirrored axes keep both flippers moving the same way.
    const flap = (spec.flap * stroke * Math.sin(p)) * a - spec.glideDroop * (1 - a);
    const sweep = (spec.sweep * stroke * -Math.cos(p)) * a - spec.glideSweep * (1 - a);
    // Leading edge up while recovering (edge-on), angled down to push on the power stroke.
    const feather = -spec.feather * stroke * Math.sin(p) * a;
    set(`Front${side}1`, feather, -mirror * sweep, mirror * flap);
    set(`Front${side}2`, .5 * feather, 0, mirror * spec.elbow * stroke * Math.sin(p - .8) * a);
  }
  set('Root', spec.pitch * a * Math.sin(s.phase + .6) - .05 * s.climb, 0, 0);
  offset.x = 0;
  offset.y = spec.bob * a * Math.sin(s.phase + .3);
  offset.z = 0;
  set('Head', -spec.head * a * Math.sin(s.phase + 1.2), .25 * clamp(s.turn, -1, 1), 0);
  const steer = clamp(spec.rudder * s.turn, -.5, .5);
  const paddle = spec.paddle * a * Math.sin(s.phase + 2);
  set('RearL', 0, steer + paddle, 0);
  set('RearR', 0, steer - paddle, 0);
  set('Tail', 0, .6 * steer, 0);
}

/**
 * Sea lions fly with their long fore flippers: a bout of strokes, raised and forward on the
 * recovery, then down and back on the power stroke until they press along the flanks, and a glide
 * with them held there. The body heaves a little with each stroke and the hind flippers trail
 * together; turns bend the whole supple body, the head on its long neck leading and, gliding,
 * looking about.
 */
function posePinniped(spec: PinnipedRig, s: RigState, set: SetBone, offset: { x: number; y: number; z: number }) {
  if (spec.stroke === 'hind' || spec.stroke === 'otter') { poseHindSwimmer(spec, s, set, offset); return; }
  const a = s.activity;
  const strength = (.75 + .25 * clamp(s.effort, .25, 1.6)) * (1 + .2 * s.climb);
  const asymmetry = clamp(.4 * s.turn, -.35, .35);
  for (const [side, mirror, power] of [['L', 1, 1 - asymmetry], ['R', -1, 1 + asymmetry]] as const) {
    const stroke = strength * power;
    // Stroke pose blended with the glide pose; mirrored axes keep both flippers moving the same way.
    const flap = spec.flap * stroke * Math.sin(s.phase) * a - spec.glideDroop * (1 - a);
    const sweep = spec.sweep * stroke * -Math.cos(s.phase) * a - spec.glideSweep * (1 - a);
    // Edge-on while recovering, angled to push on the power stroke.
    const feather = -spec.feather * stroke * Math.sin(s.phase) * a;
    set(`Fore${side}1`, feather, -mirror * sweep, mirror * flap);
    set(`Fore${side}2`, .5 * feather, mirror * .3 * spec.glideSweep * (1 - a), mirror * spec.wrist * stroke * Math.sin(s.phase - .8) * a);
  }
  offset.x = 0;
  offset.y = spec.bob * a * Math.sin(s.phase + .3);
  offset.z = 0;
  set('Root', spec.pitch * a * Math.sin(s.phase + .6) - .06 * s.climb, 0, 0);
  // The whole body curves into a turn (a left turn swings the rear toward +X, as the sharks' does),
  // and a gentle wave runs down the spine with each stroke.
  const bend = spec.bend * clamp(s.curvature, -1.5, 1.5);
  const chain = ['Spine1', 'Spine2', 'RearBody', 'TailBase', 'Tail'];
  chain.forEach((bone, i) => set(bone, spec.wave * a * Math.sin(s.phase - .9 - .7 * i) * (i + 1) / chain.length, -.25 * bend, 0));
  set('Head', -spec.head * a * Math.sin(s.phase + 1.2), spec.lead * clamp(s.turn, -1.2, 1.2) + spec.look * (1 - a) * Math.sin(s.breath), 0);
  // The hind flippers carry on the body's curve, and part a little as each stroke drives.
  const steer = -clamp(spec.rudder * s.turn, -.5, .5);
  const part = spec.splay * a * (.5 + .5 * Math.sin(s.phase - .5));
  set('HindL', 0, steer - part, 0);
  set('HindR', 0, steer + part, 0);
}

/**
 * Seals and sea otters swim with their back ends. A harbor seal's stroke is a side-to-side sweep
 * growing down its rear body to the hind flippers, which beat alternately (the one sweeping forward
 * folds narrow, the one driving back spreads), its fore flippers held against the flanks and
 * steering. A sea otter's is an up-and-down wave down its body to its big webbed hind feet. Both
 * glide between bouts. At rest an otter floats on its back (the motion rolls it over): body arched
 * with head and feet up out of the water, forepaws on its chest, its tail sculling slowly.
 */
function poseHindSwimmer(spec: PinnipedRig, s: RigState, set: SetBone, offset: { x: number; y: number; z: number }) {
  const otter = spec.stroke === 'otter';
  const rest = otter ? s.rest : 0, a = s.activity * (1 - rest);
  const strength = (.75 + .25 * clamp(s.effort, .25, 1.6)) * (1 + .15 * s.climb);
  const bend = spec.bend * clamp(s.curvature, -1.5, 1.5);
  const chain = ['Spine1', 'Spine2', 'RearBody', 'TailBase', 'Tail'];
  chain.forEach((bone, i) => {
    const grow = (i + 1) / chain.length, wave = Math.sin(s.phase - .8 * i) * grow * grow;
    // A seal sweeps sideways (about the vertical), an otter undulates (about the body's lateral axis).
    const sweep = otter ? 0 : spec.wave * strength * a * wave, undulate = otter ? spec.wave * strength * a * wave : 0;
    // Floating on its back, the otter curls toward its belly (skyward), head and tail end up out of the water.
    const arch = -rest * [.05, .06, .05, .12, .15][i];
    set(bone, undulate + arch, sweep - .25 * bend, 0);
  });
  offset.x = 0;
  offset.y = spec.bob * a * Math.sin(s.phase + .3);
  offset.z = 0;
  set('Root', spec.pitch * a * Math.sin(s.phase + .6) - .06 * s.climb, 0, 0);
  // The head steadies against the stroke, leads into turns and looks about while gliding; floating, it lifts.
  set('Head', -spec.head * a * Math.sin(s.phase + 1.2) + .4 * rest, spec.lead * clamp(s.turn, -1.2, 1.2) + spec.look * (1 - a) * Math.sin(s.breath), 0);
  // Fore flippers (forepaws) tucked along the flanks, steering a little; floating, paws on the chest.
  const steer = clamp(spec.rudder * s.turn, -.5, .5);
  for (const [side, mirror] of [['L', 1], ['R', -1]] as const) {
    set(`Fore${side}1`, -.5 * rest, -mirror * (spec.glideSweep * (1 - rest) - .3 * steer * mirror), -mirror * (spec.glideDroop * (1 - rest) + 1.1 * rest));
    set(`Fore${side}2`, -.3 * rest, 0, -mirror * .6 * rest);
  }
  // Hind flippers: a seal's beat alternately sideways, spreading on the drive; an otter's paddle up
  // and down together with the wave; floating, the otter's feet rise and its tail sculls.
  const beat = Math.sin(s.phase - 4 * .8 - .6) * strength * a;
  if (otter) {
    const scull = .25 * rest * Math.sin(s.breath * 3);
    set('HindL', spec.flap * beat - .5 * rest, -spec.splay * a + scull, 0);
    set('HindR', spec.flap * beat - .5 * rest, spec.splay * a + scull, 0);
  } else {
    const spread = spec.splay * (.5 + .5 * Math.sin(s.phase - 3.4));
    set('HindL', 0, spec.flap * beat - spread * a - .4 * bend, 0);
    set('HindR', 0, spec.flap * beat + spread * a - .4 * bend, 0);
  }
}

/**
 * A jellyfish rows with its bell: a quick contraction (the bell narrows and deepens, its rim most)
 * and a slower relaxation, rising a little with each. The oral arms swing in and out behind the
 * pulse, the lag growing down each arm, and trail behind its drift; the bell tilts into the drift
 * (and into a turn) and turns slowly about its axis.
 */
function poseJelly(spec: JellyRig, s: RigState, set: SetBone, offset: { x: number; y: number; z: number }, setScale: SetScale) {
  const strength = .6 + .4 * clamp(s.effort, .25, 1.6);
  const pulse = (phase: number) => {
    const t = (((phase % TAU) + TAU) % TAU) / TAU, c = spec.contract;
    return t < c ? Math.sin(.5 * Math.PI * t / c) : .5 + .5 * Math.cos(Math.PI * (t - c) / (1 - c));
  };
  const k = pulse(s.phase) * strength;
  setScale('Bell', 1 - .5 * spec.squeeze * k, 1 + .5 * spec.stretch * k, 1 - .5 * spec.squeeze * k);
  setScale('Rim', 1 - spec.squeeze * k, 1 + spec.stretch * k, 1 - spec.squeeze * k);
  offset.x = 0;
  offset.y = spec.bob * (pulse(s.phase - 1.2) - .5) * strength;
  offset.z = 0;
  // Tilted into its drift, and sideways into a turn (a left turn tips the top toward +X).
  const drift = clamp(s.effort, 0, 1.6), spin = s.breath;
  set('Root', spec.tilt * drift, spin, -.6 * spec.tilt * clamp(s.turn, -1, 1));
  // The arms hang in the bell's turning frame, so trailing (tips toward -Z in the world) is a swing
  // about an axis that turns with it.
  const trail = spec.trail * drift;
  for (let i = 0; i < JELLY_ARMS; i++) {
    const phi = jellyArmAngle(i), c = Math.cos(phi), sn = Math.sin(phi);
    for (const [segment, lag, gain, share] of [['A', spec.lag, 1, 1], ['B', 2 * spec.lag, 1.3, .5]] as const) {
      // Out (positive) as the bell relaxes, in as it squeezes; a little sideways sway of their own.
      const swing = spec.sway * gain * (.5 - pulse(s.phase - lag)) * strength;
      const sway = .35 * spec.sway * gain * Math.sin(s.phase - lag + 1.3 * i);
      set(`Arm${i + 1}${segment}`, -swing * c + sway * sn + share * trail * Math.cos(spin), 0, swing * sn + sway * c + share * trail * Math.sin(spin));
    }
  }
}

/**
 * The octopus walks on its arms. Each arm reaches forward and pulls back in its own rhythm (its own
 * phase and vigor, front arms reaching farthest), its tip pressing to the floor and lifting on the
 * way back, while a slow sideways wave runs out along it. Resting, the arms coil to one side and the
 * body settles; the mantle breathes. A jet sweeps the arms back together behind the squeezed mantle,
 * which lowers into the line of travel (the octopus jets mantle-first, toward -Z).
 */
type SetScale = (bone: string, x: number, y: number, z: number) => void;
function poseOctopus(spec: OctopusRig, s: RigState, set: SetBone, offset: { x: number; y: number; z: number }, setScale: SetScale) {
  const jet = s.jet, rest = s.rest * (1 - jet), ground = s.ground;
  const pace = clamp(s.effort, 0, 1.3);
  // How much it is walking: on the floor, not resting or jetting, and moving.
  const crawl = ground * (1 - rest) * (1 - jet) * clamp(pace, 0, 1);
  // Swimming off the floor (gliding after a jet), the arms hang back loosely rather than reaching.
  const loose = (1 - ground) * (1 - jet);
  const calm = 1 - .55 * rest;
  // Turning, the arms lag behind the body's turn, swirling the other way, the tips most.
  const swirl = -clamp(s.turn, -1.2, 1.2) * spec.swirl;
  for (let i = 0; i < OCTOPUS_ARMS.length; i++) {
    const { name, angle } = OCTOPUS_ARMS[i];
    const side = angle > 0 ? 1 : -1, v = spec.vigor[i], ph = s.phase + spec.phases[i];
    const front = .5 + .5 * Math.cos(angle);
    // Reaching forward swings an arm toward straight ahead (smaller |angle|).
    const reach = -side * spec.reach * crawl * v * (.35 + .65 * front) * Math.sin(ph);
    const press = spec.press * crawl * v * Math.cos(ph);
    // Jetting, the base swings the arm round toward +Z (behind the mantle-first travel), bunched together.
    const tuck = -angle * spec.trail * jet;
    // Hanging back while it glides: a softer version of the same.
    const drift = -angle * .45 * loose;
    for (let k = 0; k < OCTOPUS_SEGMENTS; k++) {
      const t = (k + 1) / OCTOPUS_SEGMENTS;
      // A slow curl wave runs out along the arm, mirrored left to right, in step with the reach at its base.
      let beta = -side * spec.curl * calm * v * (.35 + .65 * t) * Math.sin(ph - k * spec.curlLag) * (1 - .75 * jet);
      // At rest the arms coil to one side, the tips most (a loose pinwheel), varying arm to arm.
      beta += side * spec.coil * rest * t * t * (.7 + .3 * v);
      // Tips press down on the stance and lift on the recovery; resting they curl up a little; jetting they stream straight.
      let alpha = k ? press * (.5 + .6 * t) * (1 - jet) : 0;
      alpha -= rest * (k === OCTOPUS_SEGMENTS - 1 ? .28 : 0) + loose * .06 * t;
      beta += swirl * (.5 + .5 * t);
      if (k === 0) beta = beta + reach + tuck + drift;
      armRotation(set, octopusArmBone(name, k + 1), angle, beta, alpha);
    }
  }
  const breathe = spec.breath * Math.sin(s.breath), squeeze = 1 - spec.squeeze * jet;
  setScale('Mantle', (1 + breathe) * squeeze, (1 + breathe) * squeeze, 1 + .4 * breathe);
  // The mantle rides up and down as it walks, settles low at rest, and lowers into the line of a jet.
  set('Mantle', spec.mantle * crawl * Math.sin(2 * s.phase + .8) - .22 * rest - spec.streamline * jet, 0, 0);
  set('Root', 0, 0, 0);
  offset.x = 0;
  offset.y = spec.bob * crawl * Math.sin(2 * s.phase) - spec.settle * rest;
  offset.z = 0;
}

/**
 * A cuttlefish has no tail: the fin skirt along each side of its mantle carries a wave that ripples
 * from front to back, gentler while it hovers, the outer fin working harder in a turn. The body stays
 * level. The arms sway, the upper pair held up while it hovers; speeding up or jetting closes them
 * together. A jet squeezes the mantle and folds the fins down against it; the mantle breathes.
 */
function poseCuttlefish(spec: CuttlefishRig, s: RigState, set: SetBone, offset: { x: number; y: number; z: number }, setScale: SetScale) {
  const moving = clamp(s.effort, 0, 1.4), jet = s.jet, hovering = 1 - clamp(moving, 0, 1);
  const amplitude = (spec.hover + (spec.amplitude - spec.hover) * clamp(moving, 0, 1)) * (1 - .85 * jet);
  const asymmetry = clamp(spec.turnAsymmetry * s.turn, -.5, .5);
  const n = CUTTLEFISH_FINS.length;
  for (let i = 0; i < n; i++) {
    const { yaw } = CUTTLEFISH_FINS[i];
    // The wave fades toward the ends of the skirt, which is narrower there.
    const envelope = Math.sin(Math.PI * (i + .6) / (n + .2)) ** .6;
    const wave = Math.sin(s.phase - i * spec.waveLag), fold = spec.fold * jet;
    // Positive roll raises the left fin's margin; the right fin mirrors.
    hingeRotation(set, `FinL${i + 1}`, yaw, amplitude * envelope * (1 - asymmetry) * wave - fold);
    hingeRotation(set, `FinR${i + 1}`, -yaw, -(amplitude * envelope * (1 + asymmetry) * wave - fold));
  }
  const breathe = spec.breath * Math.sin(s.breath), squeeze = 1 - spec.squeeze * jet;
  setScale('Mantle', (1 + breathe) * squeeze, (1 + .7 * breathe) * squeeze, 1);
  set('Mantle', 0, 0, 0);
  set('Root', -spec.pitch * s.climb, 0, 0);
  // Hovering, it looks about a little; turning, its head and arms lead into the turn.
  const lead = clamp(s.turn, -1, 1) * .15;
  set('Head', .05 * hovering * Math.sin(s.breath + .9), .09 * hovering * Math.sin(s.breath) + lead, 0);
  const together = clamp(jet + .6 * clamp(moving - .7, 0, 1), 0, 1) * spec.trail;
  const arms: [string, number, boolean, number][] = [['ArmLU', 1, true, 0], ['ArmRU', -1, true, 1.7], ['ArmLD', 1, false, 3.1], ['ArmRD', -1, false, 4.6]];
  for (const [name, side, upper, lag] of arms) {
    const sway = spec.sway * (1 - together) * Math.sin(s.phase + lag);
    // Positive pitch lowers an arm's tip; positive yaw swings it toward +X.
    const raise = upper ? -spec.raise * hovering * (1 - together) : .04 * (1 - together);
    set(`${name}1`, raise + (upper ? .5 : -.5) * .08 * together, side * .09 * (1 - together) + sway + lead, 0);
    set(`${name}2`, (upper ? -.12 : .1) * hovering * (1 - together), .8 * sway, 0);
  }
  offset.x = 0;
  offset.y = spec.bob * Math.sin(2 * s.phase + .4) * (1 - jet);
  offset.z = 0;
}

/**
 * Swimming, a moray waves its whole body: a traveling wave from head to tail, growing toward the tail
 * (anguilliform, unlike a shark's stiff front). Resting in its den it lies in a lazy curve that sways
 * slowly, its head looking about, its mouth opening and closing as it breathes (respiration, not a
 * threat). Turns bend the body into the turn.
 */
function poseMoray(spec: MorayRig, s: RigState, set: SetBone, offset: { x: number; y: number; z: number }) {
  const root = spec.joints[0], rest = s.rest, k = TAU / spec.wavelength;
  const strength = (.7 + .3 * clamp(s.effort, .25, 1.6)) * (1 - rest);
  const envelope = (x: number) => spec.headAmplitude + (spec.amplitude - spec.headAmplitude) * clamp(x, 0, 1) ** spec.envelope;
  // Resting: a lazy curve and slow sway along the body, and an S in the front half (out of the den), straight again where it goes in.
  const drape = (x: number) => rest * (x * (spec.drape * .05 * Math.sin(TAU * .85 * x - .9) + spec.sway * Math.sin(s.breath - 2.5 * x))
    + (x < .5 ? spec.curve * Math.sin(TAU * x / .5) : 0));
  const bend = .5 * spec.bend * s.curvature;
  const lateral = (x: number) => envelope(x) * strength * Math.sin(s.phase - k * x) + drape(x) + bend * (x - root) ** 2;
  offset.x = lateral(root);
  offset.y = 0;
  offset.z = 0;
  set('Root', 0, 0, 0);
  // The head follows the body's line; resting, it turns to look about and nods a little as it breathes.
  const look = spec.look * rest * (.65 * Math.sin(s.breath + 1.1) + .35 * Math.sin(2 * s.breath + 2.6));
  set('Head', -.06 * rest * Math.sin(s.breath + .4), Math.atan2(lateral(0) - lateral(root), root) + look, 0);
  // The mouth: a slow gape and close with each breath, a little open while swimming.
  set('Jaw', spec.gape * (.3 + .7 * (.5 + .5 * Math.sin(s.breath))) * (.35 + .65 * rest), 0, 0);
  const chain = [...spec.joints, 1];
  let previous = 0;
  for (let i = 0; i < 8; i++) {
    const angle = -Math.atan2(lateral(chain[i + 1]) - lateral(chain[i]), chain[i + 1] - chain[i]);
    set(`Body${i + 1}`, 0, angle - previous, 0);
    previous = angle;
  }
}
