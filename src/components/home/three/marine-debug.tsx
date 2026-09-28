import { useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { BufferAttribute, BufferGeometry, Group, Line, LineBasicMaterial, LineSegments } from 'three';
import { WORLD, type MarineMember, type MarineMotion } from '@/lib/marine-motion';

const Y = -.9, TAU = Math.PI * 2;
const COLORS = { outline: [1, 1, 1], desired: [1, .85, .2], animals: [1, .3, .3], island: [.3, 1, .6], lead: [.3, .9, 1], stalk: [1, .6, .1], charge: [1, .1, .1] };
/** The school's center marker, by mood. */
const MOODS = { calm: [.6, .8, 1], alert: [1, .85, .2], panic: [1, .2, .2], recover: [.9, .5, 1] };

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
 * Tuning overlay for the swimming simulation (see marine-swimmers.tsx for switching it on): each
 * species' island clearance (cyan) and the frame (faint white), and per animal its
 * footprint (white), desired heading (yellow), animal avoidance (red) and island avoidance (green).
 * The tuna school: the lead it follows and its heading (light blue), a cross at its center and the
 * oval where a tap selects it, colored by mood (blue calm, yellow alert, red panic, violet
 * regrouping). A great white near the school draws a line to it: orange while stalking an encounter
 * that will become a charge, red while charging. Positions are drawn where the camera shows them at
 * the animals' usual depth.
 */
export function MarineDebug({ motion, members }: { motion: MarineMotion; members: readonly MarineMember[] }) {
  const group = useMemo(() => {
    const root = new Group();
    const seen = new Set<string>();
    for (const member of members) {
      const info = motion.inspect(member.lane);
      if (!info || seen.has(member.model)) continue;
      seen.add(member.model);
      const points = Array.from({ length: 97 }, (_, k) => {
        const angle = TAU * k / 96;
        let r = 1;
        while (r < 7 && motion.field.island(r * Math.cos(angle), r * Math.sin(angle), info.allowance).distance < info.m.islandClearance) r += .02;
        return [r * Math.cos(angle), Y, r * Math.sin(angle) - info.shift];
      });
      root.add(strip(points, '#7fe0ff', .6));
    }
    const edge = Array.from({ length: 129 }, (_, k) => {
      const c = Math.cos(TAU * k / 128), s = Math.sin(TAU * k / 128);
      return [WORLD.x * Math.sign(c) * Math.abs(c) ** (1 / 3), Y, WORLD.z * Math.sign(s) * Math.abs(s) ** (1 / 3) - .42];
    });
    root.add(strip(edge, '#ffffff', .35));
    // Per animal: a 24-segment footprint, three direction lines and a hunting line; the school's lead,
    // center and 24-segment tap oval. Rewritten every frame.
    const segments = members.length * 28 + 28;
    const geometry = new BufferGeometry()
      .setAttribute('position', new BufferAttribute(new Float32Array(segments * 6), 3))
      .setAttribute('color', new BufferAttribute(new Float32Array(segments * 6), 3));
    root.add(overlay(new LineSegments(geometry, new LineBasicMaterial({ vertexColors: true }))));
    return { root, geometry };
  }, [motion, members]);
  useEffect(() => () => group.root.traverse((object) => {
    if (object instanceof Line) { object.geometry.dispose(); (object.material as LineBasicMaterial).dispose(); }
  }), [group]);

  useFrame(() => {
    const position = group.geometry.getAttribute('position') as BufferAttribute, color = group.geometry.getAttribute('color') as BufferAttribute;
    let v = 0;
    const put = (x: number, z: number, [r, g, b]: number[]) => { position.setXYZ(v, x, Y, z); color.setXYZ(v, r, g, b); v++; };
    for (const member of members) {
      const info = motion.inspect(member.lane);
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
      const hunt = motion.hunt(member.lane);
      const hunting = hunt && (hunt.phase === 'charge' || (hunt.phase === 'encounter' && hunt.attack)) && motion.school;
      const [tx, tz] = hunting ? (hunt.phase === 'charge' ? [hunt.aimX, hunt.aimZ] : [motion.school!.state.centerX, motion.school!.state.centerZ]) : [x, z];
      put(x, z, hunt?.phase === 'charge' ? COLORS.charge : COLORS.stalk); put(tx, tz, hunt?.phase === 'charge' ? COLORS.charge : COLORS.stalk);
    }
    const school = motion.school;
    if (school) {
      const { lead, state } = school, mood = MOODS[state.mood];
      put(lead.x, lead.z, COLORS.lead); put(lead.x + Math.sin(lead.heading) * .8, lead.z + Math.cos(lead.heading) * .8, COLORS.lead);
      put(state.centerX - .2, state.centerZ, mood); put(state.centerX + .2, state.centerZ, mood);
      put(state.centerX, state.centerZ - .2, mood); put(state.centerX, state.centerZ + .2, mood);
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
