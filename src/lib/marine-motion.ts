import type { MarineModel } from './swimming';

export type MarineMember = { model: MarineModel; lane: number };
export type MarinePose = { x: number; y: number; z: number; heading: number; bank: number; effort: number };
const TAU = Math.PI * 2;
const PACE: Record<MarineModel, number> = { 'whale-shark': .073, 'tiger-shark': .105, 'reef-manta': .086, shark: .098, manta: .083, 'reef-fish': .118 };
const smooth = (t: number) => { const v = Math.max(0, Math.min(1, t)); return v * v * (3 - 2 * v); };
const wrap = (angle: number) => ((angle % TAU) + TAU) % TAU;
const turn = (angle: number) => Math.atan2(Math.sin(angle), Math.cos(angle));

/** A small shared simulation lets animals yield instead of passing through their neighbors. */
export function createMarineMotion(members: readonly MarineMember[]) {
  let time = 0;
  const animals = members.map((member, index) => {
    const angle = index * TAU / Math.max(1, members.length) + .3;
    const radius = .12 * Math.sin(member.lane * 2.4);
    const x = (3.92 + radius) * Math.cos(angle), z = (3.32 + radius) * Math.sin(angle);
    return { ...member, angle, radius, rate: PACE[member.model], pose: {
      x, y: -.02, z, heading: Math.atan2(-(3.92 + radius) * Math.sin(angle), (3.32 + radius) * Math.cos(angle)), bank: 0, effort: 1,
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
        const phase = animal.lane * 1.71;
        const cruise = PACE[animal.model] * (1 + .17 * Math.sin(time * .19 + phase) + .08 * Math.sin(time * .071 + phase));
        // Keep a generous arc of water ahead; ease back in well before catching the leader.
        const room = smooth((gap - .61) / .55);
        const rate = cruise * room;
        // Different bends along the route break up the perfect oval without cutting across land.
        const wander = animal.model === 'reef-manta' || animal.model === 'manta' ? .19
          : animal.model === 'whale-shark' ? .10 : .15;
        const radius = .09 * Math.sin(time * .113 + phase)
          + wander * Math.sin(animal.angle * 2 + phase + Math.sin(time * .047) * .5);
        return { rate, radius };
      });
      animals.forEach((animal, index) => {
        const decision = decisions[index];
        animal.rate += (decision.rate - animal.rate) * (1 - Math.exp(-dt * 1.8));
        animal.radius += (decision.radius - animal.radius) * (1 - Math.exp(-dt * .7));
        animal.angle = wrap(animal.angle + animal.rate * dt);
        const x = (3.92 + animal.radius) * Math.cos(animal.angle);
        const z = (3.32 + animal.radius) * Math.sin(animal.angle);
        const desired = Math.atan2(x - animal.pose.x, z - animal.pose.z);
        const rotation = Math.max(-.65 * dt, Math.min(.65 * dt, turn(desired - animal.pose.heading)));
        animal.pose.heading += rotation;
        animal.pose.bank += (-rotation / dt * .48 - animal.pose.bank) * (1 - Math.exp(-dt * 2));
        animal.pose.x = x; animal.pose.z = z;
        animal.pose.y = -.02 + Math.sin(time * .31 + animal.lane * 1.7) * .045;
        animal.pose.effort = .65 + .35 * animal.rate / PACE[animal.model];
      });
    },
  };
}
export type MarineMotion = ReturnType<typeof createMarineMotion>;
