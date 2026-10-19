/**
 * Humpback whale (Megaptera novaeangliae): a stout body, deepest a third of the way back; a broad,
 * flat head studded with knobs (tubercles) along the rostrum and the tip of the lower jaw, the long
 * mouth line arching back to below the eye; a white throat and belly furrowed with long pleats from
 * the chin to the navel; enormous flippers a third of the body long, white, their leading edge
 * scalloped with knobs; a small dorsal fin on a hump two thirds of the way back; a deep, narrow tail
 * stock and broad flukes, black above, white below with black margins and blotches, their trailing
 * edge serrated, with a notch at the middle. Slate black above, the flanks a shade lighter.
 */
import { Vector3 } from 'three';
import { SWIM_RIGS, type CetaceanRig } from '../../../src/lib/marine-rigs';
import { blendSkins, fin, hex, mix, noise, smoothstep, TAU, type RGB } from './kit';
import { sharkContext, type SharkDesign } from './shark';

const BACK = hex('#262b31'), FLANK = hex('#3a4148'), BELLY = hex('#e9ebe9'), PLEAT = hex('#8d969c');
const KNOB = hex('#1b1f24'), EYE = hex('#060708'), BLOWHOLE = hex('#15181c'), MOUTH = hex('#14171a');
const FLIPPER = hex('#eef0ee'), FLUKE_UNDER = hex('#e4e6e4');

const rig = SWIM_RIGS['humpback-whale'] as CetaceanRig;

/** Angle from the dorsal midline where the white belly begins: widest under the throat, narrowing behind the navel. */
const bellyEdge = (s: number) => 1.98 - .22 * smoothstep(.06, .24, s) + .62 * smoothstep(.46, .72, s);

function skinColor(s: number, theta: number, p: Vector3): RGB {
  // The edge of the white is ragged, as on real humpbacks; the dark of the back fades a little down the flanks.
  const ragged = .13 * noise(p.z * 9 + p.y * 3, 4) + .06 * noise(p.z * 17 + p.x * 5, 7);
  const white = smoothstep(bellyEdge(s) - .1, bellyEdge(s) + .1, theta + ragged);
  const flank = mix(BACK, FLANK, smoothstep(.5, 1.55, theta));
  // Pale mottling on the lower jaw and the chin.
  const chin = s < .2 && theta > 1.62 ? .55 * smoothstep(.25, .75, noise(p.z * 70 + p.x * 23, 9)) * (1 - smoothstep(.12, .2, s)) : 0;
  return mix(mix(flank, BELLY, white), BELLY, chin);
}

export const HUMPBACK_WHALE: SharkDesign = {
  rig, nose: .43, bodyEnd: .9, frontDome: .008,
  // A broad, rounded rostrum seen from above; the body fullest a third of the way back; a deep, narrow tail stock.
  width: [[0, 0], [.008, .022], [.02, .04], [.04, .057], [.07, .073], [.1, .085], [.15, .098], [.2, .108], [.27, .116], [.34, .118], [.42, .114], [.5, .103], [.58, .087], [.65, .069], [.71, .052], [.77, .037], [.82, .026], [.86, .019], [.9, .015]],
  // The head's top runs flat and low to the blowholes, the back swells behind them, with a hump under the dorsal fin.
  top: [[0, 0], [.008, .012], [.03, .022], [.06, .032], [.1, .045], [.14, .058], [.18, .074], [.22, .09], [.28, .105], [.36, .114], [.45, .114], [.54, .106], [.6, .1], [.64, .104], [.68, .097], [.73, .083], [.78, .07], [.83, .058], [.87, .046], [.9, .036]],
  // A deep, pleated throat that hangs below the jaw line.
  bottom: [[0, 0], [.008, .014], [.03, .028], [.06, .045], [.1, .064], [.15, .086], [.2, .106], [.26, .12], [.33, .13], [.4, .13], [.48, .12], [.56, .104], [.63, .086], [.7, .068], [.76, .054], [.82, .042], [.86, .034], [.9, .026]],
  center: [[0, -.012], [.1, -.008], [.25, -.002], [.4, 0], [.7, .006], [.9, .009]],
  squareTop: [[0, 2], [.2, 2], [.6, 2], [.75, 1.8], [.9, 1.6]],
  squareBottom: [[0, 2], [.15, 2.15], [.45, 2.1], [.7, 1.85], [.9, 1.6]],
  rings: 48, columnsAbove: 8, columnsBelow: 8,
  boundary: bellyEdge, boundaryGap: .1,
  paint: skinColor,
};

/** Half the fluke span, and how far back its tips reach (body lengths). */
const FLUKE = .165, FLUKE_TIP = .008;
/** The flipper's length and its chord at the root (body lengths). */
const FLIPPER_SPAN = .3, FLIPPER_CHORD = .072;

export function buildHumpbackWhale() {
  const ctx = sharkContext(HUMPBACK_WHALE);
  const { mesh, bones, z } = ctx;
  ctx.body();

  // A small dorsal fin on the hump, its tip swept back.
  ctx.midlineFin({
    le: [[-.01, .608], [0, .612], [.01, .622], [.02, .636], [.028, .652], [.033, .664]],
    te: [[-.01, .686], [0, .684], [.012, .676], [.022, .67], [.03, .666], [.033, .664]],
    height: .033, thickness: .013, color: (_p, v) => mix(BACK, KNOB, .3 * v),
  });

  // The long flippers: narrow blades a third of the body long, the leading edge scalloped with knobs, the tip rounded.
  // Their outline is drawn densely so the knobs show: [span, offset back from the root's leading edge].
  const steps = 64;
  const spans = Array.from({ length: steps + 1 }, (_, i) => -.012 + (FLIPPER_SPAN + .012) * i / steps);
  const sweep = (b: number) => .16 * Math.max(0, b) + .48 * Math.max(0, b) ** 2;
  const chord = (b: number) => FLIPPER_CHORD * Math.sqrt(Math.max(0, 1 - (Math.max(0, b) / (FLIPPER_SPAN + .002)) ** 2.4));
  const knob = (b: number) => (b < .03 ? 0 : .0062 * Math.max(0, Math.sin(Math.PI * (b - .03) / .026)) ** 2 * (1 - .4 * b / FLIPPER_SPAN));
  const flippers = ctx.pairedFin({
    rootS: .265, theta: 2.02, span: FLIPPER_SPAN, droop: .32, sweep: .32, thickness: .018, stations: 40,
    le: spans.map((b) => [b, sweep(b) - knob(b)] as const),
    te: spans.map((b) => [b, sweep(b) + chord(b)] as const),
    bone: (left) => (left ? 'PectoralL' : 'PectoralR'),
    color: (p, v, _u, _left, face) => {
      // White, the upper face darkening toward the root and mottled with the back's colour.
      if (face < 0) return mix(FLIPPER, PLEAT, .12 * (1 - v));
      const dark = (1 - smoothstep(.12, .42, v)) * (.75 + .25 * noise(p.z * 60 + p.x * 30, 5));
      return mix(FLIPPER, FLANK, Math.max(0, dark));
    },
  });

  // Broad flukes, one blade from tip to tip: the leading edge sweeps back to pointed tips, the trailing edge
  // curves in an S to a notch at the middle and is serrated along its outer reaches.
  const tipS = .985;
  const lead = (a: number) => .868 + .095 * (a / FLUKE) ** 1.5;
  const trail = (a: number) => {
    const t = a / FLUKE;
    const serration = t > .18 ? .0045 * Math.max(0, Math.sin(Math.PI * a / .011)) ** 6 * smoothstep(.18, .3, t) : 0;
    return .948 - .006 * Math.sin(Math.PI * t) + .03 * t ** 2.2 - .014 * Math.exp(-((a / .011) ** 2)) + serration;
  };
  const margins = (a: number) => {
    const inner = FLUKE - FLUKE_TIP;
    const round = a <= inner ? 1 : Math.sqrt(Math.max(0, 1 - ((a - inner) / FLUKE_TIP) ** 2));
    return { le: tipS - (tipS - lead(a)) * round, te: tipS + (trail(a) - tipS) * round };
  };
  const across = (v: number) => FLUKE * (1 - 2 * v);
  const flukeY = ctx.center(.9);
  fin(mesh, {
    stations: 58, rootPoint: true, chordPoints: 7,
    le: (v) => { const x = across(v), a = Math.abs(x); return new Vector3(x, flukeY, z(margins(a).le)); },
    te: (v) => { const x = across(v), a = Math.abs(x); return new Vector3(x, flukeY, z(margins(a).te)); },
    thickness: (v) => .006 + .02 * Math.max(0, 1 - Math.abs(across(v)) / FLUKE) ** 1.3,
    side: new Vector3(0, 1, 0),
    color: (p, _v, u, face) => {
      if (face > 0) return mix(BACK, KNOB, .2 + .2 * u);
      // Underneath: white, with a black trailing margin and the blotches that tell humpbacks apart.
      const blotch = smoothstep(.55, .85, noise(p.x * 38 + 3.1, 2) + .6 * noise(p.z * 52 - p.x * 9, 6));
      const margin = smoothstep(.8, .95, u) + smoothstep(.82, .97, Math.abs(p.x) / FLUKE);
      return mix(FLUKE_UNDER, BACK, Math.min(1, .75 * blotch + margin));
    },
    skin: (p) => blendSkins({ Tail: 1 }, { [p.x >= 0 ? 'FlukeL' : 'FlukeR']: 1 }, smoothstep(.04, .12, Math.abs(p.x))),
  });

  // The throat pleats: long furrows from the chin to the navel, converging toward the chin.
  for (const side of [1, -1]) {
    for (let i = 0; i < 7; i++) {
      const base = Math.PI - (i + .5) * .15;
      const from = .035 + .012 * i, to = .47 - .03 * i;
      const line = Array.from({ length: 12 }, (_, j) => {
        const t = j / 11;
        return [from + (to - from) * t, side * (base - .1 * (1 - t) * (i / 7))] as const;
      });
      ctx.ribbon(line, (t) => .0013 * (.5 + .5 * Math.sin(Math.PI * t)), PLEAT);
    }
  }

  // The mouth's long line, arching up from the snout and down to its corner below the eye.
  for (const side of [1, -1]) {
    ctx.ribbon([[.004, 1.42], [.03, 1.38], [.07, 1.36], [.11, 1.38], [.15, 1.43], [.19, 1.5], [.22, 1.58], [.235, 1.66]].map(([s, theta]) => [s, side * theta] as const),
      (t) => .0018 * (.6 + .4 * Math.sin(Math.PI * t)), MOUTH);
  }
  ctx.eyes({ s: .222, theta: 1.5, radius: .0058, color: EYE, sink: .35 });
  // Twin blowholes behind a low splash guard.
  for (const side of [1, -1]) ctx.spot(.165, side * .07, .0058, BLOWHOLE, .4);

  // Knobs: rows along the rostrum, and a cluster on the tip of the lower jaw. Each a low dome (six sides).
  const knobAt = (s: number, theta: number, radius: number) => {
    const n = ctx.normal(s, theta), skin = ctx.skin(s);
    const t1 = new Vector3(0, 0, 1).cross(n).normalize(), t2 = n.clone().cross(t1);
    const base = ctx.surface(s, theta, -.3 * radius);
    mesh.begin();
    const apex = mesh.vertex(base.clone().addScaledVector(n, radius * 1.05), KNOB, skin);
    const ring = (lift: number, spread: number) => Array.from({ length: 6 }, (_, i) => {
      const a = TAU * i / 6;
      return mesh.vertex(base.clone().addScaledVector(n, lift * radius).addScaledVector(t1, Math.cos(a) * spread * radius).addScaledVector(t2, Math.sin(a) * spread * radius), KNOB, skin);
    });
    const upper = ring(.75, .62), lower = ring(0, 1);
    for (let i = 0; i < 6; i++) {
      const j = (i + 1) % 6;
      mesh.tri(apex, upper[i], upper[j]);
      mesh.quad(upper[i], lower[i], lower[j], upper[j]);
    }
    mesh.end();
  };
  for (const [s, theta] of [[.022, 0], [.05, 0], [.08, 0], [.11, 0], [.035, .32], [.07, .36], [.105, .4], [.035, -.32], [.07, -.36], [.105, -.4], [.055, .7], [.095, .78], [.055, -.7], [.095, -.78]] as const) {
    knobAt(s, theta, .0052 + .0012 * noise(s * 80 + theta * 9, 3));
  }
  for (const [s, theta] of [[.016, 2.72], [.016, -2.72], [.026, Math.PI]] as const) knobAt(s, theta, .0045);

  ctx.spineBones();
  const flukeTip = (side: number) => new Vector3(side * .06, flukeY, z(.93));
  bones.push(
    { name: 'FlukeL', parent: 'Tail', position: flukeTip(1) },
    { name: 'FlukeR', parent: 'Tail', position: flukeTip(-1) },
    { name: 'PectoralL', parent: 'Root', position: flippers[0] },
    { name: 'PectoralR', parent: 'Root', position: flippers[1] },
  );
  return { mesh, bones };
}
