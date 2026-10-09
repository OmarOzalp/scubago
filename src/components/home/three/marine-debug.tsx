import { useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { BufferAttribute, BufferGeometry, Group, Line, LineBasicMaterial, LineSegments, OrthographicCamera, Vector3 } from 'three';
import { breachHeight, breachFlight } from '@/lib/breach';
import type { MarineMotion } from '@/lib/marine-motion';
import { OCEAN } from '@/lib/ocean';
import { SWIM_LEVEL } from '@/lib/ocean-depth';

const Y = -.9, TAU = Math.PI * 2;
const COLORS = {
  outline: [1, 1, 1], desired: [1, .85, .2], animals: [1, .3, .3], island: [.3, 1, .6], lead: [.3, .9, 1], stalk: [1, .6, .1], charge: [1, .1, .1],
  group: [.75, .55, 1], slot: [.55, .45, .95], leap: [1, .35, .85], land: [1, 1, 1], world: [1, 1, 1], view: [.45, .75, 1],
};
/** The school's center marker, by mood. */
const MOODS = { calm: [.6, .8, 1], alert: [1, .85, .2], panic: [1, .2, .2], recover: [.9, .5, 1] };
/** Per animal: a 24-segment footprint, three direction lines, a hunting line, a line to its place and its place's cross. */
const PER_ANIMAL = 24 + 3 + 1 + 1 + 2;
/** Per group: its center's cross and a 24-segment ring; per leap: a 16-segment arc and the landing's cross. */
const PER_GROUP = 2 + 24, PER_LEAP = 16 + 2;
/** The ocean area (64 segments) and the camera's view (4), the school's lead, center and 24-segment tap oval. */
const FIXED = 64 + 4 + 3 + 24;

/** A line on top of everything, so the overlay is never hidden by the water or the island. */
function overlay<T extends Line | LineSegments>(line: T) {
  line.renderOrder = 999;
  (line.material as LineBasicMaterial).depthTest = false;
  (line.material as LineBasicMaterial).transparent = true;
  return line;
}
const strip = (points: number[][], color: string, opacity: number) => overlay(new Line(
  new BufferGeometry().setAttribute('position', new BufferAttribute(new Float32Array(points.flat()), 3)),
  new LineBasicMaterial({ color, opacity })));

/**
 * Tuning overlay for the swimming simulation (see marine-swimmers.tsx for switching it on).
 * Fixed: each species' island clearance (cyan) and, for leapers, the nearest a leap may come
 * (magenta). Live: the ocean area at the current level, easing as the island grows (white), and
 * the camera's view on the water (light blue), which widens with it. Per animal: its footprint
 * (white), desired heading (yellow), animal avoidance (red) and island avoidance (green); a
 * follower's place in its group and a line to it (violet), and each group's center and the ring
 * its members swim within (lilac). A leap: its arc through the air from where it leaves the water
 * to where it lands, drawn at its true height (magenta), and the landing (white cross). The tuna
 * school: the lead it follows and its heading (light blue), a cross at its center and the oval
 * where a tap selects it, colored by mood (blue calm, yellow alert, red panic, violet regrouping).
 * A great white near the school draws a line to it: orange while stalking an encounter that will
 * become a charge, red while charging. Positions are drawn where the camera shows them at the
 * animals' usual depth.
 */
export function MarineDebug({ motion }: { motion: MarineMotion }) {
  // The open water's animals (the reef's have no steering to show).
  const swimmers = useMemo(() => motion.swimmers.filter((s) => motion.inspect(s.lane)), [motion]);
  const group = useMemo(() => {
    const root = new Group();
    const seen = new Set<string>();
    for (const swimmer of swimmers) {
      const info = motion.inspect(swimmer.lane);
      if (!info || swimmer.index > 0 || seen.has(swimmer.model)) continue;
      seen.add(swimmer.model);
      const ring = (clearance: number) => Array.from({ length: 97 }, (_, k) => {
        const angle = TAU * k / 96;
        let r = 1;
        while (r < 8 && motion.field.island(r * Math.cos(angle), r * Math.sin(angle), info.allowance).distance < clearance) r += .02;
        return [r * Math.cos(angle), Y, r * Math.sin(angle) - info.shift];
      });
      root.add(strip(ring(info.m.islandClearance), '#7fe0ff', .6));
      if (info.m.breach) root.add(strip(ring(info.m.islandClearance + info.m.breach.islandMargin), '#ff5ad8', .5));
    }
    const groups = new Set(swimmers.map((s) => s.leader)).size;
    const segments = swimmers.length * PER_ANIMAL + groups * (PER_GROUP + PER_LEAP) + FIXED;
    const geometry = new BufferGeometry()
      .setAttribute('position', new BufferAttribute(new Float32Array(segments * 6), 3))
      .setAttribute('color', new BufferAttribute(new Float32Array(segments * 6), 3));
    root.add(overlay(new LineSegments(geometry, new LineBasicMaterial({ vertexColors: true }))));
    return { root, geometry };
  }, [motion, swimmers]);
  useEffect(() => () => group.root.traverse((object) => {
    if (object instanceof Line) { object.geometry.dispose(); (object.material as LineBasicMaterial).dispose(); }
  }), [group]);

  const corner = useMemo(() => new Vector3(), []), forward = useMemo(() => new Vector3(), []);
  useFrame(({ camera }) => {
    const position = group.geometry.getAttribute('position') as BufferAttribute, color = group.geometry.getAttribute('color') as BufferAttribute;
    let v = 0;
    const put = (x: number, z: number, [r, g, b]: number[], y = Y) => { position.setXYZ(v, x, y, z); color.setXYZ(v, r, g, b); v++; };
    const cross = (x: number, z: number, size: number, c: number[], y = Y) => { put(x - size, z, c, y); put(x + size, z, c, y); put(x, z - size, c, y); put(x, z + size, c, y); };

    // The ocean area at the current level (it eases to a new level's), where the camera shows it.
    const world = motion.ocean.world;
    for (let k = 0; k < 64; k++) for (const j of [k, k + 1]) {
      const c = Math.cos(TAU * j / 64), s = Math.sin(TAU * j / 64);
      put(world.x * Math.sign(c) * Math.abs(c) ** (1 / 3), world.z * Math.sign(s) * Math.abs(s) ** (1 / 3) - .42, COLORS.world);
    }
    // The camera's view on the water: its corners carried along the view direction down to the overlay's height.
    if (camera instanceof OrthographicCamera) {
      camera.getWorldDirection(forward);
      const at = (x: number, y: number) => {
        corner.set(x, y, 0).unproject(camera);
        const t = (Y - corner.y) / forward.y;
        return [corner.x + forward.x * t, corner.z + forward.z * t];
      };
      const corners = [at(-.98, -.98), at(.98, -.98), at(.98, .98), at(-.98, .98)];
      for (let k = 0; k < 4; k++) { const [ax, az] = corners[k], [bx, bz] = corners[(k + 1) % 4]; put(ax, az, COLORS.view); put(bx, bz, COLORS.view); }
    } else for (let k = 0; k < 8; k++) put(0, 0, [0, 0, 0]);

    const centers = new Map<number, { x: number; z: number; n: number; far: number }>();
    for (const swimmer of swimmers) {
      const info = motion.inspect(swimmer.lane);
      if (!info) continue;
      const x = info.x, z = info.z - info.shift, hx = Math.sin(info.heading), hz = Math.cos(info.heading);
      const rim = (t: number) => {
        const along = Math.cos(t) * info.m.halfLength, across = Math.sin(t) * info.m.halfWidth;
        return [x + hx * along + hz * across, z + hz * along - hx * across];
      };
      for (let k = 0; k < 24; k++) {
        const [ax, az] = rim(TAU * k / 24), [bx, bz] = rim(TAU * (k + 1) / 24);
        put(ax, az, COLORS.outline); put(bx, bz, COLORS.outline);
      }
      put(x, z, COLORS.desired); put(x + Math.sin(info.want) * 1.2, z + Math.cos(info.want) * 1.2, COLORS.desired);
      put(x, z, COLORS.animals); put(x + info.animals[0] * .6, z + info.animals[1] * .6, COLORS.animals);
      put(x, z, COLORS.island); put(x + info.island[0] * .6, z + info.island[1] * .6, COLORS.island);
      const hunt = motion.hunt(swimmer.lane);
      const hunting = hunt && (hunt.phase === 'charge' || (hunt.phase === 'encounter' && hunt.attack)) && motion.school;
      const [tx, tz] = hunting ? (hunt.phase === 'charge' ? [hunt.aimX, hunt.aimZ] : [motion.school!.state.centerX, motion.school!.state.centerZ]) : [x, z];
      put(x, z, hunt?.phase === 'charge' ? COLORS.charge : COLORS.stalk); put(tx, tz, hunt?.phase === 'charge' ? COLORS.charge : COLORS.stalk);
      // A follower's place, and the line to it.
      const [sx, sz] = swimmer.index ? [info.slot[0], info.slot[1] - info.shift] : [x, z];
      put(x, z, COLORS.slot); put(sx, sz, COLORS.slot);
      put(sx - .12, sz - .12, COLORS.slot); put(sx + .12, sz + .12, COLORS.slot); put(sx - .12, sz + .12, COLORS.slot); put(sx + .12, sz - .12, COLORS.slot);
      const center = centers.get(swimmer.leader) ?? { x: 0, z: 0, n: 0, far: 0 };
      center.x += x; center.z += z; center.n++;
      centers.set(swimmer.leader, center);
    }
    for (const [leader, center] of centers) {
      const cx = center.x / center.n, cz = center.z / center.n;
      for (const swimmer of swimmers) {
        if (swimmer.leader !== leader) continue;
        const info = motion.inspect(swimmer.lane)!;
        center.far = Math.max(center.far, Math.hypot(info.x - cx, info.z - info.shift - cz) + info.m.halfWidth);
      }
      // The group's center and the ring its members swim within (a lone animal draws nothing).
      const r = center.n > 1 ? center.far : 0;
      cross(cx, cz, r ? .18 : 0, COLORS.group);
      for (let k = 0; k < 24; k++) for (const j of [k, k + 1]) put(cx + Math.cos(TAU * j / 24) * r, cz + Math.sin(TAU * j / 24) * r, COLORS.group);
      // A leap by any member: its arc at its true height, from leaving the water to landing, and the landing.
      const leaper = swimmers.map((s) => ({ s, info: motion.inspect(s.lane)! })).find(({ s, info }) => s.leader === leader && info.leap && info.leap.stage !== 'settle');
      const leap = leaper?.info.leap, config = leaper?.info.m.breach;
      if (leap && config) {
        const { speed } = breachFlight(config), [ex, ez] = leap.exit, [lx, lz] = leap.land, surface = OCEAN.surfaceLevel - SWIM_LEVEL;
        const dx = (lx - ex) / (config.length || 1), dz = (lz - ez) / (config.length || 1);
        for (let k = 0; k < 16; k++) for (const j of [k, k + 1]) {
          const t = config.air * j / 16, [height] = breachHeight('air', t, 0, surface, config);
          put(ex + dx * speed * t, ez + dz * speed * t, COLORS.leap, height + SWIM_LEVEL);
        }
        put(lx - .15, lz, COLORS.land, OCEAN.surfaceLevel); put(lx + .15, lz, COLORS.land, OCEAN.surfaceLevel);
      } else for (let k = 0; k < PER_LEAP * 2; k++) put(cx, cz, [0, 0, 0]);
    }
    const school = motion.school;
    if (school) {
      const { lead, state } = school, mood = MOODS[state.mood];
      put(lead.x, lead.z, COLORS.lead); put(lead.x + Math.sin(lead.heading) * .8, lead.z + Math.cos(lead.heading) * .8, COLORS.lead);
      cross(state.centerX, state.centerZ, .2, mood);
      const area = school.hitArea, hx = Math.sin(area.heading), hz = Math.cos(area.heading);
      const rim = (t: number) => {
        const along = Math.cos(t) * area.along, across = Math.sin(t) * area.across;
        return [area.x + hx * along + hz * across, area.z + hz * along - hx * across];
      };
      for (let k = 0; k < 24; k++) {
        const [ax, az] = rim(TAU * k / 24), [bx, bz] = rim(TAU * (k + 1) / 24);
        put(ax, az, mood); put(bx, bz, mood);
      }
    }
    // Unused segments collapse to a point.
    for (; v < position.count; v++) { position.setXYZ(v, 0, Y, 0); color.setXYZ(v, 0, 0, 0); }
    position.needsUpdate = true; color.needsUpdate = true;
  });
  return <primitive object={group.root} />;
}
