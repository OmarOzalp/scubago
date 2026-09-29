import { describe, expect, it } from '@jest/globals';

import { CATALOG_BY_ID } from '@/lib/catalog';
import { createMarineMotion, MOVEMENT, type MarineMember } from '@/lib/marine-motion';
import { frame, viewBounds, WORLD } from '@/lib/steering';
import { MAX_ANIMATED, pickSwimmers, type MarineModel } from '@/lib/swimming';
import type { DexEntry } from '@/lib/types';

const ASPECT = 420 / 390;
const dt = 1 / 60;

/** Whether an animal at (x, apparent z) is wholly out of the camera's view. */
function unseen(motion: ReturnType<typeof createMarineMotion>, lane: number) {
  const pose = motion.get(lane)!, view = viewBounds(-.94, motion.ocean.world.x / WORLD.x, ASPECT);
  const r = MOVEMENT[motion.swimmers.find((s) => s.lane === lane)!.model].halfLength, z = pose.z + .4;
  return Math.abs(pose.x) - r > view.x || z + r < view.top || z - r > view.bottom;
}

function scene(model: MarineModel, group = 1) {
  const members: MarineMember[] = [{ model: 'tiger-shark', lane: 0 }, { model: 'green-turtle', lane: 1 }, { model, lane: 2, group }];
  return createMarineMotion(members, 3, { school: true, seed: .37, arriving: [2] });
}

describe('a new species arriving', () => {
  it('waits out of sight, ignored by the others, until its turn', () => {
    const motion = scene('reef-manta');
    for (let i = 0; i < 300; i++) motion.step(dt, true);
    expect(motion.arrival(2)?.stage).toBe('offstage');
    expect(motion.dive(2)).toMatchObject({ visible: false, opacity: 0 });
    expect(motion.arrival(0)).toBeNull(); // the others are simply there
  });

  // Each species at its own pace: within this many seconds it has swum in and settled.
  const arrivals: [MarineModel, number, number][] = [
    ['great-white-shark', 1, 12],
    ['whale-shark', 1, 26],
    ['reef-manta', 1, 20],
    ['green-turtle', 1, 18],
    ['bottlenose-dolphin', 3, 14],
  ];
  it.each(arrivals)('%s swims in from beyond the edge of the view, staying up in the water, and settles in', (model, group, within) => {
    const motion = scene(model, group);
    motion.step(dt, true);
    expect(motion.arrive(2, { aspect: ASPECT })).toBe(true);
    expect(unseen(motion, 2)).toBe(true);
    // Heading in: toward the island, not along the edge.
    const start = motion.get(2)!;
    expect(Math.cos(start.heading - Math.atan2(-start.x, -start.z))).toBeGreaterThan(.7);
    let t = 0, sawIt = false;
    while (motion.arrival(2)!.stage === 'entering' && t < 40) {
      motion.step(dt, true); t += dt;
      expect(motion.dive(2).depth).toBe(0); // no diving on the way in
      if (!unseen(motion, 2)) sawIt = true;
    }
    expect(sawIt).toBe(true);
    expect(motion.arrival(2)!.stage).toBe('arrived');
    expect(t).toBeLessThan(within);
    const end = motion.get(2)!;
    expect(frame(end.x, end.z + .4, motion.ocean.world).edge).toBeLessThan(1);
    // A full stretch at the surface after arriving, then its dives resume.
    for (let i = 0; i < 60 * 8; i++) motion.step(dt, true);
    expect(motion.dive(2).visible).toBe(true);
  });

  it('a dolphin pod arrives together', () => {
    const motion = scene('bottlenose-dolphin', 3);
    motion.arrive(2, { aspect: ASPECT });
    const pod = motion.swimmers.filter((s) => s.leader === 2).map((s) => s.lane);
    expect(pod.length).toBe(3);
    for (let i = 0; i < 60 * 3; i++) motion.step(dt, true);
    const lead = motion.get(2)!;
    for (const lane of pod) {
      const p = motion.get(lane)!;
      expect(Math.hypot(p.x - lead.x, p.z - lead.z)).toBeLessThan(2.5);
      expect(motion.dive(lane).visible).toBe(true);
    }
  });

  it('with reduced motion it is simply there', () => {
    const motion = scene('reef-manta');
    expect(motion.arrive(2, { instant: true })).toBe(true);
    expect(motion.arrival(2)!.stage).toBe('arrived');
    expect(unseen(motion, 2)).toBe(false);
    expect(motion.dive(2).visible).toBe(true);
    expect(motion.arrive(2)).toBe(false); // only once
  });

  it('a scene without arrivals is exactly as before', () => {
    const members: MarineMember[] = [{ model: 'reef-manta', lane: 0 }, { model: 'whale-shark', lane: 1 }];
    const plain = createMarineMotion(members, 2, { school: true, seed: .2 });
    const same = createMarineMotion(members, 2, { school: true, seed: .2, arriving: [] });
    for (let i = 0; i < 600; i++) { plain.step(dt, true); same.step(dt, true); }
    expect(same.get(0)).toEqual(plain.get(0));
    expect(same.get(1)).toEqual(plain.get(1));
  });
});

describe('the tuna school arriving', () => {
  it('waits out of sight while held, then swims in once released', () => {
    const motion = createMarineMotion([{ model: 'reef-manta', lane: 0 }], 2, { school: true, seed: .5 });
    motion.step(dt, true);
    expect(motion.holdSchool(ASPECT)).toBe(true);
    const school = motion.school!;
    const view = viewBounds(-.96, motion.ocean.world.x / WORLD.x, ASPECT);
    const inView = () => Array.from({ length: school.size }, (_, i) => i)
      .filter((i) => Math.abs(school.pose.x[i]) < view.x && school.pose.z[i] > view.top && school.pose.z[i] < view.bottom).length;
    for (let i = 0; i < 120; i++) motion.step(dt, true);
    expect(school.arriving).toBe('held');
    expect(inView()).toBe(0);
    motion.releaseSchool();
    let t = 0;
    while (school.arriving && t < 45) { motion.step(dt, true); t += dt; }
    expect(school.arriving).toBeNull();
    expect(inView()).toBe(school.size);
  });
});

describe('a featured place for a new discovery', () => {
  const entry = (id: string): DexEntry => ({
    species: CATALOG_BY_ID.get(id)!, count: 1, firstSeenOn: '2026-09-01', firstSeenSiteId: 'x', lastSeenOn: '2026-09-01',
  });
  const sharks = ['whale-shark', 'tiger-shark', 'great-white-shark', 'scalloped-hammerhead', 'reef-manta', 'mola-mola', 'green-turtle', 'bottlenose-dolphin'];
  // More swimming species than the island animates at once (MAX_ANIMATED).
  const residents = [...sharks, 'blacktip-reef-shark', 'whitetip-reef-shark', 'grey-reef-shark'].map(entry).filter((r) => r.species);

  it('shows a new species even when its page is not the one showing, without animating more than the budget', () => {
    expect(residents.length).toBeGreaterThan(MAX_ANIMATED);
    const onPage0 = pickSwimmers(residents, 0).map((s) => s.species.id);
    const later = residents.map((r) => r.species.id).find((id) => !onPage0.includes(id))!;
    const featured = pickSwimmers(residents, 0, MAX_ANIMATED, [later]);
    expect(featured).toHaveLength(MAX_ANIMATED);
    expect(featured.map((s) => s.species.id)).toContain(later);
    // It takes the last place; the others keep theirs.
    expect(featured.at(-1)!.species.id).toBe(later);
    expect(featured.slice(0, -1).map((s) => s.species.id)).toEqual(onPage0.slice(0, -1));
    expect(featured.map((s) => s.lane)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });

  it('changes nothing when the new species is already on the page', () => {
    const onPage0 = pickSwimmers(residents, 0);
    expect(pickSwimmers(residents, 0, MAX_ANIMATED, [onPage0[3].species.id])).toEqual(onPage0);
  });
});
