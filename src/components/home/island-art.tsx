import { memo, useId, type ReactElement } from 'react';
import Svg, { Circle, Defs, Ellipse, G, LinearGradient, Path, RadialGradient, Stop } from 'react-native-svg';
import { HABITATS, type Habitat } from '@/lib/home';
import { OCEAN } from '@/lib/ocean';

/*
 * The 2D island pictures (Home's fallback scene, the Islands rewards, the Archipelago share card):
 * each of the archipelago's islands drawn as a hand-tinted field-guide print, flat washes of colour
 * under a thin ink line, plain SVG paths only. Every island has a silhouette of its own, so a stranger
 * can tell them apart at thumbnail size (docs/rewards.md): the Coral Reef a cay ringed by surf, the
 * Kelp Forest a grey headland with sea stacks among floating kelp, the Volcanic Pinnacle a black cone
 * with a plume of steam, the Mangroves & Seagrass a low green fringe on prop roots, the Shipwreck a
 * white crescent with a red-banded lighthouse and a broken steamer. `level` adds detail the way the
 * 3D islands grow (docs/archipelago.md): more coral, trees and rocks, a wider shelf, then two islets.
 */

type Pt = readonly [number, number];

const r1 = (v: number) => Math.round(v * 10) / 10;
const at = ([x, y]: Pt) => `${r1(x)} ${r1(y)}`;

/** Small deterministic random numbers: an island is drawn the same every time. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A smooth path through the points (Catmull-Rom as cubic Béziers), open or closed. */
function curve(pts: readonly Pt[], closed = false): string {
  const n = pts.length;
  const get = (i: number): Pt => (closed ? pts[(i + n) % n] : pts[Math.max(0, Math.min(n - 1, i))]);
  let d = `M${at(pts[0])}`;
  for (let i = 0; i < (closed ? n : n - 1); i++) {
    const [p0, p1, p2, p3] = [get(i - 1), get(i), get(i + 1), get(i + 2)];
    d += `C${r1(p1[0] + (p2[0] - p0[0]) / 6)} ${r1(p1[1] + (p2[1] - p0[1]) / 6)} ${r1(p2[0] - (p3[0] - p1[0]) / 6)} ${r1(p2[1] - (p3[1] - p1[1]) / 6)} ${at(p2)}`;
  }
  return closed ? `${d}Z` : d;
}

/** A lumpy ellipse, like a blot of wash: a crown of leaves, a coral head, a patch of weed. */
function blob(cx: number, cy: number, rx: number, ry: number, seed: number, lumps = 9, wobble = .14): string {
  const rand = rng(seed);
  const pts: Pt[] = [];
  for (let i = 0; i < lumps; i++) {
    const a = (i / lumps) * Math.PI * 2;
    const k = 1 + (rand() - .5) * 2 * wobble;
    pts.push([cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k]);
  }
  return curve(pts, true);
}

/** Straight-edged: rock, columns, planks. */
const poly = (pts: readonly Pt[], dx = 0, dy = 0) => `M${pts.map(([x, y]) => `${r1(x + dx)} ${r1(y + dy)}`).join('L')}Z`;

const rgb = (c: string) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
const mix = (a: string, b: string, t: number) => {
  const [x, y] = [rgb(a), rgb(b)];
  return `#${x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join('')}`;
};
const lighten = (c: string, t: number) => mix(c, '#FFFFFF', t);
const darken = (c: string, t: number) => mix(c, '#1D2B45', t);

/** The thin ink line of a field-guide print (design.md): soft enough to sit under the washes. */
const INK = '#2F4756';
const OUTLINE = { stroke: INK, strokeWidth: 1.25, strokeOpacity: .55, strokeLinejoin: 'round', strokeLinecap: 'round' } as const;
const FOAM = '#FFFFFF';

/** Faint ticks of white water, in the corners of every island's sea. */
const GLINTS = 'M37 100 Q46 103 55 100 M312 76 Q324 79 336 76 M348 284 Q361 287 375 284 M61 308 Q70 311 79 308 M141 48 Q150 51 159 48 M306 339 Q317 342 328 339';

type Art = { id: string; level: number };

function Glints({ color = FOAM }: { color?: string }) {
  return <G fill="none" stroke={color} strokeWidth="1.3" opacity=".35" strokeLinecap="round"><Path d={GLINTS} /></G>;
}

/** The sea around an island: a soft pool of its own colour, fading into whatever water the page gives it. */
function Pool({ id, cx, cy, rx, ry, color, strength = .55, peak = .72 }: { id: string; cx: number; cy: number; rx: number; ry: number; color: string; strength?: number; peak?: number }) {
  return <>
    <Defs>
      <RadialGradient id={id} cx={.5} cy={.5} rx={.5} ry={.5}>
        <Stop offset={0} stopColor={color} stopOpacity={strength * .35} />
        <Stop offset={peak} stopColor={color} stopOpacity={strength} />
        <Stop offset={1} stopColor={color} stopOpacity={0} />
      </RadialGradient>
    </Defs>
    <Ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill={`url(#${id})`} />
  </>;
}

/** A tree's crown: a lumpy wash with the sunlit top (the sun is to the left, as in the 3D scene) lighter. */
function Crown({ x, y, r, tone, seed, squash = .86, lift = .4 }: { x: number; y: number; r: number; tone: string; seed: number; squash?: number; lift?: number }) {
  return <G>
    <Path d={blob(x, y, r, r * squash, seed, 8, .12)} fill={tone} />
    <Path d={blob(x - r * .22, y - r * lift, r * .62, r * .45, seed + 7, 7, .15)} fill={mix(tone, '#F2EFB4', .42)} opacity=".6" />
  </G>;
}

function Palm({ x, y, scale = 1 }: { x: number; y: number; scale?: number }) {
  return <G transform={`translate(${x} ${y}) scale(${scale})`}>
    <Ellipse cx="15" cy="23" rx="24" ry="5" fill="#7C9470" opacity=".16" transform="rotate(-20)" />
    <Path d="M0 24 Q8 0 2 -21" stroke="#A88C61" strokeWidth="5" fill="none" strokeLinecap="round" />
    <Path d="M2 -22 Q-23 -42 -34 -15 Q-14 -25 2 -22Z" fill="#4D896D" />
    <Path d="M2 -22 Q-22 -18 -24 0 Q-12 -13 2 -22Z" fill="#6F9E75" />
    <Path d="M2 -22 Q-5 -48 14 -48 Q9 -32 2 -22Z" fill="#79A67B" />
    <Path d="M2 -22 Q30 -45 39 -19 Q19 -28 2 -22Z" fill="#548E6C" />
    <Path d="M2 -22 Q34 -18 28 4 Q18 -12 2 -22Z" fill="#3D7D62" />
    <Circle cx="2" cy="-20" r="3" fill="#A08B58" />
  </G>;
}

const SAND_LIGHT = '#F7EED3';
const SAND_DARK = '#E3D5B3';

/* ------------------------------------------------------------------------------------------------
 * The Coral Reef: a forested cay in a turquoise lagoon, inside a ring of reef where the swell breaks.
 * ---------------------------------------------------------------------------------------------- */

const REEF = { x: 211, y: 207, rx: 146, ry: 91 };
/** Coral heads in the lagoon: x, y, radius, tone. Level 1 shows the first five, level 2 eight, level 3 all. */
const HEADS: readonly (readonly [number, number, number, number])[] = [
  [140, 236, 9, 0], [280, 242, 10, 1], [248, 254, 7, 2], [162, 256, 8, 1], [122, 206, 7, 2],
  [304, 206, 8, 0], [284, 164, 7, 1], [136, 168, 7, 2], [226, 138, 6, 0], [192, 260, 6, 0], [318, 232, 6, 2], [108, 230, 6, 1],
];
const HEAD_TONES = ['#78A58E', '#BF8F7A', '#C9A06E'];
/** The forest on the cay: x, y, radius, tone, from back to front. */
const FOREST: readonly (readonly [number, number, number, number])[] = [
  [212, 184, 15, 2], [194, 188, 14, 1], [232, 189, 14, 0], [178, 196, 13, 0], [250, 197, 12, 1], [203, 195, 15, 0], [222, 197, 14, 2],
  [188, 204, 12, 1], [240, 205, 11, 0], [209, 206, 13, 1], [172, 209, 9, 2], [227, 209, 10, 1],
];
const FOREST_TONES = ['#3F7F62', '#4F8E6E', '#6F9E75', '#86AC76'];

function reefPoint(deg: number, grow = 0): Pt {
  const t = (deg * Math.PI) / 180;
  const k = 1 + .035 * Math.sin(3 * t + 1) + .025 * Math.sin(5 * t + 2);
  return [REEF.x + (REEF.rx + grow) * k * Math.cos(t), REEF.y + (REEF.ry + grow * .64) * k * Math.sin(t)];
}
/** An arc of the reef crest, from one degree to another (clockwise on screen, 90 is straight down). */
function reefArc(from: number, to: number, grow = 0, step = 12): string {
  const pts: Pt[] = [];
  for (let a = from; a < to; a += step) pts.push(reefPoint(a, grow));
  pts.push(reefPoint(to, grow));
  return curve(pts);
}

function CoralCay({ id, level, habitat }: Art & { habitat: 'island' | 'lagoon' }) {
  const p = OCEAN.palettes[habitat];
  const sea = `${id}-reefsea`;
  const lagoon = `${id}-lagoon`;
  const sand = `${id}-cay`;
  const heads = HEADS.slice(0, level >= 3 ? 12 : level >= 2 ? 8 : 5);
  const trees = level >= 3 ? FOREST : FOREST.slice(0, 10);
  return <>
    <Defs>
      <RadialGradient id={sea} cx={.5} cy={.5} rx={.5} ry={.5}>
        <Stop offset={0} stopColor={p.mid} stopOpacity={0} />
        <Stop offset={.5} stopColor={p.mid} stopOpacity={.25} />
        <Stop offset={.84} stopColor={p.deep} stopOpacity={.62} />
        <Stop offset={1} stopColor={p.deep} stopOpacity={0} />
      </RadialGradient>
      <RadialGradient id={lagoon} cx={.5} cy={.5} rx={.5} ry={.5}>
        <Stop offset={0} stopColor="#E3F6EA" />
        <Stop offset={.34} stopColor="#A4E8DB" />
        <Stop offset={.74} stopColor="#58D5C9" />
        <Stop offset={1} stopColor="#3DBFC0" />
      </RadialGradient>
      <LinearGradient id={sand} x1={0} y1={0} x2={.8} y2={1}><Stop offset={0} stopColor="#FBF4DD" /><Stop offset={1} stopColor={SAND_DARK} /></LinearGradient>
    </Defs>
    <Ellipse cx={REEF.x} cy={REEF.y + 6} rx={level >= 3 ? 192 : 182} ry={level >= 3 ? 136 : 128} fill={`url(#${sea})`} />
    <Path d={blob(REEF.x, REEF.y, REEF.rx - 4, REEF.ry - 3, 5, 14, .03)} fill={`url(#${lagoon})`} />
    <Path d={blob(211, 212, 100, 54, 11, 10, .08)} fill="#F4EDCF" opacity=".72" />
    <Path d={blob(211, 212, 82, 43, 12, 9, .07)} fill="#FBF6E2" opacity=".7" />
    {/* the reef crest, with a pass through it to the south-east and the north-west, and surf on its outer edge */}
    <G fill="none" strokeLinecap="round">
      <Path d={reefArc(60, 222)} stroke="#B2C497" strokeWidth="15" opacity=".92" />
      <Path d={reefArc(250, 408)} stroke="#B2C497" strokeWidth="15" opacity=".92" />
      <Path d={reefArc(62, 220, -5)} stroke="#E6F5E4" strokeWidth="3.2" opacity=".7" />
      <Path d={reefArc(252, 406, -5)} stroke="#E6F5E4" strokeWidth="3.2" opacity=".7" />
      <Path d={reefArc(60, 222, 9)} stroke={FOAM} strokeWidth="3.8" strokeDasharray="24 7 10 6 32 9 13 8" opacity=".92" />
      <Path d={reefArc(250, 408, 9)} stroke={FOAM} strokeWidth="3.8" strokeDasharray="30 8 12 7 22 6 16 9" opacity=".92" />
      <Path d={reefArc(60, 222, 16)} stroke={FOAM} strokeWidth="1.8" strokeDasharray="10 12 22 9 6 14" opacity=".55" />
      <Path d={reefArc(250, 408, 16)} stroke={FOAM} strokeWidth="1.8" strokeDasharray="14 10 8 13 26 9" opacity=".55" />
      <Path d={reefArc(60, 222, 1)} stroke="#D6A98B" strokeWidth="3" strokeDasharray="3 9 5 12 2 8" opacity=".55" />
      <Path d={reefArc(250, 408, 1)} stroke="#D6A98B" strokeWidth="3" strokeDasharray="4 8 2 11 5 9" opacity=".55" />
    </G>
    {/* coral heads in the lagoon: dark washes of coral seen through the clear water */}
    {heads.map(([x, y, r, tone], i) => <G key={i}>
      <Path d={blob(x, y + 2, r * 1.15, r * .72, 30 + i, 7, .16)} fill="#4E8E8E" opacity=".28" />
      <Path d={blob(x, y, r, r * .66, 40 + i, 10, .2)} fill={HEAD_TONES[tone]} opacity=".92" />
      <Path d={blob(x - r * .2, y - r * .2, r * .56, r * .3, 50 + i, 8, .2)} fill={lighten(HEAD_TONES[tone], .5)} opacity=".6" />
    </G>)}
    {level >= 3 && <G fill="none" stroke="#C99A86" strokeWidth="2.6" strokeLinecap="round">
      <Path d="M262 134 l-3 -9 M262 134 l4 -9 M262 134 l-8 -4 M262 134 l9 -3" />
      <Path d="M150 270 l-3 -8 M150 270 l4 -9 M150 270 l-8 -3" />
    </G>}
    {/* the cay */}
    <Path d={blob(211, 211, 76, 38, 3, 9, .06)} fill="#DCCFA8" opacity=".9" />
    <Path d={blob(211, 208, 72, 35, 3, 9, .06)} fill={`url(#${sand})`} />
    <Path d={blob(211, 208, 72, 35, 3, 9, .06)} fill="none" stroke={FOAM} strokeWidth="2.2" opacity=".55" />
    <Path d={blob(212, 199, 56, 24, 8, 9, .1)} fill="#8BAA80" opacity=".7" />
    {trees.map(([x, y, r, tone], i) => <Crown key={i} x={x} y={y} r={r} tone={FOREST_TONES[tone]} seed={60 + i} />)}
    <Path d="M168 212 q8 -5 14 -2 M236 214 q10 -5 17 -9" fill="none" stroke="#9DB59A" strokeWidth="3.2" strokeLinecap="round" opacity=".8" />
    <Palm x={198} y={200} scale={.95} />
    <Palm x={242} y={208} scale={.78} />
    <Palm x={170} y={212} scale={.62} />
    {level >= 4 && <><Palm x={222} y={192} scale={.66} /><Palm x={256} y={202} scale={.55} /></>}
    {/* the jetty to the dive boat moored off the north shore */}
    <G>
      <Path d="M246 183 L260 155" stroke="#2F6F78" strokeWidth="6" strokeLinecap="round" opacity=".18" transform="translate(3 3)" />
      <Path d="M246 183 L260 155" stroke="#8C6F4F" strokeWidth="4.6" />
      <Path d="M246 183 L260 155" stroke="#D2B88E" strokeWidth="1.3" strokeDasharray="1.8 2.4" />
      <Path d="M256 149 q0 7 8 8 h14 q6 -2 6 -8z" fill="#FBFBF5" {...OUTLINE} />
      <Path d="M257 152 h26" stroke="#3E7DB8" strokeWidth="1.8" />
      <Path d="M265 149 v-4 h9 v4z" fill="#EAE2CC" {...OUTLINE} />
    </G>
  </>;
}

/** A little cay of sand with a palm, for the islets that rise as the level grows. */
function SandIslet({ id, x, y, scale = 1, grass = false }: { id: string; x: number; y: number; scale?: number; grass?: boolean }) {
  return <G transform={`translate(${x} ${y}) scale(${scale}) translate(-${x} -${y})`}>
    <Ellipse cx={x} cy={y + 1} rx="39" ry="23" fill="#D9EDDD" opacity=".6" />
    <Ellipse cx={x} cy={y} rx="27" ry="15" fill={`url(#${id})`} />
    {grass ? <Path d={`M${x - 8} ${y - 2} q2 -9 4 -2 M${x + 2} ${y - 3} q3 -10 5 -1 M${x + 10} ${y + 1} q1 -7 4 -1`} fill="none" stroke="#8A9B5A" strokeWidth="1.6" strokeLinecap="round" /> : null}
    <Palm x={x - 1} y={y - 4} scale={.47} />
  </G>;
}

/* ------------------------------------------------------------------------------------------------
 * The Kelp Forest: a cold, rocky headland with sea stacks, in dark green water among floating kelp.
 * ---------------------------------------------------------------------------------------------- */

/** The headland's outline: a long ridge running east to west, a bay biting into the south side between two points. */
const HEADLAND: readonly Pt[] = [
  [92, 226], [100, 204], [122, 186], [152, 171], [186, 158], [224, 152], [262, 158], [294, 170], [320, 188], [332, 210],
  [318, 228], [296, 224], [276, 208], [250, 201], [224, 205], [204, 218], [186, 234], [158, 244], [128, 244], [104, 238],
];

/** A sea stack: a tall, rough tower of rock, lit on its left and shaded on its right, a white cap of bird droppings. */
function Stack({ x, base, h, w, seed }: { x: number; base: number; h: number; w: number; seed: number }) {
  const rand = rng(seed);
  const top = base - h;
  const lean = (rand() - .5) * 10;
  const left: Pt[] = [[x - w / 2, base], [x - w / 2 - 2, base - h * .3], [x - w * .42, base - h * .62], [x - w * .3 + lean, top + h * .12], [x - w * .12 + lean, top]];
  const right: Pt[] = [[x + w * .16 + lean, top + 2], [x + w * .34 + lean, top + h * .16], [x + w * .5, base - h * .5], [x + w / 2 + 1, base - h * .2], [x + w / 2, base]];
  const body = poly([...left, ...right]);
  const split: Pt[] = [[x + w * .02 + lean, top], [x - w * .04, base - h * .5], [x + w * .06, base]];
  return <G>
    <Ellipse cx={x + 2} cy={base + 1} rx={w * .85} ry={w * .26} fill={FOAM} opacity=".55" />
    <Path d={body} fill="#7E8D88" />
    <Path d={poly([...left, ...split.slice().reverse()])} fill="#A8B3AB" />
    <Path d={poly([[x + w * .02 + lean, top], [x + w * .16 + lean, top + 2], ...right, [x + w * .06, base], [x - w * .04, base - h * .5]])} fill="#5F706D" opacity=".85" />
    <Path d={`M${x - w * .3 + lean} ${top + h * .3} l${w * .3} 3 M${x - w * .38} ${top + h * .55} l${w * .34} 2 M${x + w * .02} ${top + h * .42} l${w * .36} 3`} stroke="#4C5E5C" strokeWidth="1" opacity=".45" fill="none" />
    <Path d={blob(x - w * .05 + lean, top + 2, w * .34, 3.4, seed + 3, 6, .2)} fill="#EEF0E6" />
    <Path d={poly([...left, ...right])} fill="none" {...OUTLINE} />
    <Ellipse cx={x + 1} cy={base + 1} rx={w * .62} ry={w * .17} fill="none" stroke={FOAM} strokeWidth="1.8" opacity=".75" />
  </G>;
}

/**
 * Giant kelp seen from above: a golden mat floating on the surface, its long fronds streaming
 * downstream on gas floats, the stipes dropping away into the dark water below, fading as they go.
 */
function KelpMat({ x, y, w, seed, depth = 60 }: { x: number; y: number; w: number; seed: number; depth?: number }) {
  const rand = rng(seed);
  const stipes: string[] = [];
  const blades: string[] = [];
  const dark: string[] = [];
  const gold: string[] = [];
  for (let i = 0; i < 3; i++) {
    const sx = x + (i - 1) * w * .3;
    const sway = (rand() - .5) * 16;
    const len = depth * (.72 + rand() * .36);
    stipes.push(curve([[sx, y], [sx + sway * .4, y + len * .35], [sx - sway * .5, y + len * .7], [sx + sway * .2, y + len]]));
    for (let k = 1; k <= 3; k++) {
      const by = y + len * (k / 4.3);
      const bx = sx + sway * (k % 2 ? .3 : -.3);
      const s = k % 2 ? 1 : -1;
      blades.push(`M${r1(bx)} ${r1(by)} q${7 * s} -3 ${11 * s} 2 q${-5 * s} 1 ${-11 * s} -2z`);
    }
  }
  // the plume: ragged fronds streaming off to the right, each a long, narrow leaf, the paler on top
  for (let k = 0; k < 8; k++) {
    const sx = x + (rand() - .62) * w * 1.2;
    const sy = y + (rand() - .5) * w * .26;
    const len = w * (.7 + rand() * .9);
    const drift = (rand() - .35) * len * .22;
    const bow = 2 + rand() * 2.4;
    const leaf = (dy: number) => `M${r1(sx)} ${r1(sy + dy)} Q${r1(sx + len * .5)} ${r1(sy + dy + drift * .5 - bow)} ${r1(sx + len)} ${r1(sy + dy + drift)} Q${r1(sx + len * .5)} ${r1(sy + dy + drift * .5 + bow)} ${r1(sx)} ${r1(sy + dy)}z`;
    dark.push(leaf(1.2));
    gold.push(leaf(-.4));
  }
  return <G>
    <Path d={stipes.join('')} fill="none" stroke="#4E6838" strokeWidth="1.6" opacity=".48" strokeLinecap="round" />
    <Path d={blades.join('')} fill="#7E8A3E" opacity=".48" />
    <Path d={dark.join('')} fill="#5C612F" opacity=".92" />
    <Path d={gold.join('')} fill="#A39645" opacity=".95" />
    <Path d={blob(x, y + 1, w * .58, w * .2, seed + 1, 8, .2)} fill="#6E6D2F" />
    <Path d={blob(x - w * .08, y - 1.4, w * .5, w * .15, seed + 2, 8, .22)} fill="#B7A650" />
    <Path d={blob(x - w * .2, y - 3, w * .28, w * .06, seed + 4, 6, .2)} fill="#D8CA7E" opacity=".8" />
    <Circle cx={x + w * .7} cy={y - 1} r={w * .05 + .7} fill="#E2D690" />
    <Circle cx={x + w * 1.1} cy={y + 2.5} r={w * .04 + .6} fill="#E2D690" />
  </G>;
}

/** The kelp mats, back to front: x, y, width, and whether it floats in front of the headland. */
const KELP_MATS: readonly (readonly [number, number, number, boolean])[] = [
  [58, 236, 18, false], [374, 244, 16, false], [210, 120, 15, false], [180, 304, 18, true],
  [92, 292, 26, true], [292, 314, 25, true], [352, 288, 21, true], [134, 328, 21, true], [236, 342, 22, true],
  [40, 328, 15, true], [326, 344, 16, true], [386, 306, 11, true],
];

/** A bare outcrop of rock: lit on the left, shaded on the right. */
function Outcrop({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  return <G transform={`translate(${x} ${y}) scale(${s})`}>
    <Path d={poly([[-14, 3], [-12, -6], [-4, -11], [4, -9], [12, -3], [14, 3]])} fill="#8C9892" />
    <Path d={poly([[-14, 3], [-12, -6], [-4, -11], [-1, 3]])} fill="#B3BDB5" />
    <Path d={poly([[4, -9], [12, -3], [14, 3], [-1, 3], [1, -8]])} fill="#6A7A76" opacity=".8" />
    <Path d={poly([[-14, 3], [-12, -6], [-4, -11], [4, -9], [12, -3], [14, 3]])} fill="none" {...OUTLINE} strokeWidth="1" />
  </G>;
}

function KelpCoast({ id, level, cove }: Art & { cove?: boolean }) {
  const p = OCEAN.palettes[cove ? 'cove' : 'kelp'];
  const sea = `${id}-kelpsea`;
  const mats = KELP_MATS.slice(0, level >= 3 ? 12 : level >= 2 ? 9 : 7);
  const cx = 212;
  const cy = 196;
  const inset = HEADLAND.map(([x, y]): Pt => [cx + (x - cx) * .86, cy + (y - cy) * .84 - 1]);
  const rock = '#707F7B';
  return <>
    <Pool id={sea} cx={213} cy={216} rx={level >= 3 ? 204 : 190} ry={level >= 3 ? 152 : 140} color={darken(p.mid, .12)} strength={.7} peak={.74} />
    <Path d={blob(213, 224, 150, 88, 21, 10, .08)} fill={lighten(p.shallow, .08)} opacity=".55" />
    <Path d={blob(213, 226, 128, 70, 22, 10, .08)} fill={lighten(p.shallow, .22)} opacity=".42" />
    {!cove && mats.filter((m) => !m[3]).map(([x, y, w], i) => <KelpMat key={`b${i}`} x={x} y={y} w={w} seed={90 + i} depth={44} />)}
    {/* the sea stacks standing off the shore */}
    <Stack x={86} base={252} h={126} w={26} seed={4} />
    <Stack x={342} base={236} h={90} w={23} seed={8} />
    {level >= 2 && <Stack x={146} base={284} h={44} w={17} seed={13} />}
    {/* the headland: layered cliff wall, then its rocky rim and the cold, dry top */}
    <Path d={poly(HEADLAND, 0, 28)} fill={darken(rock, .3)} />
    <Path d={poly(HEADLAND, 0, 18)} fill={darken(rock, .16)} />
    <Path d={poly(HEADLAND, 0, 9)} fill={rock} />
    <Path d={HEADLAND.filter((_, i) => i > 9 || i === 0).map(([x, y], i) => `M${r1(x + (i % 2) * 3)} ${r1(y + 6)}v${14 + (i % 3) * 4}`).join('')} stroke="#2F4447" strokeWidth="1.2" opacity=".42" />
    <Path d={poly(HEADLAND, 0, 28)} fill="none" stroke={FOAM} strokeWidth="2.6" opacity=".75" strokeLinejoin="round" />
    <Path d={poly(HEADLAND)} fill="#A3AEA6" />
    <Path d={poly(HEADLAND)} fill="none" {...OUTLINE} />
    <Path d={curve(inset, true)} fill="#A9A874" />
    <Path d={curve(inset.map(([x, y]): Pt => [cx + (x - cx) * .86, cy + (y - cy) * .82 - 3]), true)} fill="#C2B77B" opacity=".75" />
    <Path d={blob(172, 188, 26, 9, 31, 8, .2)} fill="#6E8B58" opacity=".85" />
    <Path d={blob(262, 190, 30, 9, 32, 8, .2)} fill="#5F8052" opacity=".85" />
    <Path d={blob(222, 175, 20, 6, 33, 8, .2)} fill="#7E9A5E" opacity=".8" />
    <Outcrop x={142} y={205} s={1.15} />
    <Outcrop x={296} y={200} s={1.05} />
    <Outcrop x={228} y={168} s={.8} />
    {/* the wind-sheared cypresses */}
    {[[194, 186, 1], [246, 180, .84]].map(([x, y, s], i) => <G key={i} transform={`translate(${x} ${y}) scale(${s})`}>
      <Path d="M0 8 Q-3 -6 4 -15" stroke="#6B5640" strokeWidth="3.2" fill="none" strokeLinecap="round" />
      <Path d={blob(7, -19, 24, 8, 70 + i, 8, .14)} fill="#2F5B46" />
      <Path d={blob(3, -22, 15, 4.4, 75 + i, 7, .16)} fill="#4F7F5E" opacity=".9" />
    </G>)}
    {cove ? <Palm x={166} y={198} scale={.62} /> : null}
    {level >= 4 && <><Crown x={126} y={198} r={10} tone="#4B7552" seed={81} squash={.6} /><Crown x={278} y={198} r={9} tone="#58805A" seed={82} squash={.6} /></>}
    {/* boulders at the foot of the cliffs */}
    <G fill="#76847F">
      {[[110, 260, 8], [130, 268, 5.5], [304, 256, 6.5], [326, 246, 5], [188, 270, 5], [270, 246, 4.5]].map(([x, y, r], i) => <Path key={i} d={blob(x, y, r, r * .62, 40 + i, 6, .2)} />)}
    </G>
    {!cove && mats.filter((m) => m[3]).map(([x, y, w], i) => <KelpMat key={`f${i}`} x={x} y={y} w={w} seed={110 + i} depth={70} />)}
  </>;
}

/* ------------------------------------------------------------------------------------------------
 * The Volcanic Pinnacle: a black lava cone with a plume of steam, in clear blue water.
 * ---------------------------------------------------------------------------------------------- */

function Column({ x, y, h, w = 8 }: { x: number; y: number; h: number; w?: number }) {
  return <G>
    <Path d={`M${x} ${y} v${-h} h${w} v${h}z`} fill="#2B2A30" />
    <Path d={`M${x} ${y} v${-h} h${w * .38} v${h}z`} fill="#4C4B52" />
    <Path d={`M${x} ${y - h} l${w * .5} -3 l${w * .5} 3z`} fill="#7B7A80" />
  </G>;
}

function VolcanicPinnacle({ id, level }: Art) {
  const p = OCEAN.palettes.volcanic;
  const sea = `${id}-volsea`;
  const cone = `${id}-cone`;
  const spire = `${id}-spire`;
  const apex = { x: 208, y: 92 };
  return <>
    <Defs>
      <RadialGradient id={sea} cx={.5} cy={.5} rx={.5} ry={.5}>
        <Stop offset={0} stopColor={p.mid} stopOpacity={.2} />
        <Stop offset={.6} stopColor={p.deep} stopOpacity={.6} />
        <Stop offset={1} stopColor={p.deep} stopOpacity={0} />
      </RadialGradient>
      <LinearGradient id={cone} x1={0} y1={0} x2={0} y2={1}>
        <Stop offset={0} stopColor="#8A5B49" />
        <Stop offset={.3} stopColor="#5E4A45" />
        <Stop offset={.7} stopColor="#3A3536" />
        <Stop offset={1} stopColor="#2A2729" />
      </LinearGradient>
      <LinearGradient id={spire} x1={0} y1={0} x2={1} y2={0}><Stop offset={0} stopColor="#B27A61" /><Stop offset={1} stopColor="#74493D" /></LinearGradient>
    </Defs>
    <Ellipse cx={213} cy={220} rx={level >= 3 ? 200 : 186} ry={level >= 3 ? 150 : 138} fill={`url(#${sea})`} />
    <Path d={blob(212, 226, 134, 74, 51, 10, .07)} fill={lighten(p.shallow, .1)} opacity=".62" />
    <Path d={blob(212, 228, 116, 62, 52, 10, .07)} fill="#3E86A2" opacity=".55" />
    {/* the current: lines of foam bending past the island */}
    <G fill="none" stroke={FOAM} strokeLinecap="round" opacity=".5">
      <Path d="M18 302 C100 336 204 340 298 322 C346 312 378 292 402 268" strokeWidth="1.6" strokeDasharray="16 8 5 12" />
      <Path d="M30 342 C120 366 232 364 332 344" strokeWidth="1.3" strokeDasharray="9 10 18 9" />
      <Path d="M24 176 C66 152 108 134 150 126" strokeWidth="1.4" strokeDasharray="12 9 4 11" />
      <Path d="M300 122 C340 126 372 142 398 166" strokeWidth="1.3" strokeDasharray="10 9" />
    </G>
    {/* the pinnacle off the west point, and the rocks at its foot */}
    <G>
      <Ellipse cx="100" cy="258" rx="26" ry="8" fill={FOAM} opacity=".55" />
      <Path d={poly([[80, 258], [83, 218], [87, 184], [92, 154], [98, 142], [103, 168], [108, 206], [114, 236], [118, 258]])} fill={`url(#${spire})`} />
      <Path d="M92 154 L97 200 L102 258 M86 200 l8 4 M97 176 l8 3 M92 224 l11 3" stroke="#5A372E" strokeWidth="1" opacity=".5" fill="none" />
      <Path d={poly([[80, 258], [83, 218], [87, 184], [92, 154], [98, 142], [103, 168], [108, 206], [114, 236], [118, 258]])} fill="none" {...OUTLINE} />
      <Path d={blob(80, 260, 9, 6, 53, 6, .2)} fill="#3B3638" />
      <Path d={blob(120, 262, 7, 4.6, 54, 6, .2)} fill="#3B3638" />
    </G>
    {/* the island: basalt cliffs, black sand in a cove, lava lobes reaching the sea */}
    <Path d={blob(212, 242, 108, 33, 55, 15, .1)} fill="#1F1E22" />
    <Path d={blob(212, 236, 106, 32, 55, 15, .1)} fill="#322F32" />
    <Path d={blob(326, 240, 20, 8, 63, 8, .15)} fill="#322F32" />
    <Path d={blob(118, 244, 20, 8, 64, 8, .15)} fill="#322F32" />
    <Path d={blob(212, 236, 106, 32, 55, 15, .1)} fill="none" stroke={FOAM} strokeWidth="2" opacity=".5" />
    <Path d="M134 250 q12 8 30 7 M262 262 q18 -1 30 -9" stroke="#4B484D" strokeWidth="2.2" fill="none" strokeLinecap="round" opacity=".65" />
    <Path d="M214 266 C242 270 284 262 304 244 C286 254 252 258 226 256 C220 258 216 262 214 266Z" fill="#6A6764" />
    <Path d="M236 262 C262 264 286 256 300 246" stroke="#9A958F" strokeWidth="1.8" fill="none" opacity=".7" strokeLinecap="round" />
    {/* the cone */}
    <Path d="M184 94 C178 130 146 202 108 230 C140 250 270 252 316 234 C274 206 244 132 232 96Z" fill={`url(#${cone})`} />
    <Path d="M184 94 C178 130 146 202 108 230 C130 244 168 250 206 250 C196 200 196 140 208 96Z" fill="#C79A7E" opacity=".2" />
    <Path d="M232 96 C244 132 274 206 316 234 C282 246 244 250 206 250 C214 200 214 140 208 96Z" fill="#141217" opacity=".38" />
    <Path d="M190 104 C186 140 160 196 126 228 M198 104 C196 150 184 200 168 242 M222 104 C228 150 242 200 262 246 M232 108 C246 144 276 198 304 232" stroke="#1B181B" strokeWidth="1.3" opacity=".5" fill="none" />
    <Path d="M184 94 C178 130 146 202 108 230 M232 96 C244 132 274 206 316 234" fill="none" {...OUTLINE} strokeOpacity={.7} />
    {/* three fresh lava flows from the rim, glossy black */}
    <Path d="M198 104 C194 132 184 160 170 206 L177 208 C190 170 204 134 208 106Z" fill="#161417" />
    <Path d="M214 106 C216 140 226 176 244 218 L252 214 C238 176 224 138 220 106Z" fill="#161417" />
    <Path d="M200 106 C196 134 188 160 178 190" stroke="#6D676A" strokeWidth="1" fill="none" opacity=".6" />
    {/* the crater, with its vent glowing dull red, and ash and sulphur at the rim */}
    <Ellipse cx={apex.x} cy={apex.y + 2} rx="26" ry="8" fill="#A99F93" />
    <Ellipse cx={apex.x} cy={apex.y + 2} rx="26" ry="8" fill="none" {...OUTLINE} />
    <Ellipse cx={apex.x} cy={apex.y + 3.4} rx="19" ry="5.4" fill="#2B2326" />
    <Ellipse cx={apex.x + 2} cy={apex.y + 4} rx="8" ry="2.4" fill="#C2512E" opacity=".85" />
    <Path d={`M${apex.x - 16} ${apex.y + 3} q4 -3 9 -2`} stroke="#D2B94E" strokeWidth="2.2" fill="none" strokeLinecap="round" opacity=".8" />
    {/* the steam, puffing off east on the wind: cumulus puffs, swelling and thinning as they go */}
    <G>
      {[[210, 78, 6, .92], [221, 67, 9, .88], [237, 56, 12, .8], [258, 48, 15, .66], [283, 44, 17, .48], [308, 44, 16, .3]].map(([x, y, r, o], i) => {
        const puff = (dx: number, dy: number) => [[-.55, .1, .62], [.1, -.28, .74], [.6, .12, .6]].map(([cx, cy, k]) => {
          const [px, py, pr] = [x + dx + cx * r, y + dy + cy * r, r * k];
          return `M${r1(px - pr)} ${r1(py)}a${r1(pr)} ${r1(pr)} 0 1 0 ${r1(pr * 2)} 0a${r1(pr)} ${r1(pr)} 0 1 0 ${r1(-pr * 2)} 0z`;
        }).join('');
        return <G key={i} opacity={o}>
          <Path d={puff(1.8, 2.4)} fill="#B3B9C2" />
          <Path d={puff(0, 0)} fill="#F6F7F5" />
        </G>;
      })}
    </G>
    {/* green scrub on the sunny south slopes */}
    <Path d={blob(176, 226, 22, 6, 57, 7, .2)} fill="#6F8B55" opacity=".85" />
    <Path d={blob(246, 232, 26, 6, 58, 7, .2)} fill="#5F7C4C" opacity=".85" />
    {level >= 4 && <G fill="none" stroke="#C9C3AE" strokeWidth="1.6" strokeLinecap="round">
      <Path d="M158 232 l-2 -12 m2 12 l5 -11 M262 238 l-2 -12 m2 12 l5 -10" />
    </G>}
    {level >= 3 && <G fill="#6A8A4A">
      <Path d={blob(194, 236, 5, 3.2, 59, 6, .2)} /><Path d={blob(231, 241, 5, 3.2, 60, 6, .2)} />
    </G>}
    {/* the causeway of basalt columns stepping down into the sea on the east point */}
    <G>
      {[[316, 240, 24], [325, 243, 20], [334, 245, 15], [343, 247, 11], [352, 249, 8]].map(([x, y, h], i) => <Column key={i} x={x} y={y} h={h} w={8} />)}
      {level >= 2 && [[302, 252, 12], [310, 255, 9]].map(([x, y, h], i) => <Column key={`c${i}`} x={x} y={y} h={h} w={7} />)}
    </G>
  </>;
}

/** A low lava rock capped with columns, for the islets that rise as the level grows. */
function LavaIslet({ x, y, scale = 1 }: { x: number; y: number; scale?: number }) {
  return <G transform={`translate(${x} ${y}) scale(${scale}) translate(-${x} -${y})`}>
    <Ellipse cx={x} cy={y + 2} rx="38" ry="19" fill="#D4E6F0" opacity=".6" />
    <Path d={blob(x, y, 26, 13, 71, 8, .12)} fill="#2D2B30" />
    <Path d={blob(x - 3, y - 2, 18, 8, 72, 7, .12)} fill="#4B484D" />
    <Column x={x - 8} y={y + 1} h={12} w={7} /><Column x={x} y={y + 3} h={16} w={7} /><Column x={x + 8} y={y + 1} h={9} w={7} />
  </G>;
}

/* ------------------------------------------------------------------------------------------------
 * The Mangroves & Seagrass: a low green cay on its prop roots, in a warm, shallow lagoon of seagrass.
 * ---------------------------------------------------------------------------------------------- */

const MANGROVES = ['#2F6A47', '#3C7C50', '#4B8A55', '#7FA55F', '#A5BD72'];
/** Crowns of the canopy from the back row to the front: x, y, radius, tone. */
function canopy(): [number, number, number, number][] {
  const rand = rng(7);
  const rows: [number, number, number, number][] = [];
  for (const [y, x0, step, r, tones] of [[176, 104, 25, 21, [0, 1, 1, 2, 3]], [190, 92, 24, 24, [1, 0, 2, 1, 4]], [204, 98, 22, 21, [0, 2, 1, 3, 0]], [215, 112, 21, 16, [1, 0, 2, 1, 0]]] as const) {
    for (let x = x0, i = 0; x <= 328; x += step, i++) rows.push([x + (rand() - .5) * 7, y + (rand() - .5) * 5, r + (rand() - .5) * 8, tones[(i + Math.floor(rand() * 2)) % tones.length]]);
  }
  return rows;
}
let CANOPY_CACHE: [number, number, number, number][] | undefined;

function Egret({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  return <G transform={`translate(${x} ${y}) scale(${s})`}>
    <Path d="M0 0 v-7" stroke="#4A4638" strokeWidth=".9" />
    <Path d="M-5 -11 Q-1 -16 5 -12 Q2 -8 -3 -8Z" fill="#FFFFFF" {...OUTLINE} strokeWidth=".8" />
    <Path d="M3 -12 q3 -6 5 -4 l3 0" stroke="#FFFFFF" strokeWidth="1.6" fill="none" strokeLinecap="round" />
    <Path d="M8 -16 l4 .8" stroke="#E5B94A" strokeWidth="1" />
  </G>;
}

/** A red mangrove standing in the water on its prop roots. */
function StiltTree({ x, y, s = 1, seed }: { x: number; y: number; s?: number; seed: number }) {
  return <G transform={`translate(${x} ${y}) scale(${s})`}>
    <Ellipse cx="0" cy="3" rx="19" ry="5" fill="#2E6A5F" opacity=".25" />
    <Path d="M-12 4 Q-9 -8 -2 -12 M-4 5 Q-3 -6 0 -12 M5 4 Q4 -7 1 -12 M13 3 Q10 -8 3 -12" stroke="#7A5A44" strokeWidth="1.7" fill="none" strokeLinecap="round" />
    <Path d="M-11 4 q-1 5 0 8 M-4 5 q0 4 0 7 M5 4 q1 5 0 7 M13 3 q1 5 2 8" stroke="#4A5A3E" strokeWidth="1.2" fill="none" opacity=".55" />
    <Crown x={0} y={-17} r={14} tone="#3A7A4F" seed={seed} squash={.8} />
  </G>;
}

/** Prop roots under each crown of the front row. */
const ROOT_LEGS = 5;

function Mangroves({ id, level }: Art) {
  const p = OCEAN.palettes.mangrove;
  const sea = `${id}-mangsea`;
  const crowns = (CANOPY_CACHE ??= canopy());
  const meadows: readonly (readonly [number, number, number, number])[] = [
    [92, 262, 50, 15], [300, 270, 56, 16], [212, 286, 70, 14], [330, 160, 34, 11], [76, 168, 36, 12], [222, 138, 44, 10], [160, 252, 34, 10], [262, 252, 30, 9],
  ];
  const shown = meadows.slice(0, level >= 3 ? 8 : level >= 2 ? 6 : 5);
  const roots: string[] = [];
  const reflections: string[] = [];
  for (let i = 0; i < crowns.length; i++) {
    const [x, y, r] = crowns[i];
    if (y < 211) continue;
    const rand = rng(300 + i);
    const y0 = y + r * .66;
    for (let k = 0; k < ROOT_LEGS; k++) {
      const t = k / (ROOT_LEGS - 1) - .5;
      const x0 = x + t * r * 1.5;
      const dx = t * (13 + rand() * 7) + (rand() - .5) * 3;
      roots.push(`M${r1(x0)} ${r1(y0)} C${r1(x0 + dx * .5)} ${r1(y0 - 2)} ${r1(x0 + dx * 1.15)} ${r1(y0 + 1)} ${r1(x0 + dx)} ${r1(y0 + 12 + rand() * 9)}`);
    }
    reflections.push(blob(x, y0 + 14, r * 1.1, 3.6, 500 + i, 6, .15));
  }
  return <>
    <Pool id={sea} cx={213} cy={220} rx={level >= 3 ? 204 : 192} ry={level >= 3 ? 140 : 130} color={p.mid} strength={.5} peak={.7} />
    <Path d={blob(213, 222, 176, 88, 61, 12, .07)} fill={lighten(p.shallow, .35)} opacity=".66" />
    <Path d={blob(213, 226, 150, 70, 62, 12, .07)} fill={lighten(p.shallow, .55)} opacity=".5" />
    {/* the seagrass meadows: dark green under the clear water, a few blades showing */}
    {shown.map(([x, y, rx, ry], i) => <G key={i}>
      <Path d={blob(x, y, rx, ry, 70 + i, 9, .18)} fill="#3F8250" opacity=".5" />
      <Path d={blob(x + 2, y - 1, rx * .72, ry * .7, 80 + i, 9, .2)} fill="#2F6B45" opacity=".4" />
      <Path d={Array.from({ length: Math.round(rx / 4.5) }, (_, k) => {
        const rand = rng(900 + i * 20 + k);
        const bx = x + (rand() - .5) * rx * 1.4;
        const by = y + (rand() - .5) * ry * 1.2;
        return `M${r1(bx)} ${r1(by)} q${r1((rand() - .5) * 4)} -4 ${r1((rand() - .5) * 6)} -8`;
      }).join('')} fill="none" stroke="#8DBE7A" strokeWidth="1.1" strokeLinecap="round" opacity=".7" />
    </G>)}
    {/* the pale spit and its boardwalk on posts, with two egrets at the end */}
    <Path d={blob(300, 232, 30, 9, 63, 8, .15)} fill="#F0E8C6" opacity=".95" />
    <Path d="M292 232 L342 252" stroke="#8C6F4F" strokeWidth="2.6" />
    <Path d="M296 234 l0 5 M306 238 l0 5 M316 242 l0 5 M326 246 l0 5 M336 250 l0 5" stroke="#6F573F" strokeWidth="1.2" />
    {/* the island: mud banks, then the canopy from back to front */}
    <Path d={blob(213, 216, 142, 30, 64, 14, .12)} fill="#6A5B45" opacity=".9" />
    <Path d={blob(213, 212, 140, 28, 65, 14, .12)} fill="#8A7A58" />
    <Path d={blob(213, 212, 140, 28, 65, 14, .12)} fill="none" stroke={FOAM} strokeWidth="1.8" opacity=".5" />
    <Path d="M148 226 C158 218 164 212 176 206" stroke="#44604A" strokeWidth="7" fill="none" strokeLinecap="round" opacity=".7" />
    {crowns.map(([x, y, r, tone], i) => <Crown key={i} x={x} y={y} r={r} tone={MANGROVES[tone]} seed={200 + i} squash={.82} lift={.5} />)}
    {/* the prop roots arching out into the water along the front */}
    <Path d={reflections.join('')} fill="#2E6A5F" opacity=".26" />
    <Path d={roots.join('')} fill="none" stroke="#6E5240" strokeWidth="1.9" strokeLinecap="round" />
    <Path d={roots.join('')} fill="none" stroke="#A98A68" strokeWidth=".7" strokeLinecap="round" opacity=".75" transform="translate(-.7 -.5)" />
    {level >= 2 && <><StiltTree x={112} y={246} s={.9} seed={401} /><StiltTree x={282} y={254} s={.85} seed={402} /></>}
    {level >= 3 && <><StiltTree x={196} y={262} s={.7} seed={403} /><StiltTree x={342} y={222} s={.62} seed={404} /></>}
    {level >= 4 && <><Crown x={140} y={178} r={13} tone="#3C7C50" seed={410} squash={.8} /><Crown x={290} y={178} r={13} tone="#4B8A55" seed={411} squash={.8} /></>}
    {/* one of the dead mangroves, bleached silver, standing among the living */}
    <G fill="none" strokeLinecap="round" transform="translate(166 174)">
      <Path d="M0 0 q-1 -9 1 -16 M1 -12 q-7 -4 -10 -11 M1 -12 q6 -5 8 -12 M0 -7 q6 -2 9 -7" stroke="#8C918B" strokeWidth="3" />
      <Path d="M0 0 q-1 -9 1 -16 M1 -12 q-7 -4 -10 -11 M1 -12 q6 -5 8 -12 M0 -7 q6 -2 9 -7" stroke="#E4E7DF" strokeWidth="1.6" />
    </G>
    <Egret x={332} y={248} s={1} />
    <Egret x={344} y={252} s={.85} />
  </>;
}

/** A clump of red mangroves on their roots, for the islets that rise as the level grows. */
function MangroveIslet({ x, y, scale = 1 }: { x: number; y: number; scale?: number }) {
  return <G transform={`translate(${x} ${y}) scale(${scale}) translate(-${x} -${y})`}>
    <Ellipse cx={x} cy={y + 2} rx="40" ry="20" fill="#BDE9D5" opacity=".6" />
    <Path d={blob(x, y + 2, 26, 8, 91, 8, .12)} fill="#8A7A58" />
    <Path d={`M${x - 14} ${y + 2} q-2 7 -1 10 M${x - 4} ${y + 4} q0 6 0 8 M${x + 8} ${y + 3} q2 6 1 9 M${x + 17} ${y + 1} q3 5 3 8`} fill="none" stroke="#6E5240" strokeWidth="1.4" strokeLinecap="round" />
    <Crown x={x - 10} y={y - 6} r={11} tone="#3C7C50" seed={92} squash={.8} />
    <Crown x={x + 7} y={y - 8} r={13} tone="#2F6A47" seed={93} squash={.8} />
    <Crown x={x + 17} y={y - 2} r={9} tone="#4B8A55" seed={94} squash={.8} />
  </G>;
}

/* ------------------------------------------------------------------------------------------------
 * The Shipwreck: a white-sand crescent with a red-banded lighthouse, a rusted steamer in its bight.
 * ---------------------------------------------------------------------------------------------- */

const CRESCENT = 'M88 240 C84 200 118 150 178 134 C232 122 296 142 326 196 C338 218 336 232 332 244 C322 224 304 206 288 192 C262 168 218 158 178 168 C142 178 124 206 112 232 C106 240 98 246 88 240Z';

/** The wrecked steamer in her own frame: bow at the origin, the keel along x. Her back is broken amidships and the stern half lies lower, twisted aside. */
function Steamer() {
  const bow: Pt[] = [[0, -22], [80, -17], [78, -8], [72, 3], [24, 4], [6, -6]];
  const stern: Pt[] = [[0, -16], [62, -13], [60, -4], [48, 3], [12, 4], [-1, -4]];
  return <G>
    {/* her shadow on the sand, seen through the clear water */}
    <Path d={blob(80, 16, 84, 11, 101, 9, .1)} fill="#2A8DB8" opacity=".22" />
    {/* the bow half: hull, rotten deck, deckhouse, the funnel leaning aft, the foremast still up */}
    <Path d={poly(bow)} fill="#9B5C3E" />
    <Path d={poly([[0, -22], [80, -17], [80, -12], [2, -17]])} fill="#6E4A36" />
    <Path d="M6 -13 L76 -9 M4 -9 L74 -4" stroke="#C57A4A" strokeWidth="1.3" opacity=".6" />
    <Path d="M12 -12 v10 M22 -12 v13 M34 -11 v13 M46 -11 v13 M58 -10 v13 M68 -9 v11" stroke="#7A4630" strokeWidth="1.5" opacity=".5" />
    <Path d={poly(bow)} fill="none" {...OUTLINE} strokeOpacity={.7} />
    <Path d={poly([[34, -19], [54, -18], [54, -33], [34, -34]])} fill="#D9CFBC" />
    <Path d={poly([[34, -34], [54, -33], [57, -37], [37, -38]])} fill="#B5624A" />
    <Path d="M38 -28 h4 M46 -27 h4" stroke="#3D4A52" strokeWidth="2.4" />
    <Path d={poly([[34, -19], [54, -18], [54, -33], [34, -34]])} fill="none" {...OUTLINE} />
    <Path d={poly([[60, -18], [70, -17], [77, -52], [68, -53]])} fill="#42363B" />
    <Path d={poly([[60, -18], [63, -18], [70, -53], [68, -53]])} fill="#6A5A5C" />
    <Path d="M66 -36 l9 .6" stroke="#B5624A" strokeWidth="2.4" />
    <Path d="M67.5 -53 h10" stroke="#1F1B1E" strokeWidth="3" />
    <Path d="M13 -21 L11 -56 M4 -46 h14" stroke="#5A4034" strokeWidth="1.6" />
    {/* the break, ragged plates */}
    <Path d="M80 -17 l-4 4 l4 3 l-4 4 l3 4 l-3 5 l8 -3z" fill="#7C432E" />
    {/* the stern half, lower in the water and turned aside, her mainmast broken off short */}
    <G transform="translate(86 7) rotate(11)">
      <Path d={poly(stern)} fill="#8A4F36" />
      <Path d={poly([[0, -16], [62, -13], [62, -8], [0, -11]])} fill="#5F4030" />
      <Path d="M8 -8 L58 -6" stroke="#C57A4A" strokeWidth="1.2" opacity=".55" />
      <Path d={poly(stern)} fill="none" {...OUTLINE} strokeOpacity={.7} />
      <Path d="M30 -14 l-2 -15 l4 -4 l1 5" stroke="#5A4034" strokeWidth="1.6" fill="none" />
      <Path d="M44 -13 l12 -3 l2 5" stroke="#4A3A34" strokeWidth="1.2" fill="none" />
    </G>
    {/* below the waterline: the clear water over her hull, a little weed and pink coral on her plates */}
    <Path d="M0 -3 C26 0 52 -2 80 -3 L78 6 L0 6Z" fill="#3FCBD3" opacity=".4" />
    <G transform="translate(86 7) rotate(11)"><Path d="M0 -3 C20 -1 44 -3 62 -4 L60 6 L0 6Z" fill="#3FCBD3" opacity=".4" /></G>
    <Path d="M14 1 h3 M30 2 h5 M58 3 h4 M104 10 h5 M124 9 h5" stroke="#7FB27C" strokeWidth="2" strokeLinecap="round" opacity=".7" />
    <Path d="M44 2 h3 M138 7 h3" stroke="#E7A9A3" strokeWidth="2.4" strokeLinecap="round" opacity=".85" />
  </G>;
}

function Lighthouse({ x, y }: { x: number; y: number }) {
  const bands = ['#B5382C', '#FBF8F0', '#B5382C', '#FBF8F0'];
  return <G transform={`translate(${x} ${y})`}>
    <Ellipse cx="12" cy="1" rx="22" ry="5" fill="#9C8E69" opacity=".3" transform="rotate(-6 12 1)" />
    {/* the keeper's whitewashed hut under its red roof */}
    <Path d="M14 -1 v-11 h16 v11z" fill="#FBF8F0" />
    <Path d="M14 -1 v-11 h5 v11z" fill="#E9E2D0" />
    <Path d="M12 -12 l10 -8 l10 8z" fill="#B5382C" />
    <Path d="M14 -1 v-11 h16 v11z M12 -12 l10 -8 l10 8z" fill="none" {...OUTLINE} strokeWidth="1" />
    {/* the tower: tapering, white, banded red, a gallery, a lantern and a red cap */}
    {bands.map((c, i) => {
      const y0 = -i * 14;
      const w0 = 17 - i * 1.7;
      const w1 = 17 - (i + 1) * 1.7;
      return <Path key={i} d={poly([[-w0 / 2, y0], [w0 / 2, y0], [w1 / 2, y0 - 14], [-w1 / 2, y0 - 14]])} fill={c} />;
    })}
    <Path d={poly([[-8.5, 0], [-6.8, -56], [-3.4, -56], [-4.6, 0]])} fill="#2F4756" opacity=".1" />
    <Path d={poly([[3.2, 0], [4.9, -56], [8.5, 0]])} fill="#2F4756" opacity=".16" />
    <Path d={poly([[-8.5, 0], [8.5, 0], [5, -56], [-5, -56]])} fill="none" {...OUTLINE} />
    <Path d="M-8 -56 h16 v-3 h-16z" fill="#3B4650" />
    <Path d="M-4.4 -59 h8.8 v-8 h-8.8z" fill="#FFE9A8" />
    <Path d="M-4.4 -59 h8.8 v-8 h-8.8z M0 -59 v-8" fill="none" stroke={INK} strokeWidth=".9" strokeOpacity=".6" />
    <Path d="M-7 -67 h14 l-7 -9z" fill="#B5382C" />
    <Path d="M-7 -67 h14 l-7 -9z" fill="none" {...OUTLINE} strokeWidth="1" />
  </G>;
}

function Wreck({ id, level }: Art) {
  const p = OCEAN.palettes.wreck;
  const sea = `${id}-wrecksea`;
  const sand = `${id}-wsand`;
  const shelf = `${id}-shelf`;
  return <>
    <Defs>
      <RadialGradient id={sea} cx={.5} cy={.5} rx={.5} ry={.5}>
        <Stop offset={0} stopColor={p.mid} stopOpacity={.1} />
        <Stop offset={.62} stopColor={p.deep} stopOpacity={.62} />
        <Stop offset={1} stopColor={p.deep} stopOpacity={0} />
      </RadialGradient>
      <RadialGradient id={shelf} cx={.5} cy={.5} rx={.5} ry={.5}>
        <Stop offset={0} stopColor="#F4F0DC" stopOpacity={.95} />
        <Stop offset={.5} stopColor="#B4EBE4" stopOpacity={.9} />
        <Stop offset={1} stopColor="#4FD0D6" stopOpacity={.85} />
      </RadialGradient>
      <LinearGradient id={sand} x1={0} y1={0} x2={.7} y2={1}><Stop offset={0} stopColor="#FDF8E6" /><Stop offset={1} stopColor="#E7DABA" /></LinearGradient>
    </Defs>
    <Ellipse cx={213} cy={218} rx={level >= 3 ? 204 : 190} ry={level >= 3 ? 150 : 138} fill={`url(#${sea})`} />
    <Path d={blob(213, 222, 156, 98, 111, 12, .06)} fill={`url(#${shelf})`} />
    <G fill="none" stroke="#FFFFFF" strokeWidth="1.2" strokeLinecap="round" opacity=".55">
      <Path d="M118 262 q18 -5 34 0 M232 296 q20 -5 40 1 M284 268 q14 -4 28 0 M150 292 q12 -3 24 0" />
    </G>
    {/* the crescent of white sand, with shallows pale around it */}
    <Path d={CRESCENT} fill="#F6F0D6" stroke="#E4F7F1" strokeWidth="16" strokeLinejoin="round" opacity=".5" />
    <Path d={CRESCENT} fill="#EADFBE" stroke="#FFFFFF" strokeWidth="5" strokeLinejoin="round" opacity=".7" />
    <Path d={CRESCENT} fill={`url(#${sand})`} />
    <Path d={CRESCENT} fill="none" {...OUTLINE} />
    <Path d="M126 196 C150 178 186 172 212 176 C242 180 270 190 284 206" fill="none" stroke="#D9C9A0" strokeWidth="2" strokeLinecap="round" opacity=".7" />
    {/* the dunes and beach grass */}
    <G>
      <Path d={blob(176, 150, 26, 9, 121, 8, .14)} fill="#EEE3C0" />
      <Path d={blob(172, 147, 18, 5, 122, 8, .14)} fill="#FFFBEC" opacity=".8" />
      <Path d={blob(240, 152, 28, 10, 123, 8, .14)} fill="#EEE3C0" />
      <Path d={blob(236, 149, 19, 5, 124, 8, .14)} fill="#FFFBEC" opacity=".8" />
      <Path d={blob(298, 188, 17, 7, 125, 8, .14)} fill="#EEE3C0" />
    </G>
    <Path d={blob(214, 156, 18, 5, 126, 7, .2)} fill="#9DB06F" opacity=".5" />
    <G fill="none" stroke="#8A9B5A" strokeWidth="1.5" strokeLinecap="round">
      <Path d="M186 152 l-3 -9 m3 9 l1 -10 m-1 10 l5 -8 M228 150 l-3 -9 m3 9 l1 -10 m-1 10 l5 -8 M250 156 l-3 -8 m3 8 l1 -9 m-1 9 l5 -7 M208 160 l-2 -7 m2 7 l2 -8 M302 190 l-2 -7 m2 7 l1 -8 m-1 8 l4 -6" />
    </G>
    <Palm x={226} y={158} scale={.5} />
    {level >= 4 && <Palm x={254} y={166} scale={.42} />}
    {level >= 2 && <G stroke="#C8B48A" strokeWidth="1.8" strokeLinecap="round"><Path d="M118 224 l9 -3 M296 212 l8 3 M166 176 l7 1" /></G>}
    <G fill="#A7A89A"><Path d={blob(96, 242, 5, 3, 127, 6, .2)} /><Path d={blob(330, 242, 4, 2.6, 128, 6, .2)} /></G>
    <Lighthouse x={146} y={170} />
    {/* the wreck in the bight */}
    <G transform="translate(160 232) rotate(14) scale(1.08)">
      <Steamer />
    </G>
    {level >= 2 && <G stroke="#40596A" strokeWidth="1.1" fill="none" opacity=".55"><Path d="M168 264 q-2 7 3 9 M171 273 l4 1 l-2 -5" /></G>}
    {level >= 3 && <G fill="#5C6770" opacity=".6"><Path d={poly([[250, 300], [260, 299], [259, 303], [249, 304]])} /><Path d={poly([[220, 298], [228, 297], [228, 300], [219, 301]])} /></G>}
  </>;
}

/* ------------------------------------------------------------------------------------------------ */

const ISLETS: Record<'island' | 'lagoon' | 'kelp' | 'cove' | 'volcanic' | 'mangrove' | 'wreck', (x: number, y: number, scale: number, id: string) => ReactElement> = {
  island: (x, y, scale, id) => <SandIslet id={`${id}-isle`} x={x} y={y} scale={scale} />,
  lagoon: (x, y, scale, id) => <SandIslet id={`${id}-isle`} x={x} y={y} scale={scale} />,
  kelp: (x, y, scale) => <G transform={`translate(${x} ${y})`}><Stack x={-6} base={4} h={34} w={16} seed={21} /><Stack x={10} base={8} h={20} w={12} seed={22} /></G>,
  cove: (x, y, scale) => <G transform={`translate(${x} ${y})`}><Stack x={0} base={4} h={26} w={15} seed={23} /></G>,
  volcanic: (x, y, scale) => <LavaIslet x={x} y={y} scale={scale} />,
  mangrove: (x, y, scale) => <MangroveIslet x={x} y={y} scale={scale} />,
  wreck: (x, y, scale, id) => <SandIslet id={`${id}-isle`} x={x} y={y} scale={scale} grass />,
};

/** Where the islets of levels 5 and 6 lie in each island's sea. */
const ISLET_AT: Record<Habitat, readonly [Pt, Pt]> = {
  island: [[334, 118], [84, 298]],
  lagoon: [[334, 118], [84, 298]],
  cove: [[337, 118], [78, 304]],
  kelp: [[346, 128], [66, 318]],
  volcanic: [[342, 122], [68, 312]],
  mangrove: [[340, 112], [76, 306]],
  wreck: [[352, 120], [70, 306]],
};

export const IslandArt = memo(function IslandArt({ habitat, level = 1 }: { habitat: Habitat; level?: number }) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const sandId = `${id}-isle`;
  const shape = HABITATS.find((h) => h.id === habitat) ?? HABITATS[0];
  const key = shape.id;
  const growth = .85 + Math.min(level, 6) * .035;
  const art: Art = { id, level };
  const islets = ISLET_AT[key];
  return <Svg width="100%" height="100%" viewBox="0 0 420 390">
    <Defs>
      <LinearGradient id={sandId} x1={0} y1={0} x2={.8} y2={1}><Stop offset={0} stopColor={SAND_LIGHT} /><Stop offset={1} stopColor={SAND_DARK} /></LinearGradient>
    </Defs>
    <Glints />
    <G transform={`translate(210 200) scale(${growth}) translate(-210 -200)`}>
      {key === 'kelp' || key === 'cove' ? <KelpCoast {...art} cove={key === 'cove'} />
        : key === 'volcanic' ? <VolcanicPinnacle {...art} />
        : key === 'mangrove' ? <Mangroves {...art} />
        : key === 'wreck' ? <Wreck {...art} />
        : <CoralCay {...art} habitat={key === 'lagoon' ? 'lagoon' : 'island'} />}
    </G>
    {level >= 5 && ISLETS[key](islets[0][0], islets[0][1], 1, id)}
    {level >= 6 && ISLETS[key](islets[1][0], islets[1][1], 1, id)}
  </Svg>;
});
