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

export type SwimRigModel = 'tiger-shark' | 'whale-shark' | 'great-white-shark' | 'scalloped-hammerhead' | 'reef-manta' | 'mola-mola' | 'green-turtle' | 'bottlenose-dolphin';

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
  /** Pectoral fins: cyclic flap and pitch (rad), plus responses to turning (per rad/s) and climbing. */
  pectoral: { flap: number; pitch: number; turn: number; climb: number };
  /** Body roll with each tail beat (rad). */
  roll: number;
  /** Share of the path curvature expressed as a bend in the body when turning. */
  bend: number;
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

export type SwimRigSpec = SharkRig | MantaRig | SunfishRig | TurtleRig | CetaceanRig;

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
  // Up-and-down propulsion: the tail stock heaves the horizontal flukes, which angle into every beat,
  // while the head and front body stay steady. Quicker beats than any shark.
  'bottlenose-dolphin': {
    kind: 'cetacean', joints: [.3, .5, .64, .76, .865], frequency: .78, wavelength: 1.25,
    tailAmplitude: .075, rootAmplitude: .003, headAmplitude: .004, envelope: 2.9,
    fluke: .18, flukeLag: 1.2, flukeFlex: .12, pectoral: { flap: .04, turn: .5, climb: .3 }, heave: .004, bend: .85,
  },
};

export function rigBones(model: SwimRigModel): readonly string[] {
  const kind = SWIM_RIGS[model].kind;
  return kind === 'shark' ? SHARK_BONES : kind === 'manta' ? MANTA_BONES : kind === 'sunfish' ? SUNFISH_BONES : kind === 'cetacean' ? DOLPHIN_BONES : TURTLE_BONES;
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
  const state: RigState = {
    phase: ((phase % TAU) + TAU) % TAU, effort: 1, turn: 0, curvature: 0, climb: 0,
    // Turtles only: how actively the flippers stroke (0 = gliding), strokes left in this bout, glide time left.
    activity: 1, strokes: 0, glide: 0, bouts: Math.floor(phase * 7),
  };
  if (spec.kind === 'turtle') state.strokes = spec.bout[0];
  const slot = Object.fromEntries(bones.map((bone, index) => [bone, index * 3])) as Record<string, number>;
  const set = (bone: string, x: number, y: number, z: number) => {
    const i = slot[bone];
    rotation[i] = x; rotation[i + 1] = y; rotation[i + 2] = z;
  };
  const pose = () => {
    if (spec.kind === 'shark') poseShark(spec, state, set, offset);
    else if (spec.kind === 'manta') poseManta(spec, state, set, offset);
    else if (spec.kind === 'sunfish') poseSunfish(spec, state, set, offset);
    else if (spec.kind === 'cetacean') poseCetacean(spec, state, set, offset);
    else poseTurtle(spec, state, set, offset);
  };
  pose();
  return {
    model, spec, bones, rotation, offset,
    get phase() { return state.phase; },
    /** Advance by `dt` seconds. Inputs are eased so sudden changes never snap the pose. */
    step(dt: number, drive: SwimDrive) {
      if (dt <= 0) return;
      state.effort = ease(state.effort, clamp(drive.effort, .25, 1.6), 1.6, dt);
      state.turn = ease(state.turn, clamp(drive.turn, -1.2, 1.2), 2.2, dt);
      state.curvature = ease(state.curvature, clamp(drive.curvature, -1.5, 1.5), 2.2, dt);
      state.climb = ease(state.climb, clamp(drive.climb, -1, 1), 1.4, dt);
      if (spec.kind === 'turtle') stepTurtle(spec, state, dt);
      else state.phase = (state.phase + TAU * strokeFrequency(spec, state.effort) * dt) % TAU;
      pose();
    },
    /** Pose at an exact cycle phase with steady inputs; used to bake seamless loops. */
    sample(at: number, drive: SwimDrive = CRUISE) {
      state.phase = ((at % TAU) + TAU) % TAU;
      state.effort = clamp(drive.effort, .25, 1.6);
      state.turn = drive.turn; state.curvature = drive.curvature; state.climb = drive.climb;
      state.activity = 1;
      pose();
    },
  };
}
export type SwimRig = ReturnType<typeof createSwimRig>;

type RigState = {
  phase: number; effort: number; turn: number; curvature: number; climb: number;
  activity: number; strokes: number; glide: number; bouts: number;
};
type SetBone = (bone: string, x: number, y: number, z: number) => void;

/**
 * A traveling wave runs down the body midline; the amplitude envelope grows
 * toward the tail so the head stays steady. Each spine bone takes the change in
 * midline angle across its segment, so the caudal fin lags the peduncle the way
 * a real tail stroke does. Turning adds a C-shaped bend toward the inside.
 */
function poseShark(spec: SharkRig, s: RigState, set: SetBone, offset: { x: number; y: number; z: number }) {
  const [root, spine2, rearBody, tailBase, tail] = spec.joints;
  const k = TAU / spec.wavelength;
  const strength = .7 + .3 * s.effort;
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

  // Pectorals: a slight rhythmic trim, the inside fin dips in a turn, both pitch up to climb.
  const trim = spec.pectoral.flap * Math.sin(s.phase + 1.3);
  const lift = spec.pectoral.pitch * Math.sin(s.phase + 2.2) - spec.pectoral.climb * s.climb;
  const turn = spec.pectoral.turn * s.turn;
  set('PectoralL', lift, 0, trim - Math.max(0, turn) + .4 * Math.max(0, -turn));
  set('PectoralR', lift, 0, -(trim - Math.max(0, -turn) + .4 * Math.max(0, turn)));
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
  const strength = (.7 + .3 * s.effort) * (1 + .15 * s.climb);
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
  set('PectoralL', lift, 0, trim - Math.max(0, turn) + .4 * Math.max(0, -turn));
  set('PectoralR', lift, 0, -(trim - Math.max(0, -turn) + .4 * Math.max(0, turn)));
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
 * Bouts of strokes, then glides. A stroke cycle starts and ends with the flippers swept back
 * (phase 0), so a bout can end at any cycle boundary and ease straight into the glide pose.
 */
function stepTurtle(spec: TurtleRig, s: RigState, dt: number) {
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
