import type { ShoreField } from './island-outline';
import { apparentShift, clamp, ease, smoothstep, TAU, variation, WORLD, type World } from './steering';
import type { MarineModel } from './swimming';

/**
 * One school of tuna around the island, and how it reacts to the large animals. Everything to
 * tune lives in the three objects below; docs/tuna-school.md explains each and how to change them.
 * Distances are world units (the island is about 4.3 across), times seconds.
 */
export const TUNA_SCHOOL = {
  /** Fish in the school: dense enough to read as a school, light enough for phones. */
  size: 28,
  /** Length of one tuna (a whale shark is 3), and how much fish differ (fraction). */
  length: .52, lengthVariation: .08,
  /** Cruising and top escape speeds (units/s), and how quickly a fish changes speed (units/s²), calm and fleeing. */
  cruiseSpeed: .46, panicSpeed: 1.25, acceleration: 1.2, panicAcceleration: 3.2,
  /** How sharply one fish turns (rad/s), calm and fleeing, and how the school turns as a whole (rad/s). */
  turnRate: 2, panicTurnRate: 4.5, schoolTurnRate: .42,
  /** Gap fish keep from one another (units), and how strongly they hold the school's shape and heading. */
  separationRadius: .34, cohesionStrength: 1, alignmentStrength: 1,
  /** The calm school: length, half-width and half-height (units). It breathes, tighter and looser, around this. */
  shape: [2.6, .62, .18] as const,
  /** How far offshore the lead of the school roams (units), and the closest one fish comes to the shore. */
  roam: [1.35, 2.2] as const, fishClearance: .5,
  /** The school's usual depth (world height) and how far it wanders up and down (units). */
  depth: -.96, depthRange: .22,
  /** Average seconds between broad turns that reverse the school's way round the island. */
  reverseEvery: 85,
  /** A threat this close to the school's center puts it on alert (units). */
  alertRadius: 3.4,
  /** A charging shark sends fish this close to its path into flight (units). */
  panicRadius: 1.1,
  /** How long panic lasts once the danger has passed (s), and how long the school takes to fully regroup (s). */
  panicFade: 1.4, regroupTime: 7,
  /** Tail beats per second at cruising speed (faster when fleeing). */
  tailBeat: 2.4,
  /**
   * The school's tap target: an oval over the fish reaching twice their spread each way from their
   * middle, plus this padding (units), with half-sizes kept between these (units): the smallest is
   * comfortable under a finger, the largest never covers much more than the school.
   */
  hitPadding: .35, hitSize: [.85, 2.2] as const,
};

/**
 * How the school treats each large animal: `threat` 0 is just an obstacle to flow around, up to 1
 * for a hunter; `gap` is the room fish keep from its body (units); `startle` is how hard a close pass
 * frightens the nearest fish, as a share of `threat` (.45 unless set; keep `threat` × `startle` under
 * .5, where the school panics); `hunts` marks a species that stalks and may charge the school
 * (GREAT_WHITE_HUNT, below).
 */
export const SCHOOL_REACTIONS: Record<MarineModel, { threat: number; gap: number; startle?: number; hunts?: boolean }> = {
  'great-white-shark': { threat: 1, gap: .4, hunts: true },
  // A predator the school watches closely, tightening and turning away, and a close pass scatters the
  // nearest fish; but it does not hunt the school (yet): `hunts: true` would give it the great white's charges.
  'scalloped-hammerhead': { threat: .75, gap: .4, startle: .55 },
  'tiger-shark': { threat: .6, gap: .38 },
  shark: { threat: .5, gap: .35 },
  'whale-shark': { threat: 0, gap: .3 },
  'reef-manta': { threat: 0, gap: .22 },
  manta: { threat: 0, gap: .22 },
  'mola-mola': { threat: 0, gap: .25 },
  'green-turtle': { threat: 0, gap: .15 },
  // Not a threat to the school: the fish make room and flow around it.
  'bottlenose-dolphin': { threat: 0, gap: .28 },
  'reef-fish': { threat: 0, gap: .08 },
};

/** The great white's hunting behavior (used by src/lib/marine-motion.ts). */
export const GREAT_WHITE_HUNT = {
  /** Chance that an encounter becomes a charge: rolled once, when the encounter begins. */
  attackProbability: .2,
  /** Coming within this distance of the school's center begins an encounter... */
  encounterRadius: 3,
  /** ...which ends once the shark is this far away again, so the next approach is a new encounter. */
  releaseRadius: 4.8,
  /** The charge: top speed (× cruise), turn rate (× usual), and its longest duration (s). */
  chargeSpeed: 2.1, chargeTurn: 1.3, chargeDuration: 7,
  /** Seconds after a charge before another encounter can become one. */
  cooldown: 50,
};

/**
 * Whether a hunter's `encounter`-th encounter with the school becomes a charge: decided once, when
 * the encounter begins, never re-rolled while it lasts. Deterministic for a hunter (its lane) and a
 * seed, so a scene replays exactly; over many encounters, `attackProbability` of them come up.
 */
export const attackRoll = (hunter: number, seed: number, encounter: number) =>
  variation(hunter * 7.31 + seed * 131 + 11, encounter) < GREAT_WHITE_HUNT.attackProbability;

/** What the school knows about one large animal, refreshed every step by the simulation. */
export type SchoolNeighbor = {
  model: MarineModel;
  /** Position (world), heading, speed and footprint (half-length, half-width). */
  x: number; y: number; z: number; heading: number; speed: number; halfLength: number; halfWidth: number;
  /** 0 while deep on a dive (out of sight), 1 near the surface. */
  presence: number;
  /** Charging the school right now. */
  charging: boolean;
};

export type SchoolMood = 'calm' | 'alert' | 'panic' | 'recover';

/** Arc-length spacing of the recorded trail of the school's lead (units), and how many points it keeps. */
const TRAIL_STEP = .1, TRAIL_POINTS = 90;
/** Where along its look-ahead the lead checks the shore (fractions), so a small islet is not jumped over. */
const LOOKS = [.35, .7, 1];
/** The large animals' usual world height: apparentShift() measures depth from it. */
const LEVEL = -.94;
/** Islets are small sandbars: fish may pass them this much closer than the main island (units). */
const ISLET_ALLOWANCE = .45;
/** How much farther up the screen a point appears per unit higher in the water (see apparentShift()). */
const SLANT = apparentShift(0) - apparentShift(1);
/**
 * How far around its anchor fish the tap target gathers the school's main body (units): fish beyond
 * are stragglers, or the other part of a split school, and the target does not stretch to them.
 */
const HIT_STRAY = 2.5;
/** Tail phases wrap at a multiple of a full beat, so they stay precise as 32-bit floats. */
const PHASE_WRAP = TAU * 64;
/** Where fish start turning back from the frame (its edge measure), tested as a sixth power without roots. */
const EDGE_TEST = .92 ** 6, INSIDE = { edge: 0, nx: 0, nz: 0 };
/**
 * steering's frame() (where a point sits in the ocean area, 1 at its edge, and the inward direction)
 * with products in place of powers, written into `out`: the school asks it often.
 */
function frameAt(x: number, z: number, out: { edge: number; nx: number; nz: number }, world: World) {
  const u = x / world.x, v = z / world.z, u2 = u * u, v2 = v * v, u4 = u2 * u2, v4 = v2 * v2;
  const gx = u4 * u / world.x, gz = v4 * v / world.z, g = Math.sqrt(gx * gx + gz * gz) || 1;
  out.edge = Math.pow(u4 * u2 + v4 * v2, 1 / 6); out.nx = -gx / g; out.nz = -gz / g;
  return out;
}
// Cheaper equivalents of Math.hypot and steering's wrap() for the school's per-fish work.
const norm = (x: number, z: number) => Math.sqrt(x * x + z * z);
const wrapAngle = (angle: number) => angle - TAU * Math.round(angle / TAU);

/**
 * The school: a lead point that roams the ocean like one of the large animals (keeping its
 * distance offshore, turning broadly, rising and falling), and fish that follow its trail, each
 * holding a slowly drifting place in a loose oval behind it while keeping their distance from one
 * another and matching their neighbors. So the school stays elongated and bends into an arc when
 * it turns. A shared mood (calm, alert, panic, recover) sets how tightly the fish hold together
 * and how fast they swim; threats are judged once per step for the whole school, and each fish
 * only checks the few animals that are near. Allocation-free per step.
 */
export function createTunaSchool(initialField: ShoreField, options: {
  size?: number; seed?: number;
  /**
   * The ocean area to keep to (half-sizes, units) and extra roaming room offshore (units), shared with
   * the large animals: they widen as the island levels up (OCEAN_GROWTH in steering.ts). Read live.
   */
  ocean?: { world: World; roam: number };
} = {}) {
  const n = Math.max(1, Math.round(options.size ?? TUNA_SCHOOL.size));
  const seed = options.seed ?? 0;
  const ocean = options.ocean ?? { world: { ...WORLD }, roam: 0 };
  let field = initialField;
  const T = TUNA_SCHOOL;
  const f32 = () => new Float32Array(n);
  // Fish state.
  const x = f32(), y = f32(), z = f32(), vx = f32(), vy = f32(), vz = f32();
  const heading = f32(), turn = f32(), pitch = f32(), panic = f32(), phase = f32(), amp = f32();
  const prevX = f32(), prevY = f32(), prevZ = f32(), prevHeading = f32(), prevPhase = f32();
  const slotA = f32(), slotB = f32(), slotC = f32(), pace = f32(), side = f32(), sizes = f32();
  // Which way round the island a fish cut off from the school is heading back (+1, -1, or 0 when with it).
  const rejoin = f32();
  // Each fish's place drifts slowly within the school (refreshed about once a second, a few fish per step).
  const driftA = f32(), driftB = f32(), driftC = f32();
  // The shore near each fish (refreshed for a third of the school per step, every step near the shore).
  const shoreD = f32(), shoreNX = f32(), shoreNZ = f32();
  // Scratch per step.
  const sepX = f32(), sepY = f32(), sepZ = f32(), nbX = f32(), nbZ = f32(), nbCount = f32(), spread = f32();
  // Published (interpolated) poses for the renderer; `bend` curves the body into turns.
  const pose = { x: f32(), y: f32(), z: f32(), heading: f32(), pitch: f32(), roll: f32(), bend: f32(), phase: f32(), amp: f32() };

  for (let i = 0; i < n; i++) {
    const r = (k: number) => variation(seed * 131 + i, k);
    // Places in the school: along its length (0 front, 1 back), across and up.
    slotA[i] = .06 + .88 * (i + r(1) * .8) / n;
    slotB[i] = (r(2) * 2 - 1) * (.35 + .65 * r(3));
    slotC[i] = r(4) * 2 - 1;
    pace[i] = .94 + .12 * r(5);
    side[i] = r(6) < .5 ? -1 : 1;
    sizes[i] = 1 + T.lengthVariation * (r(7) * 2 - 1);
    phase[i] = r(8) * TAU;
    amp[i] = .07;
  }

  // The lead, starting in the middle of its roaming band on the far side of the island.
  const lead = {
    x: 0, z: 0, y: T.depth, heading: 0, speed: T.cruiseSpeed, turn: 0, want: 0,
    direction: variation(seed, 9) < .5 ? 1 : -1, halfTurn: 0, nextReverse: T.reverseEvery * (.6 + .8 * variation(seed, 10)), reversals: 0,
    /** How wide the school may spread here (1 full width), narrowing into a stream where the water between the shore and the frame is tight. */
    squeeze: 1,
    /** Its distance offshore (units), and how often it has moved to the front of its school's largest group. */
    shore: 0, reseats: 0,
  };
  {
    const angle = -2.3 + variation(seed, 11) * .6, shift = apparentShift(T.depth - LEVEL);
    let radius = 1.5;
    while (radius < 6 && field.island(radius * Math.cos(angle), radius * Math.sin(angle), ISLET_ALLOWANCE).distance < (T.roam[0] + T.roam[1] + ocean.roam) / 2) radius += .05;
    lead.x = radius * Math.cos(angle);
    lead.z = radius * Math.sin(angle) - shift;
    const shore = field.island(lead.x, lead.z + shift, ISLET_ALLOWANCE);
    lead.heading = Math.atan2(-shore.nz * lead.direction, shore.nx * lead.direction);
  }
  // Recorded trail of the lead (newest first), extended straight back from the start.
  // Positions and directions of travel (unit vectors, so fish need no trigonometry to use them).
  const trailX = new Float32Array(TRAIL_POINTS), trailZ = new Float32Array(TRAIL_POINTS), trailHX = new Float32Array(TRAIL_POINTS), trailHZ = new Float32Array(TRAIL_POINTS);
  for (let k = 0; k < TRAIL_POINTS; k++) {
    trailX[k] = lead.x - Math.sin(lead.heading) * TRAIL_STEP * k;
    trailZ[k] = lead.z - Math.cos(lead.heading) * TRAIL_STEP * k;
    trailHX[k] = Math.sin(lead.heading); trailHZ[k] = Math.cos(lead.heading);
  }
  let trailHead = 0, sinceTrail = 0;
  const trailAt = (k: number) => (trailHead + k) % TRAIL_POINTS;
  /** A point `distance` behind the lead along its trail, and the direction of travel there. */
  const along = { x: 0, z: 0, hx: 0, hz: 1 };
  const behind = (distance: number) => {
    const s = (distance - sinceTrail) / TRAIL_STEP;
    if (s <= 0) {
      along.hx = Math.sin(lead.heading); along.hz = Math.cos(lead.heading);
      along.x = lead.x - along.hx * distance; along.z = lead.z - along.hz * distance;
      return along;
    }
    const k = Math.min(TRAIL_POINTS - 2, Math.floor(s)), t = Math.min(1, s - k);
    const a = trailAt(k), b = trailAt(k + 1);
    along.x = trailX[a] + (trailX[b] - trailX[a]) * t;
    along.z = trailZ[a] + (trailZ[b] - trailZ[a]) * t;
    const hx = trailHX[a] + (trailHX[b] - trailHX[a]) * t, hz = trailHZ[a] + (trailHZ[b] - trailHZ[a]) * t, h = norm(hx, hz) || 1;
    along.hx = hx / h; along.hz = hz / h;
    return along;
  };

  const sampleShore = (i: number) => {
    const s = field.island(x[i], z[i] + apparentShift(y[i] - LEVEL), ISLET_ALLOWANCE);
    shoreD[i] = s.distance; shoreNX[i] = s.nx; shoreNZ[i] = s.nz;
  };
  // Place the fish in their slots behind the lead.
  const placeFish = () => {
    for (let i = 0; i < n; i++) {
      driftA[i] = .05 * Math.sin(i * 1.7 * 1.3 + seed); driftB[i] = .18 * Math.sin(i * 1.7 * 1.9 + 2.1); driftC[i] = .35 * Math.sin(i * 1.7 * 1.1 + 4.2);
      const a = clamp(slotA[i] + driftA[i], .02, .98), p = behind(a * T.shape[0]);
      const width = T.shape[1] * Math.sin(Math.PI * (.1 + .8 * a));
      x[i] = p.x + p.hz * (slotB[i] + driftB[i]) * width;
      z[i] = p.z - p.hx * (slotB[i] + driftB[i]) * width;
      y[i] = T.depth + clamp(slotC[i] + driftC[i], -1.2, 1.2) * T.shape[2];
      heading[i] = Math.atan2(p.hx, p.hz);
      vx[i] = p.hx * T.cruiseSpeed; vz[i] = p.hz * T.cruiseSpeed;
      prevX[i] = x[i]; prevY[i] = y[i]; prevZ[i] = z[i]; prevHeading[i] = heading[i]; prevPhase[i] = phase[i];
      sampleShore(i);
    }
  };
  placeFish();
  /**
   * Arriving as a new discovery (motion.holdSchool()): `held` out of sight until released, then
   * `entering` (swimming in toward `goal`, the frame not turning it back) until it is well in view.
   */
  const arrival = { held: false, entering: false, goalX: 0, goalZ: 0 };

  const state = {
    mood: 'calm' as SchoolMood,
    /** Center of the fish, their average velocity, and how far they spread (RMS distance from the center). */
    centerX: 0, centerY: T.depth, centerZ: 0, velocityX: 0, velocityZ: 0, spread: 1,
    /** Strongest threat nearby (0..1), the most frightened fish (0..1), and the worst fright since the school was last calm. */
    alert: 0, fear: 0, scare: 0,
    /** Seconds since the last scare. */
    sinceScare: Infinity,
  };
  const measure = () => {
    let cx = 0, cy = 0, cz = 0, ax = 0, az = 0;
    for (let i = 0; i < n; i++) { cx += x[i]; cy += y[i]; cz += z[i]; ax += vx[i]; az += vz[i]; }
    state.centerX = cx / n; state.centerY = cy / n; state.centerZ = cz / n; state.velocityX = ax / n; state.velocityZ = az / n;
    let s = 0;
    for (let i = 0; i < n; i++) s += (x[i] - state.centerX) ** 2 + (z[i] - state.centerZ) ** 2;
    state.spread = Math.sqrt(s / n);
  };
  measure();

  /**
   * The school's largest group (fish linked by gaps under 1 unit), found without allocating: its
   * size, center and average velocity.
   */
  const visited = new Uint8Array(n), stack = new Int16Array(n), group = new Int16Array(n);
  const largest = { size: 0, x: 0, z: 0, vx: 0, vz: 0 };
  const findLargestGroup = () => {
    visited.fill(0);
    largest.size = 0;
    for (let i = 0; i < n; i++) {
      if (visited[i]) continue;
      let top = 0, count = 0;
      stack[top++] = i; visited[i] = 1;
      while (top) {
        const a = stack[--top];
        group[count++] = a;
        for (let j = 0; j < n; j++) {
          if (!visited[j] && (x[a] - x[j]) ** 2 + (z[a] - z[j]) ** 2 < 1) { visited[j] = 1; stack[top++] = j; }
        }
      }
      if (count <= largest.size) continue;
      let gx = 0, gz = 0, gvx = 0, gvz = 0;
      for (let k = 0; k < count; k++) { const f = group[k]; gx += x[f]; gz += z[f]; gvx += vx[f]; gvz += vz[f]; }
      largest.size = count; largest.x = gx / count; largest.z = gz / count; largest.vx = gvx / count; largest.vz = gvz / count;
    }
    return largest;
  };
  /**
   * The lead is only the school's guide, never seen: if it has run away from the school (most of the
   * fish held back far behind it, by an islet or a crowd of animals), it moves to the front of the
   * school's largest group, and the school carries on from there, as a real school follows its majority.
   */
  function reseatLead() {
    const main = findLargestGroup();
    if (main.size < n * .45 || norm(main.x - lead.x, main.z - lead.z) < T.shape[0] + 1) return;
    const speed = norm(main.vx, main.vz) || 1e-6, hx = main.vx / speed, hz = main.vz / speed;
    lead.x = main.x + hx * T.shape[0] * .4; lead.z = main.z + hz * T.shape[0] * .4;
    lead.heading = Math.atan2(hx, hz); lead.turn = 0; lead.want = 0; lead.halfTurn = 0; lead.speed = T.cruiseSpeed * .8;
    const shore = field.island(lead.x, lead.z + apparentShift(lead.y - LEVEL), ISLET_ALLOWANCE);
    lead.direction = hx * -shore.nz + hz * shore.nx >= 0 ? 1 : -1;
    trailHead = 0; sinceTrail = 0;
    for (let k = 0; k < TRAIL_POINTS; k++) {
      trailX[k] = lead.x - hx * TRAIL_STEP * k; trailZ[k] = lead.z - hz * TRAIL_STEP * k; trailHX[k] = hx; trailHZ[k] = hz;
    }
    for (let i = 0; i < n; i++) rejoin[i] = 0;
    lead.reseats++;
  }

  /**
   * Where a tap selects the school (tuna-school-mesh.tsx lays its one tap target over this): an oval
   * where the camera shows the fish at the school's depth, over the main body of the school (the
   * larger part if it splits, stragglers aside), turned along its longest spread and reaching twice
   * its spread each way plus `hitPadding`, kept within `hitSize`. Measured from the published poses,
   * so it follows the school through every mood; no allocation.
   */
  const hitArea = { x: 0, y: T.depth, z: 0, heading: 0, along: 0, across: 0 };
  /** The fish the tap target is built around, and how many fish are within HIT_STRAY of each (refreshed each step). */
  let hitAnchor = 0;
  const hitCounts = new Uint16Array(n);
  /**
   * The fish with the most others near it: in the thick of the school, and in its larger part when it
   * splits. Kept until another fish is clearly more central, so the target never flickers between two
   * halves of a school.
   */
  const pickHitAnchor = () => {
    hitCounts.fill(0);
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        if ((x[i] - x[j]) ** 2 + (z[i] - z[j]) ** 2 < HIT_STRAY * HIT_STRAY) { hitCounts[i]++; hitCounts[j]++; }
      }
    }
    let best = hitAnchor;
    for (let i = 0; i < n; i++) if (hitCounts[i] > hitCounts[best]) best = i;
    if (hitCounts[best] > hitCounts[hitAnchor] + 2) hitAnchor = best;
  };
  /** The mean position of the fish within HIT_STRAY of (sx, sz), written into `middle`. */
  const middle = { x: 0, y: 0, z: 0, count: 0 };
  const within = (i: number, sx: number, sz: number) => (pose.x[i] - sx) ** 2 + (pose.z[i] - sz) ** 2 <= HIT_STRAY * HIT_STRAY;
  const gather = (sx: number, sz: number) => {
    let count = 0, mx = 0, my = 0, mz = 0;
    for (let i = 0; i < n; i++) if (within(i, sx, sz)) { count++; mx += pose.x[i]; my += pose.y[i]; mz += pose.z[i]; }
    // Never empty: the anchor is within reach of both points gathered around (its own place, and a mean of fish within its reach).
    middle.x = mx / count; middle.y = my / count; middle.z = mz / count; middle.count = count;
  };
  const measureHitArea = () => {
    // The middle of the fish around the anchor, then of those around that: a step into the densest part.
    gather(pose.x[hitAnchor], pose.z[hitAnchor]);
    gather(middle.x, middle.z);
    const cx = middle.x, cy = middle.y, cz = middle.z;
    // Their spread as the camera shows it: a fish higher in the water appears farther up the screen.
    let xx = 0, xz = 0, zz = 0;
    for (let i = 0; i < n; i++) {
      if (!within(i, cx, cz)) continue;
      const dx = pose.x[i] - cx, dz = pose.z[i] - cz - (pose.y[i] - cy) * SLANT;
      xx += dx * dx; xz += dx * dz; zz += dz * dz;
    }
    xx /= middle.count; xz /= middle.count; zz /= middle.count;
    // Spread along the school and across it (their squares are mid ± half), and the longest spread's
    // direction as a heading (0 along +z, like the fish's).
    const mid = (xx + zz) / 2, half = Math.sqrt(((xx - zz) / 2) ** 2 + xz * xz);
    hitArea.x = cx; hitArea.y = cy; hitArea.z = cz;
    hitArea.heading = Math.PI / 2 - Math.atan2(2 * xz, xx - zz) / 2;
    hitArea.along = clamp(2 * Math.sqrt(mid + half) + T.hitPadding, T.hitSize[0], T.hitSize[1]);
    hitArea.across = clamp(2 * Math.sqrt(Math.max(0, mid - half)) + T.hitPadding, T.hitSize[0], T.hitSize[1]);
  };

  /** Animals near enough to matter this step (indices into the list passed to step()), and their headings' sine and cosine. */
  const near: number[] = [], nearHX: number[] = [], nearHZ: number[] = [];
  let time = 0, steps = 0;

  const frameA = { edge: 0, nx: 0, nz: 0 }, frameB = { edge: 0, nx: 0, nz: 0 }, frameFish = { edge: 0, nx: 0, nz: 0 };
  /** How far offshore the frame allows at (px, pz), along the shore's outward normal (nx, nz). */
  const frameLimit = (px: number, pz: number, distance: number, nx: number, nz: number) => {
    const edge = frameAt(px, pz, frameA, ocean.world).edge, outer = frameAt(px + nx * .5, pz + nz * .5, frameB, ocean.world).edge;
    return outer > edge + 1e-4 ? distance + (.95 - edge) * .5 / (outer - edge) : distance + 3;
  };

  /** The lead's course: roam along the coast at a drifting distance offshore, away from threats, clear of the island and frame. */
  function steerLead(dt: number, animals: readonly SchoolNeighbor[]) {
    const shift = apparentShift(lead.y - LEVEL);
    const px = lead.x, pz = lead.z + shift, hx = Math.sin(lead.heading), hz = Math.cos(lead.heading);
    const here = field.island(px, pz, ISLET_ALLOWANCE);
    const reach = .4 + lead.speed * 4;
    lead.shore = here.distance;
    // The water the school can use, here and a little ahead: from the inner fish's line to the frame.
    // Where that is narrower than the school, it slims into a stream along the middle.
    const coast = T.fishClearance + .2, limit = frameLimit(px, pz, here.distance, here.nx, here.nz);
    const ax = px + hx * reach * .8, az = pz + hz * reach * .8, ahead = field.island(ax, az, ISLET_ALLOWANCE);
    const room = Math.min(limit, frameLimit(ax, az, ahead.distance, ahead.nx, ahead.nz)) - coast;
    lead.squeeze += (clamp((room - .1) / (2 * T.shape[1]), .3, 1) - lead.squeeze) * ease(1, dt);
    const halfWidth = T.shape[1] * lead.squeeze, low = coast + halfWidth, high = Math.max(low, limit - halfWidth);
    // Roam: along the coast at a distance that drifts slowly, with a gentle wander so the path never repeats.
    const band = .5 + .5 * (.7 * Math.sin(time * TAU / 71 + seed * 3.1) + .3 * Math.sin(time * TAU / 29 + seed * 1.3));
    const target = clamp(T.roam[0] + (T.roam[1] + ocean.roam - T.roam[0]) * band, low, high);
    const radial = clamp((target - here.distance) * 1.1, -.6, .9);
    const wander = .32 * Math.sin(time * TAU / 23 + seed) + .2 * Math.sin(time * TAU / 57 + seed * 2.7);
    const tx = -here.nz * lead.direction, tz = here.nx * lead.direction;
    const rx = tx + radial * here.nx, rz = tz + radial * here.nz, c = Math.cos(wander), s = Math.sin(wander);
    let wx = rx * c + rz * s, wz = -rx * s + rz * c;
    if (arrival.entering) {
      // Swimming in: straight for the water it will roam.
      const dx = arrival.goalX - lead.x, dz = arrival.goalZ - lead.z, d = norm(dx, dz) || 1e-6;
      wx = dx / d * 1.3; wz = dz / d * 1.3;
    }
    // Island and islets: turn along the coast before the school's inner edge would reach the shore.
    const inner = low - .3;
    let threat = 0, nx = 0, nz = 0;
    for (let k = 0; k < LOOKS.length; k++) {
      const part = LOOKS[k], sample = field.island(px + hx * reach * part, pz + hz * reach * part, ISLET_ALLOWANCE);
      const closing = (here.distance - sample.distance) * lead.speed / (reach * part);
      if (closing <= 1e-3) continue;
      const urgency = smoothstep(7, 2, (here.distance - inner) / closing);
      threat = Math.max(threat, urgency);
      nx += sample.nx * urgency; nz += sample.nz * urgency;
    }
    const normal = norm(nx, nz) || 1;
    nx /= normal; nz /= normal;
    const slide = clamp((nx * hz - nz * hx) * 4, -1, 1);
    wx += (nx * 1.2 - nz * slide) * threat * 2.2; wz += (nz * 1.2 + nx * slide) * threat * 2.2;
    if (here.distance < inner) { const push = (inner - here.distance) * 6; wx += here.nx * push; wz += here.nz * push; }
    // Frame: keep the whole school in view.
    const edgeAhead = frameAt(px + hx * reach, pz + hz * reach, frameA, ocean.world), edgeHere = frameAt(px, pz, frameB, ocean.world);
    const skirtWeight = arrival.entering ? 0 : smoothstep(.86, .98, edgeAhead.edge) * 1.8;
    const back = arrival.entering ? 0 : smoothstep(.9, 1, edgeHere.edge) * 2 + Math.max(0, edgeHere.edge - 1) * 10;
    const skirt = Math.sign(edgeAhead.nx * hz - edgeAhead.nz * hx) || 1;
    wx += edgeAhead.nx * (skirtWeight * .8 + back) - edgeAhead.nz * skirt * skirtWeight;
    wz += edgeAhead.nz * (skirtWeight * .8 + back) + edgeAhead.nx * skirt * skirtWeight;
    // Threats: turn the whole school away, more firmly the closer and more dangerous they are. A
    // charge it cannot outswim: the school holds roughly to its course and the fish split around it.
    for (let m = 0; m < near.length; m++) {
      const a = animals[near[m]], reaction = SCHOOL_REACTIONS[a.model];
      if (!reaction.threat) {
        // A large animal in the way: the school swings round it (the bigger, the wider), though fish
        // may still split around it.
        const dx = lead.x - a.x, dz = lead.z - a.z, d = norm(dx, dz) || 1e-6;
        const weight = a.presence * smoothstep(a.halfLength + 1.8, a.halfLength + .5, d) * clamp(a.halfLength * a.halfWidth * 1.2, .15, 1);
        wx += dx / d * weight * .9; wz += dz / d * weight * .9;
        continue;
      }
      const dx = state.centerX - a.x, dz = state.centerZ - a.z, d = norm(dx, dz) || 1e-6;
      const weight = reaction.threat * a.presence * smoothstep(T.alertRadius + a.halfLength * .5, a.halfLength + .5, d) * (a.charging ? .6 : 1);
      // Out of its path as well as away: to whichever side of its heading the school already is.
      const ahx = Math.sin(a.heading), ahz = Math.cos(a.heading), lat = dx * ahz - dz * ahx;
      const sideways = (Math.abs(lat) > .1 ? Math.sign(lat) : lead.direction) * smoothstep(-1, .5, (dx * ahx + dz * ahz) / d);
      wx += (dx / d * .6 + ahz * sideways) * weight; wz += (dz / d * .6 - ahx * sideways) * weight;
    }
    // How far to turn; a half turn keeps to its side (out to sea) until it is done. One forced on the
    // school (by a threat, or water too narrow ahead) also reverses its way round, so it never loops.
    let change = wrapAngle(Math.atan2(wx, wz) - lead.heading);
    if (!lead.halfTurn && Math.abs(change) > 2.5) {
      lead.halfTurn = Math.sign(here.nx * hz - here.nz * hx) || 1;
      if (wx * tx + wz * tz < 0) { lead.direction *= -1; lead.nextReverse = Math.max(lead.nextReverse, time + T.reverseEvery * .5); }
    }
    if (lead.halfTurn && Math.sign(change) !== lead.halfTurn && Math.abs(change) > 1.8) change += lead.halfTurn * TAU;
    if (Math.abs(change) < 1.2) lead.halfTurn = 0;
    lead.want += (change - lead.want) * ease(2, dt);
  }

  function advanceLead(dt: number) {
    // A half turn (a reversal) is quicker and slower-paced, so it fits between the island and the frame.
    const rate = T.schoolTurnRate * (lead.halfTurn ? 2.2 : 1);
    const wanted = clamp(lead.want * 1.2, -rate, rate);
    lead.turn += (wanted - lead.turn) * ease(2.5, dt);
    lead.heading = wrapAngle(lead.heading + lead.turn * dt);
    lead.want -= lead.turn * dt;
    // Pace: a slow swing, quicker when alert; waits for stragglers, and cruises slowly while the school regroups.
    const settled = 1 - smoothstep(.3, 1, state.scare) * (1 - smoothstep(1, T.regroupTime, state.sinceScare));
    const lag = norm(lead.x - state.centerX, lead.z - state.centerZ) - T.shape[0] * .5;
    const target = T.cruiseSpeed * (1 + .08 * Math.sin(time * TAU / 31 + seed)) * (1 + .25 * state.alert)
      * (.6 + .4 * settled) * clamp(1.25 - lag * .45, .2, 1.1) * (lead.halfTurn ? .75 : 1);
    lead.speed += (target - lead.speed) * ease(1.2, dt);
    lead.x += Math.sin(lead.heading) * lead.speed * dt;
    lead.z += Math.cos(lead.heading) * lead.speed * dt;
    // Depth: slow rises and descents.
    lead.y = T.depth + T.depthRange * (.65 * Math.sin(time * TAU / 43 + seed * 5.3) + .35 * Math.sin(time * TAU / 101 + seed));
    // Record the trail every TRAIL_STEP of travel.
    sinceTrail += lead.speed * dt;
    while (sinceTrail >= TRAIL_STEP) {
      sinceTrail -= TRAIL_STEP;
      trailHead = (trailHead + TRAIL_POINTS - 1) % TRAIL_POINTS;
      const hx = Math.sin(lead.heading), hz = Math.cos(lead.heading);
      trailX[trailHead] = lead.x - hx * sinceTrail; trailZ[trailHead] = lead.z - hz * sinceTrail;
      trailHX[trailHead] = hx; trailHZ[trailHead] = hz;
    }
    // Now and then a broad turn the other way round the island, where there is room for it.
    if (time >= lead.nextReverse) {
      const shift = apparentShift(lead.y - LEVEL), shore = field.island(lead.x, lead.z + shift, ISLET_ALLOWANCE);
      // The U-turn swings out to sea: room for it and the school's width, short of the frame.
      if (state.mood === 'calm' && state.spread < 1.1 && shore.distance > T.roam[0] && frameAt(lead.x + shore.nx * 1.7, lead.z + shift + shore.nz * 1.7, frameA, ocean.world).edge < .97) {
        lead.direction *= -1;
        lead.reversals++;
        lead.nextReverse = time + T.reverseEvery * (.6 + .8 * variation(seed + 5, lead.reversals));
      } else lead.nextReverse = time + 5;
    }
  }

  /** Fish, one step: follow their places behind the lead, keep apart, match neighbors, and flee or avoid what is near. */
  function advanceFish(dt: number, animals: readonly SchoolNeighbor[]) {
    // How far the school still is from settled after its last scare (0 settled, up to 1 just after a bad one).
    const unsettled = smoothstep(.3, 1, state.scare) * (1 - smoothstep(1, T.regroupTime, state.sinceScare));
    // The school breathes: slowly tighter and looser; tighter when alert; loose after a scare, closing in as it regroups.
    const breathe = 1 + .14 * Math.sin(time * TAU / 47 + seed * 2.2);
    const looseness = breathe * (1 - .3 * state.alert) * (1 + .9 * unsettled);
    const R = T.separationRadius, R2 = R * R, A2 = (R * 2.2) ** 2;
    // Pairs: separation, neighbors' heading, and a startle that spreads from fish to fish.
    sepX.fill(0); sepY.fill(0); sepZ.fill(0); nbX.fill(0); nbZ.fill(0); nbCount.fill(0); spread.fill(0);
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const dx = x[j] - x[i], dz = z[j] - z[i], dy = (y[j] - y[i]) * 1.5;
        const d2 = dx * dx + dz * dz + dy * dy;
        if (d2 > A2) continue;
        nbX[i] += vx[j]; nbZ[i] += vz[j]; nbCount[i]++;
        nbX[j] += vx[i]; nbZ[j] += vz[i]; nbCount[j]++;
        if (panic[j] > spread[i]) spread[i] = panic[j];
        if (panic[i] > spread[j]) spread[j] = panic[i];
        if (d2 < R2) {
          const d = Math.sqrt(d2) || 1e-4, push = (1 - d / R) ** 2 / d;
          sepX[i] -= dx * push; sepZ[i] -= dz * push; sepY[i] -= dy * push * .4;
          sepX[j] += dx * push; sepZ[j] += dz * push; sepY[j] += dy * push * .4;
        }
      }
    }
    // The shore near each fish: a third of the school per step, and every step for fish close to it.
    for (let i = 0; i < n; i++) if (i % 3 === steps % 3 || shoreD[i] < T.fishClearance + .6) sampleShore(i);
    const floor = T.depth - T.depthRange - .3, ceiling = T.depth + T.depthRange + .25;
    for (let i = 0; i < n; i++) {
      if (i % 30 === steps % 30) {
        const drift = time * .05 + i * 1.7;
        driftA[i] = .05 * Math.sin(drift * 1.3 + seed); driftB[i] = .18 * Math.sin(drift * 1.9 + 2.1); driftC[i] = .35 * Math.sin(drift * 1.1 + 4.2);
      }
      // This fish's place: behind the lead along its trail, across it and above or below.
      const a = clamp(slotA[i] + driftA[i], .02, .98), b = slotB[i] + driftB[i], c = clamp(slotC[i] + driftC[i], -1.2, 1.2);
      const p = behind(a * T.shape[0] * (.75 + .25 * looseness) * (1 + .5 * (1 - lead.squeeze)));
      const width = T.shape[1] * lead.squeeze * looseness * Math.sin(Math.PI * (.1 + .8 * a));
      const slotX = p.x + p.hz * b * width, slotZ = p.z - p.hx * b * width;
      let targetX = slotX, targetZ = slotZ;
      // A straggler follows the lead's trail, which is clear water, instead of cutting straight across
      // (where an islet could be in the way): toward the trail point a little ahead of the nearest one.
      const off = norm(slotX - x[i], slotZ - z[i]);
      if (off > 1.2) {
        let best = Infinity, nearest = 0;
        for (let k = 0; k < TRAIL_POINTS; k += 3) {
          const t = trailAt(k), d = (trailX[t] - x[i]) ** 2 + (trailZ[t] - z[i]) ** 2;
          if (d < best) { best = d; nearest = k; }
        }
        const t = trailAt(Math.max(0, nearest - 6)), w = smoothstep(1.2, 2.2, off);
        targetX += (trailX[t] - targetX) * w; targetZ += (trailZ[t] - targetZ) * w;
      }
      const targetY = lead.y + c * T.shape[2] * looseness;
      // Where the school would have it: swimming with the school where it is going here, closing on its place.
      let sx = p.hx * lead.speed * T.alignmentStrength + (targetX - x[i]) * .9 * T.cohesionStrength;
      let sz = p.hz * lead.speed * T.alignmentStrength + (targetZ - z[i]) * .9 * T.cohesionStrength;
      const sy = (targetY - y[i]) * .8;
      // Far from its place, a fish hurries (up to about twice its cruising speed). Cut off from the school
      // (by the island or an islet), it swims back along the coast at the school's distance offshore: the
      // water is a ring, so this always leads back. It goes whichever way round meets the school sooner
      // (head-on if chasing it would take long) and sticks to it unless the other way becomes clearly
      // quicker, so a group never splits over the choice.
      const hurry = smoothstep(1.6, 3, off);
      if (off < 1.2) rejoin[i] = 0;
      const round = off > 1.6 ? wrapAngle(Math.atan2(slotZ, slotX) - Math.atan2(z[i], x[i])) : 0;
      if (Math.abs(round) > .4) {
        // How long each way would take, given the school's own travel round the island.
        const ahead = (round + TAU) % TAU, pace = .5 * lead.direction;
        const up = ahead / Math.max(.1, 1 - pace), down = (TAU - ahead) / (1 + pace);
        if (!rejoin[i] || (rejoin[i] > 0 ? down < up * .6 : up < down * .6)) rejoin[i] = up < down ? 1 : -1;
        const way = rejoin[i];
        // At the school's distance offshore, or the middle of the water where that is tight (an islet by the frame).
        const zi = z[i] + apparentShift(y[i] - LEVEL), middle = (T.fishClearance + .2 + frameLimit(x[i], zi, shoreD[i], shoreNX[i], shoreNZ[i])) / 2;
        const outward = clamp((Math.min(lead.shore, middle) - shoreD[i]) * .8, -.5, .5), w = smoothstep(1.6, 2.4, off);
        const swim = T.cruiseSpeed * (1.4 + .8 * hurry);
        const cx = (-shoreNZ[i] * way + shoreNX[i] * outward) * swim, cz = (shoreNX[i] * way + shoreNZ[i] * outward) * swim;
        sx += (cx - sx) * w; sz += (cz - sz) * w;
      }
      // Keep apart, match neighbors, and a little life of its own.
      let dx = sepX[i] * .5 + .04 * Math.sin(time * 1.3 + i * 2.9), dz = sepZ[i] * .5 + .04 * Math.cos(time * 1.1 + i * 4.1), dy = sepY[i] * .3;
      if (nbCount[i]) {
        dx += (nbX[i] / nbCount[i] - vx[i]) * .35 * T.alignmentStrength;
        dz += (nbZ[i] / nbCount[i] - vz[i]) * .35 * T.alignmentStrength;
      }
      // Large animals nearby: flow around their bodies (the school's place gives way inside one); threats
      // that come close, or charge, frighten.
      let fright = 0, yieldTo = 0;
      for (let m = 0; m < near.length; m++) {
        const o = animals[near[m]], reaction = SCHOOL_REACTIONS[o.model];
        if (o.presence < .05) continue;
        const ohx = nearHX[m], ohz = nearHZ[m];
        const rx = x[i] - o.x, rz = z[i] - o.z;
        // Along the animal's heading (ahead positive) and across it (its left positive).
        const lon = rx * ohx + rz * ohz, lat = rx * ohz - rz * ohx;
        // Body: keep `gap` from its footprint (more from threats), sliding round the nearer side. A
        // charge is different: the fish are caught by surprise and burst away at the last moment (below).
        const gap = reaction.gap + reaction.threat * .15 * o.presence;
        const ea = o.halfLength + gap * .7, eb = o.halfWidth + gap;
        const q = norm(lon / ea, lat / eb);
        if (q < 1.3 && !o.charging) {
          const w = smoothstep(1.3, .85, q) * o.presence, inside = smoothstep(1, .6, q) * o.presence, push = w * 1.4 + inside * 2.5;
          let gx = lon / (ea * ea), gz = lat / (eb * eb);
          const gl = norm(gx, gz) || 1;
          gx /= gl; gz /= gl;
          // Ahead of a large, harmless animal, slip round its side rather than being pushed along in front of it.
          if (!reaction.threat) gz += (Math.abs(lat) > .05 ? Math.sign(lat) : side[i]) * .8 * smoothstep(0, ea * .8, lon);
          dx += (gx * ohx + gz * ohz) * push; dz += (gx * ohz - gz * ohx) * push;
          dy += Math.sign(y[i] - o.y || side[i]) * (w * .12 + inside * .25);
          yieldTo = Math.max(yieldTo, inside);
        }
        if (!reaction.threat) continue;
        // A threat right alongside startles a little, even when it is only passing.
        fright = Math.max(fright, reaction.threat * (reaction.startle ?? .45) * smoothstep(1.05, .7, q) * o.presence);
        if (o.charging && o.presence > .3) {
          // A charge: flight for fish near the path it is about to take.
          const s = clamp(lon, -.4, o.speed * 1.1);
          const toPath = norm(rx - ohx * s, rz - ohz * s);
          fright = Math.max(fright, smoothstep(T.panicRadius, T.panicRadius * .35, toPath));
        }
      }
      const keep = (.08 + .92 * (1 - panic[i])) * (1 - .35 * unsettled) * (1 - .75 * yieldTo);
      dx += sx * keep; dz += sz * keep; dy += sy * keep;
      // Startle: rises quickly from a threat or from startled neighbors, fades once the danger has passed.
      const heard = Math.max(fright, spread[i] * .45);
      panic[i] = heard > panic[i] ? Math.min(heard, panic[i] + dt * 6) : Math.max(0, panic[i] - dt / T.panicFade);
      const scared = panic[i];
      if (scared > .02) {
        // Flee: to the side of the threat's path and away from it, keeping some momentum, with a
        // little scatter of its own and some use of depth.
        let fx = 0, fz = 0, fy = 0;
        for (let m = 0; m < near.length; m++) {
          const o = animals[near[m]], threat = SCHOOL_REACTIONS[o.model].threat;
          if (!threat) continue;
          const ohx = nearHX[m], ohz = nearHZ[m];
          const rx = x[i] - o.x, rz = z[i] - o.z, d = norm(rx, rz) || 1e-4;
          const lat = rx * ohz - rz * ohx;
          const sideways = Math.abs(lat) > .05 ? Math.sign(lat) : side[i];
          const weight = threat * o.presence * smoothstep(4, .5, d);
          fx += (ohz * sideways * 1.2 + rx / d * .3) * weight;
          fz += (-ohx * sideways * 1.2 + rz / d * .3) * weight;
          fy += Math.sign(y[i] - o.y + side[i] * .05) * .35 * weight;
        }
        const speedNow = norm(vx[i], vz[i]) || 1e-4;
        fx += vx[i] / speedNow * .45 + .25 * Math.sin(time * 3.1 + i * 1.3);
        fz += vz[i] / speedNow * .45 + .25 * Math.cos(time * 2.7 + i * 2.1);
        const fl = norm(fx, fz) || 1, flee = T.panicSpeed * pace[i] * scared;
        dx += fx / fl * flee; dz += fz / fl * flee; dy += fy * scared;
      }
      // Shore: the lead keeps the school off; this is each fish's safety net, starting early enough for
      // it to turn away even at full speed.
      const margin = T.fishClearance + .6 - shoreD[i];
      if (margin > 0) {
        const inward = dx * shoreNX[i] + dz * shoreNZ[i], firm = smoothstep(0, .3, margin);
        if (inward < 0) { dx -= inward * shoreNX[i] * firm; dz -= inward * shoreNZ[i] * firm; }
        dx += shoreNX[i] * margin * 5; dz += shoreNZ[i] * margin * 5;
      }
      // Frame: back into view. Depth: within the school's band, well below the surface.
      const w = ocean.world, ez = z[i] + apparentShift(y[i] - LEVEL), fu = x[i] * x[i] / (w.x * w.x), fv = ez * ez / (w.z * w.z);
      const edge = !arrival.entering && fu * fu * fu + fv * fv * fv > EDGE_TEST ? frameAt(x[i], ez, frameFish, w) : INSIDE;
      if (edge.edge > .92) {
        const outward = -(dx * edge.nx + dz * edge.nz), over = edge.edge - .92;
        if (outward > 0) { dx += outward * edge.nx * smoothstep(0, .05, over); dz += outward * edge.nz * smoothstep(0, .05, over); }
        dx += edge.nx * over * 16; dz += edge.nz * over * 16;
      }
      if (y[i] < floor) dy += (floor - y[i]) * 3;
      else if (y[i] > ceiling) dy -= (y[i] - ceiling) * 3;
      // Turn and speed toward that, within what a tuna can do (much more when fleeing).
      const want = norm(dx, dz);
      const top = Math.max(T.cruiseSpeed * (1.5 + .7 * hurry), T.cruiseSpeed * 1.5 + (T.panicSpeed - T.cruiseSpeed * 1.5) * scared) * pace[i];
      const goal = clamp(want, T.cruiseSpeed * .55 * pace[i], top);
      const speed = norm(vx[i], vz[i]);
      const accel = T.acceleration + (T.panicAcceleration - T.acceleration) * scared;
      const newSpeed = speed + clamp(goal - speed, -accel * dt, accel * dt);
      const current = Math.atan2(vx[i], vz[i]);
      const desired = want > 1e-4 ? Math.atan2(dx, dz) : current;
      const rate = T.turnRate + (T.panicTurnRate - T.turnRate) * scared;
      const delta = clamp(wrapAngle(desired - current), -rate * dt, rate * dt);
      const h = current + delta;
      turn[i] += (delta / dt - turn[i]) * ease(6, dt);
      vx[i] = Math.sin(h) * newSpeed; vz[i] = Math.cos(h) * newSpeed;
      vy[i] += clamp(clamp(dy, -.3, .3) - vy[i], -.9 * dt, .9 * dt);
      prevX[i] = x[i]; prevY[i] = y[i]; prevZ[i] = z[i]; prevHeading[i] = heading[i]; prevPhase[i] = phase[i];
      // Hard limits, whatever the steering: never into the shore or out of the frame. The fish slides
      // along while it turns away.
      let mx = vx[i] * dt, mz = vz[i] * dt;
      if (shoreD[i] < T.fishClearance + .1) {
        const into = mx * shoreNX[i] + mz * shoreNZ[i];
        if (into < 0) { mx -= into * shoreNX[i]; mz -= into * shoreNZ[i]; }
      }
      if (edge.edge > 1) {
        const out = -(mx * edge.nx + mz * edge.nz);
        if (out > 0) { mx += out * edge.nx; mz += out * edge.nz; }
      }
      x[i] += mx; z[i] += mz; y[i] += vy[i] * dt;
      heading[i] = wrapAngle(h);
      pitch[i] += (clamp(-vy[i] / Math.max(.2, newSpeed) * .9, -.35, .35) - pitch[i]) * ease(4, dt);
      // Tail: beats faster with speed, a little harder when accelerating or fleeing.
      phase[i] = (phase[i] + dt * TAU * T.tailBeat * (newSpeed / T.cruiseSpeed) ** .8 * (.96 + .08 * pace[i])) % PHASE_WRAP;
      amp[i] += ((.065 + .035 * scared + .05 * clamp((goal - speed) / .5, 0, 1)) - amp[i]) * ease(3, dt);
    }
  }

  /** Poses between the last two steps (t in 0..1), written into `pose`, and the tap target over them. */
  function publish(t: number) {
    for (let i = 0; i < n; i++) {
      pose.x[i] = prevX[i] + (x[i] - prevX[i]) * t;
      pose.y[i] = prevY[i] + (y[i] - prevY[i]) * t;
      pose.z[i] = prevZ[i] + (z[i] - prevZ[i]) * t;
      pose.heading[i] = prevHeading[i] + wrapAngle(heading[i] - prevHeading[i]) * t;
      pose.pitch[i] = pitch[i];
      pose.roll[i] = clamp(-turn[i] * .12, -.45, .45);
      pose.bend[i] = clamp(turn[i] * .07, -.22, .22);
      const beat = phase[i] - prevPhase[i];
      pose.phase[i] = prevPhase[i] + (beat < 0 ? beat + PHASE_WRAP : beat) * t;
      pose.amp[i] = amp[i];
    }
    measureHitArea();
  }
  // Where the fish start, for a first frame drawn before the school has stepped.
  pickHitAnchor();
  publish(1);

  return {
    size: n,
    state,
    pose,
    /** Per-fish length factors (renderer scale). */
    sizes,
    /** The point the school follows (for tuning overlays). */
    lead: lead as Readonly<typeof lead>,
    /** Where a tap selects the school, updated with each published pose (world units; see `hitArea` above). */
    hitArea: hitArea as Readonly<typeof hitArea>,
    /** One step of `dt` seconds among `animals`, the large animals as they are now. */
    step(dt: number, animals: readonly SchoolNeighbor[]) {
      if (arrival.held) return;
      time += dt;
      steps++;
      measure();
      if (arrival.entering && frameAt(state.centerX, state.centerZ + apparentShift(state.centerY - LEVEL), frameA, ocean.world).edge < .8) arrival.entering = false;
      // Only animals near enough to matter, judged once for the whole school.
      near.length = 0;
      let alert = 0;
      for (let k = 0; k < animals.length; k++) {
        const a = animals[k];
        const d = norm(a.x - state.centerX, a.z - state.centerZ);
        if (d > T.alertRadius + a.halfLength + state.spread || a.presence < .05) continue;
        nearHX[near.length] = Math.sin(a.heading); nearHZ[near.length] = Math.cos(a.heading);
        near.push(k);
        const reaction = SCHOOL_REACTIONS[a.model];
        if (reaction.threat) alert = Math.max(alert, reaction.threat * a.presence * smoothstep(T.alertRadius + a.halfLength, a.halfLength + .6, d) * (a.charging ? 1.5 : 1));
      }
      state.alert += (Math.min(1, alert) - state.alert) * ease(alert > state.alert ? 3 : .6, dt);
      // About once a second, if the lead is far ahead of its school, check whether it has left the school behind.
      if (steps % 30 === 0 && norm(lead.x - state.centerX, lead.z - state.centerZ) > T.shape[0] + 1) reseatLead();
      steerLead(dt, animals);
      advanceLead(dt);
      advanceFish(dt, animals);
      pickHitAnchor();
      let fear = 0;
      for (let i = 0; i < n; i++) fear = Math.max(fear, panic[i]);
      state.fear = fear;
      // Moods change with some hysteresis, so they never flicker at a threshold.
      const panicking = fear > (state.mood === 'panic' ? .3 : .5);
      state.sinceScare = panicking ? 0 : state.sinceScare + dt;
      state.scare = state.sinceScare >= T.regroupTime ? 0 : Math.max(state.scare, fear);
      state.mood = panicking ? 'panic' : state.sinceScare < T.regroupTime ? 'recover' : state.alert > (state.mood === 'alert' ? .12 : .25) ? 'alert' : 'calm';
    },
    /** Poses between the last two steps (t in 0..1), written into `pose`, and the tap target over them. */
    publish,
    /** The island's shape at a new level (it grows a little, and islets appear). */
    setField(next: ShoreField) { field = next; },
    /**
     * Wait out of sight: the lead at (x, z) heading along `heading`, the fish strung out behind it, still
     * until release(); then the school swims in toward (goalX, goalZ). Used while the scene isn't shown.
     */
    hold(at: { x: number; z: number; heading: number; goalX: number; goalZ: number }) {
      lead.x = at.x; lead.z = at.z; lead.heading = at.heading; lead.turn = 0; lead.want = 0; lead.halfTurn = 0; lead.speed = T.cruiseSpeed;
      trailHead = 0; sinceTrail = 0;
      for (let k = 0; k < TRAIL_POINTS; k++) {
        trailX[k] = lead.x - Math.sin(lead.heading) * TRAIL_STEP * k; trailZ[k] = lead.z - Math.cos(lead.heading) * TRAIL_STEP * k;
        trailHX[k] = Math.sin(lead.heading); trailHZ[k] = Math.cos(lead.heading);
      }
      for (let i = 0; i < n; i++) { panic[i] = 0; rejoin[i] = 0; }
      placeFish();
      measure();
      publish(1);
      arrival.held = true; arrival.entering = true; arrival.goalX = at.goalX; arrival.goalZ = at.goalZ;
    },
    /** Let a held school swim in. */
    release() { arrival.held = false; },
    /** 'held' out of sight, 'entering', or null once it swims like any day. */
    get arriving(): 'held' | 'entering' | null { return arrival.held ? 'held' : arrival.entering ? 'entering' : null; },
  };
}
export type TunaSchool = ReturnType<typeof createTunaSchool>;
