import type { MarineModel } from './swimming';

export type MarineMember = { model: MarineModel; lane: number };
/**
 * `effort` drives artist swim clips (never below .65); `pace` is speed relative to the
 * species' cruise and drives procedural rigs. `turn` is the heading change in rad/s
 * (positive toward the animal's left), `speed` in world units/s, `climb` -1..1.
 */
export type MarinePose = { x: number; y: number; z: number; heading: number; bank: number; effort: number; pace: number; turn: number; speed: number; climb: number };

/** How a species moves through the scene. Swimming gait lives in src/lib/marine-rigs.ts. */
export type Movement = {
  /** Cruising circulation around the island (rad/s). */
  pace: number;
  /** Slow speed changes: fractional amplitude and period (s). */
  swing: number; swingPeriod: number;
  /** Occasional bursts of speed, as a fraction of cruise. */
  surge: number;
  /** Route bends: amplitude (world units), bends per circuit, and 0 (smooth weave) to 1 (hold a line, then turn). */
  wander: number; bends: number; patrol: number;
  /** How quickly a new route line is taken up (1/s); low values give wide, lazy arcs. */
  steer: number;
  /** Roll into turns: rad per rad/s of turn, the largest roll, and how quickly roll follows (1/s). */
  bank: number; bankMax: number; bankEase: number;
  /** Occasional slow roll onto one side (rad). */
  lazyRoll: number;
  /** Vertical drift: amplitude (world units) and period (s). */
  bob: number; bobPeriod: number;
};

const TAU = Math.PI * 2;
const FAMILY: Movement = {
  pace: .098, swing: .17, swingPeriod: TAU / .19, surge: 0, wander: .15, bends: 2, patrol: 0,
  steer: .7, bank: .48, bankMax: Infinity, bankEase: 2, lazyRoll: 0, bob: .045, bobPeriod: TAU / .31,
};
export const MOVEMENT: Record<MarineModel, Movement> = {
  // Enormous and unhurried: steady speed, broad sweeping arcs, a slow shallow roll and a gentle rise and fall.
  'whale-shark': { pace: .072, swing: .06, swingPeriod: 44, surge: 0, wander: .07, bends: 1, patrol: 0, steer: .3, bank: .35, bankMax: .09, bankEase: .6, lazyRoll: 0, bob: .065, bobPeriod: 27 },
  // Medium cruise with confident curves and the occasional lazy roll onto one side.
  'tiger-shark': { pace: .112, swing: .14, swingPeriod: 30, surge: 0, wander: .14, bends: 2, patrol: .2, steer: .7, bank: .5, bankMax: .2, bankEase: 1.3, lazyRoll: .16, bob: .04, bobPeriod: 19 },
  // Faster and deliberate: holds a line, then turns decisively with a slight bank; now and then a powerful surge.
  'great-white-shark': { pace: .136, swing: .07, swingPeriod: 26, surge: .2, wander: .17, bends: 2, patrol: .85, steer: 1.1, bank: .42, bankMax: .2, bankEase: 2.4, lazyRoll: 0, bob: .03, bobPeriod: 21 },
  // Underwater flight: wide weaving turns with deep, graceful banks, long climbs and descents, strokes and glides.
  'reef-manta': { pace: .09, swing: .2, swingPeriod: 12, surge: 0, wander: .18, bends: 2, patrol: 0, steer: .5, bank: 1.9, bankMax: .38, bankEase: 1.1, lazyRoll: 0, bob: .09, bobPeriod: 17 },
  // Family representatives keep their original tuning.
  shark: FAMILY,
  manta: { ...FAMILY, pace: .083, wander: .19 },
  'reef-fish': { ...FAMILY, pace: .118 },
};
const smooth = (t: number) => { const v = Math.max(0, Math.min(1, t)); return v * v * (3 - 2 * v); };
const wrap = (angle: number) => ((angle % TAU) + TAU) % TAU;
const turn = (angle: number) => Math.atan2(Math.sin(angle), Math.cos(angle));
const clamp = (value: number, limit: number) => Math.max(-limit, Math.min(limit, value));
/** Blend a smooth weave toward a held line that switches sides decisively. */
const bendShape = (x: number, patrol: number) => (1 - patrol) * Math.sin(x) + patrol * Math.tanh(2.5 * Math.sin(x)) / Math.tanh(2.5);

/** A small shared simulation lets animals yield instead of passing through their neighbors. */
export function createMarineMotion(members: readonly MarineMember[]) {
  let time = 0;
  const animals = members.map((member, index) => {
    const angle = index * TAU / Math.max(1, members.length) + .3;
    const movement = MOVEMENT[member.model];
    // Start on the route itself (the eased radius is still at rest), so the first frames never twitch.
    const phase = member.lane * 1.71;
    const radius = .09 * Math.sin(phase) + movement.wander * bendShape(angle * movement.bends + phase, movement.patrol);
    const x = (3.92 + radius) * Math.cos(angle), z = (3.32 + radius) * Math.sin(angle);
    const heading = Math.atan2(-(3.92 + radius) * Math.sin(angle), (3.32 + radius) * Math.cos(angle));
    return { ...member, movement, angle, radius, rate: movement.pace, pose: {
      x, y: -.02 + Math.sin(member.lane * 1.7) * movement.bob, z, heading, bank: 0, effort: 1, pace: 1, turn: 0, speed: 0, climb: 0,
    } };
  });
  const byLane = new Map(animals.map((animal) => [animal.lane, animal]));
  return {
    get(lane: number): MarinePose | undefined { return byLane.get(lane)?.pose; },
    step(delta: number, active: boolean) {
      if (!active) return;
      const dt = Math.max(0, Math.min(delta, .05));
      if (!dt) return;
      time += dt;
      // Compute all decisions from the same snapshot, independent of render order.
      const decisions = animals.map((animal) => {
        let gap = TAU;
        for (const other of animals) {
          if (other !== animal) gap = Math.min(gap, wrap(other.angle - animal.angle));
        }
        const m = animal.movement;
        const phase = animal.lane * 1.71;
        const surge = m.surge * Math.max(0, Math.sin(time * TAU / 23 + phase)) ** 8;
        const cruise = m.pace * (1 + m.swing * Math.sin(time * TAU / m.swingPeriod + phase) + .08 * Math.sin(time * .071 + phase)) * (1 + surge);
        // Keep a generous arc of water ahead; ease back in well before catching the leader.
        const room = smooth((gap - .61) / .55);
        const rate = cruise * room;
        // Species-scaled bends along the route break up the perfect oval without cutting across land.
        const radius = .09 * Math.sin(time * .113 + phase)
          + m.wander * bendShape(animal.angle * m.bends + phase + Math.sin(time * .047) * .5, m.patrol);
        return { rate, radius };
      });
      animals.forEach((animal, index) => {
        const decision = decisions[index];
        const m = animal.movement;
        animal.rate += (decision.rate - animal.rate) * (1 - Math.exp(-dt * 1.8));
        animal.radius += (decision.radius - animal.radius) * (1 - Math.exp(-dt * m.steer));
        animal.angle = wrap(animal.angle + animal.rate * dt);
        const x = (3.92 + animal.radius) * Math.cos(animal.angle);
        const z = (3.32 + animal.radius) * Math.sin(animal.angle);
        const desired = Math.atan2(x - animal.pose.x, z - animal.pose.z);
        const rotation = Math.max(-.65 * dt, Math.min(.65 * dt, turn(desired - animal.pose.heading)));
        animal.pose.heading += rotation;
        // Roll into the turn (with an occasional lazy roll for some species), eased so it never snaps.
        const lazy = m.lazyRoll * Math.sin(time * TAU / 27 + animal.lane * 2.1) ** 5;
        const bank = clamp(-rotation / dt * m.bank + lazy, m.bankMax);
        animal.pose.bank += (bank - animal.pose.bank) * (1 - Math.exp(-dt * m.bankEase));
        animal.pose.turn += (rotation / dt - animal.pose.turn) * (1 - Math.exp(-dt * 3));
        animal.pose.speed = Math.hypot(x - animal.pose.x, z - animal.pose.z) / dt;
        const y = -.02 + Math.sin(time * TAU / m.bobPeriod + animal.lane * 1.7) * m.bob;
        animal.pose.climb = Math.max(-1, Math.min(1, (y - animal.pose.y) / dt / (m.bob * TAU / m.bobPeriod)));
        animal.pose.x = x; animal.pose.z = z;
        animal.pose.y = y;
        animal.pose.pace = animal.rate / m.pace;
        animal.pose.effort = .65 + .35 * animal.pose.pace;
      });
    },
  };
}
export type MarineMotion = ReturnType<typeof createMarineMotion>;
