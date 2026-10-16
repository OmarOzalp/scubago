/**
 * Turns a plate's geometry into drawable shapes: muted, hand-tinted washes under fine engraved
 * lines and a confident ink outline, like a coloured plate from an old field guide. A species not
 * yet found is the same drawing as a dashed pencil outline.
 */
import { mix } from '@/lib/art-color';

import { add, bbox, mapPolys, mul, norm, pathOf, perp, polyLength, type Pt, resample, smoothstep, sub } from './kit';
import type { Eye, Fill, Line, Paint, Palette, Part, PlateGeom } from './types';

export const PLATE_BOX = { width: 200, height: 128 } as const;
export const INK = '#1F2A44';
export const PAPER = '#F6F0E2';
const SEPIA = '#8B7A5C';
const PENCIL = '#9C9381';

export interface PlateShape {
  d: string;
  fill?: string;
  fillOpacity?: number;
  stroke?: string;
  strokeWidth?: number;
  strokeOpacity?: number;
  dash?: string;
  clip?: 'trunk' | 'body';
}

export interface PlateDrawing {
  /** Clip outlines (path data) the shapes refer to. */
  trunk: string;
  body: string;
  shapes: PlateShape[];
}

/** Every point of a drawing moved by f (radii scaled by k). */
export function mapGeom(g: PlateGeom, f: (p: Pt) => Pt, k = 1): PlateGeom {
  const polys = (ps: Pt[][]) => mapPolys(ps, f);
  const lines = (ls: Line[]) => ls.map((l) => ({ ...l, pts: l.pts.map(f) }));
  const fills = (fs: Fill[]) => fs.map((x) => ({ ...x, poly: x.poly.map(f) }));
  const parts = (ps: Part[]) => ps.map((p) => ({ ...p, poly: p.poly.map(f), lines: lines(p.lines), marks: p.marks && fills(p.marks) }));
  return {
    body: g.body.map(f),
    trunk: g.trunk.map(f),
    tint: fills(g.tint),
    median: parts(g.median),
    engraving: lines(g.engraving),
    far: parts(g.far),
    near: parts(g.near),
    marks: fills(g.marks),
    lines: lines(g.lines),
    eyes: g.eyes.map((e) => ({ ...e, c: f(e.c), r: e.r * k })),
    heavy: polys(g.heavy),
  };
}

/** Turns a drawing by `deg` degrees (clockwise on screen) about the origin. */
export function rotateGeom(g: PlateGeom, deg: number): PlateGeom {
  const a = (deg * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  return mapGeom(g, ([x, y]) => [x * c - y * s, x * s + y * c]);
}

/** Scales and centres a drawing (in any units) into the plate box, leaving a margin. */
export function fit(g: PlateGeom, margin = 7): PlateGeom {
  const all = [g.body, g.trunk, ...g.far.map((p) => p.poly), ...g.near.map((p) => p.poly)];
  const b = bbox(all.filter((p) => p.length));
  const k = Math.min((PLATE_BOX.width - 2 * margin) / b.w, (PLATE_BOX.height - 2 * margin) / b.h);
  const ox = (PLATE_BOX.width - b.w * k) / 2 - b.x0 * k;
  const oy = (PLATE_BOX.height - b.h * k) / 2 - b.y0 * k;
  return mapGeom(g, (p) => [p[0] * k + ox, p[1] * k + oy], k);
}

export interface DrawOptions {
  /** Width the plate is shown at, in points: decides line weights and how much detail to keep. */
  width: number;
  /** false: a dashed pencil outline (a species still to find). */
  found?: boolean;
  /** The paper behind the plate. */
  paper?: string;
}

export function drawPlate(g: PlateGeom, palette: Palette, { width, found = true, paper = PAPER }: DrawOptions): PlateDrawing {
  const scale = width / PLATE_BOX.width;
  const fine = Math.max(0.32, Math.min(0.62, width / 380)) / scale;
  const edge = Math.max(0.75, Math.min(1.35, width / 160)) / scale;
  // Fewer engraving lines on small plates, so they read as tone rather than a grey smudge.
  const thin = width >= 150 ? 1 : width >= 95 ? 2 : width >= 64 ? 3 : 0;
  const detailed = width >= 90;
  const trunk = pathOf(g.trunk, true);
  const body = pathOf(g.body, true);
  const shapes: PlateShape[] = [];

  if (!found) {
    const dash = `${(2.6 / scale).toFixed(2)} ${(2 / scale).toFixed(2)}`;
    const pencil = (poly: Pt[]) => shapes.push({ d: pathOf(poly, true), fill: paper, stroke: PENCIL, strokeWidth: edge * 0.85, dash });
    g.far.forEach((p) => pencil(p.poly));
    pencil(g.body);
    g.near.forEach((p) => pencil(p.poly));
    if (detailed)
      for (const l of g.lines) if (!l.detail || width >= 140) shapes.push({ d: pathOf(l.pts), stroke: PENCIL, strokeWidth: fine * 1.1, dash });
    for (const e of g.eyes) shapes.push({ d: circle(e.c, e.r * 0.8), stroke: PENCIL, strokeWidth: fine * 1.2 });
    return { trunk, body, shapes: merged(shapes) };
  }

  // Washes are pulled towards the paper, dark ones less so (a black manta stays nearly black).
  const tint = (c: string, k: number) => mix(mix(c, SEPIA, 0.16), paper, k * (0.4 + 0.6 * luminance(c)));
  const paint = (p: Paint): string => {
    switch (p) {
      case 'back':
        return tint(palette.back, 0.36);
      case 'belly':
        return tint(palette.belly, 0.2);
      case 'fin':
        return tint(palette.fin ?? mix(palette.back, '#000000', 0.12), 0.34);
      case 'accent':
        return tint(palette.accent ?? palette.back, 0.26);
      case 'tip':
        return tint(palette.tip ?? INK, 0.1);
      case 'pattern':
        return tint(palette.pattern ?? mix(palette.back, '#000000', 0.4), 0.18);
      case 'dark':
        return tint(palette.dark ?? mix(palette.back, '#000000', 0.55), 0.12);
      case 'light':
        return mix(paper, '#FFFFFF', 0.25);
      case 'paper':
        return paper;
      case 'ink':
        return INK;
      default:
        return tint(p, 0.24);
    }
  };

  const strokeLines = (ls: Line[], weight: number, opacity: number, step = 1) => {
    // Lines of the same weight share one path; tapered lines become thin filled shapes.
    const groups = new Map<string, string[]>();
    const cuts = new Map<number, string[]>();
    ls.forEach((l, i) => {
      if (l.detail && !detailed) return;
      if (step > 1 && i % step) return;
      if (l.taper) {
        const o = l.o ?? opacity;
        const d = pathOf(wound(swell(l.pts, l.w * weight * fine * (step > 1 ? 1.25 : 1), l.taper)), true, 0.05);
        if (d) cuts.set(o, [...(cuts.get(o) ?? []), d]);
        return;
      }
      const w = Math.round(l.w * weight * fine * 20) / 20;
      const o = l.o ?? opacity;
      const key = `${w}|${o}`;
      const d = pathOf(l.pts);
      if (!d) return;
      groups.set(key, [...(groups.get(key) ?? []), d]);
    });
    for (const [key, ds] of groups) {
      const [w, o] = key.split('|').map(Number);
      shapes.push({ d: ds.join(''), stroke: INK, strokeWidth: w, strokeOpacity: o });
    }
    for (const [o, ds] of cuts) shapes.push({ d: ds.join(''), fill: INK, fillOpacity: o });
  };
  const fill = (f: Fill) =>
    shapes.push({
      d: pathOf(wound(f.poly), true),
      fill: paint(f.paint),
      fillOpacity: f.o,
      clip: f.clip,
      ...(f.edge ? { stroke: INK, strokeWidth: fine * f.edge, strokeOpacity: 0.75 } : {}),
    });
  const drawPart = (p: Part, outline = true) => {
    shapes.push({ d: pathOf(wound(p.poly), true), fill: paint(p.paint) });
    if (thin) strokeLines(p.lines, 1, 0.6, thin > 1 ? 2 : 1);
    // Fin markings sit over the hatching (a white tip is left clean).
    p.marks?.forEach(fill);
    if (outline) shapes.push({ d: pathOf(p.poly, true), stroke: INK, strokeWidth: edge * (p.edge ?? 0.85) });
  };

  g.far.forEach((p) => drawPart(p));
  shapes.push({ d: body, fill: paint('fin') });
  for (const p of g.median) shapes.push({ d: pathOf(p.poly, true), fill: paint(p.paint), clip: 'body' });
  shapes.push({ d: trunk, fill: paint('back') });
  g.tint.forEach(fill);
  if (thin) strokeLines(g.engraving, 1, 0.7, thin);
  if (thin) for (const p of g.median) strokeLines(p.lines, 1, 0.6, thin > 1 ? 2 : 1);
  for (const p of g.median) p.marks?.forEach((m) => fill({ ...m, clip: m.clip ?? 'body' }));
  g.marks.forEach(fill);
  shapes.push({ d: body, stroke: INK, strokeWidth: edge });
  if (g.heavy.length && width >= 70)
    shapes.push({ d: g.heavy.map((h) => pathOf(h)).join(''), stroke: INK, strokeWidth: edge * 0.7, strokeOpacity: 0.9 });
  g.near.forEach((p) => drawPart(p));
  strokeLines(g.lines, 1, 0.85);
  for (const e of g.eyes) eye(e);

  function eye(e: Eye) {
    const r = e.r;
    if (e.ring) shapes.push({ d: circle(e.c, r * 1.45), fill: mix(paper, '#FFFFFF', 0.2), stroke: INK, strokeWidth: fine, strokeOpacity: 0.6 });
    if (e.iris) {
      shapes.push({ d: circle(e.c, r), fill: paint(e.iris), stroke: INK, strokeWidth: fine * 1.3 });
      if (e.pupil === 'w') shapes.push({ d: wPupil(e.c, r * 0.8), fill: INK });
      else if (e.pupil === 'bar') shapes.push({ d: barPupil(e.c, r * 0.75), fill: INK });
      else shapes.push({ d: circle(e.c, r * 0.55), fill: INK });
    } else shapes.push({ d: circle(e.c, r), fill: INK });
    shapes.push({ d: circle([e.c[0] - r * 0.3, e.c[1] - r * 0.32], Math.max(r * 0.2, 0.35 / scale)), fill: mix(paper, '#FFFFFF', 0.4) });
  }
  return { trunk, body, shapes: merged(shapes) };
}

/**
 * Every polygon wound the same way round, so that shapes of one colour can share a path without
 * their overlaps cancelling out.
 */
function wound(poly: Pt[]): Pt[] {
  let a = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) a += (poly[j][0] - poly[i][0]) * (poly[j][1] + poly[i][1]);
  return a < 0 ? poly.slice().reverse() : poly;
}

/** Runs of shapes drawn the same way, joined into one path each (far fewer elements to draw). */
function merged(shapes: PlateShape[]): PlateShape[] {
  const out: PlateShape[] = [];
  const style = (x: PlateShape) => `${x.fill}|${x.fillOpacity}|${x.stroke}|${x.strokeWidth}|${x.strokeOpacity}|${x.dash}|${x.clip}`;
  let key = '';
  for (const sh of shapes) {
    if (!sh.d) continue;
    const k = style(sh);
    if (out.length && k === key) out[out.length - 1] = { ...out[out.length - 1], d: out[out.length - 1].d + sh.d };
    else out.push(sh);
    key = k;
  }
  return out;
}

function circle(c: Pt, r: number): string {
  const f = (n: number) => String(Math.round(n * 100) / 100);
  return `M${f(c[0] - r)},${f(c[1])}a${f(r)},${f(r)} 0 1,0 ${f(2 * r)},0a${f(r)},${f(r)} 0 1,0 ${f(-2 * r)},0Z`;
}

function wPupil([x, y]: Pt, r: number): string {
  const f = (n: number) => String(Math.round(n * 100) / 100);
  return `M${f(x - r)},${f(y - r * 0.35)}C${f(x - r * 0.6)},${f(y + r * 0.6)} ${f(x - r * 0.2)},${f(y + r * 0.3)} ${f(x)},${f(y - r * 0.05)}C${f(x + r * 0.2)},${f(y + r * 0.3)} ${f(x + r * 0.6)},${f(y + r * 0.6)} ${f(x + r)},${f(y - r * 0.35)}C${f(x + r * 0.5)},${f(y + r * 0.1)} ${f(x - r * 0.5)},${f(y + r * 0.1)} ${f(x - r)},${f(y - r * 0.35)}Z`;
}

function barPupil([x, y]: Pt, r: number): string {
  const f = (n: number) => String(Math.round(n * 100) / 100);
  return `M${f(x - r)},${f(y)}C${f(x - r * 0.5)},${f(y - r * 0.32)} ${f(x + r * 0.5)},${f(y - r * 0.32)} ${f(x + r)},${f(y)}C${f(x + r * 0.5)},${f(y + r * 0.32)} ${f(x - r * 0.5)},${f(y + r * 0.32)} ${f(x - r)},${f(y)}Z`;
}

/** An SVG document for a plate (previews and tests; the app draws the shapes with react-native-svg). */
export function plateSvg(d: PlateDrawing, width: number, id = 'p'): string {
  const h = (width * PLATE_BOX.height) / PLATE_BOX.width;
  const attrs = (s: PlateShape) =>
    [
      `d="${s.d}"`,
      `fill="${s.fill ?? 'none'}"`,
      s.fillOpacity != null ? `fill-opacity="${s.fillOpacity}"` : '',
      s.stroke ? `stroke="${s.stroke}" stroke-width="${s.strokeWidth?.toFixed(3)}" stroke-linejoin="round" stroke-linecap="round"` : '',
      s.strokeOpacity != null ? `stroke-opacity="${s.strokeOpacity}"` : '',
      s.dash ? `stroke-dasharray="${s.dash}"` : '',
      s.clip ? `clip-path="url(#${id}-${s.clip})"` : '',
    ]
      .filter(Boolean)
      .join(' ');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${h.toFixed(1)}" viewBox="0 0 200 128"><defs><clipPath id="${id}-trunk"><path d="${d.trunk}"/></clipPath><clipPath id="${id}-body"><path d="${d.body}"/></clipPath></defs>${d.shapes.map((s) => `<path ${attrs(s)}/>`).join('')}</svg>`;
}

/** An engraved line as a filled sliver: full width in its middle, thinning to a point at its tapered ends. */
export function swell(line: Pt[], w: number, taper: 'both' | 'start' | 'end'): Pt[] {
  const len = polyLength(line);
  if (len < 0.5) return [];
  const pts = resample(line, Math.max(4, Math.min(160, Math.round(len / 0.9))));
  const n = pts.length;
  const k = Math.min(0.32, 6 / len);
  const left: Pt[] = [];
  const right: Pt[] = [];
  pts.forEach((p, i) => {
    const s = i / (n - 1);
    const a = taper === 'end' ? 1 : smoothstep(0, k * 1.6, s);
    const b = taper === 'start' ? 1 : 1 - smoothstep(1 - k * 1.6, 1, s);
    const h = (w / 2) * Math.max(0.04, Math.min(a, b));
    const nr = perp(norm(sub(pts[Math.min(n - 1, i + 1)], pts[Math.max(0, i - 1)])));
    left.push(add(p, mul(nr, h)));
    right.push(add(p, mul(nr, -h)));
  });
  return [...left, ...right.reverse()];
}

function luminance(hex: string): number {
  const n = parseInt(hex.replace('#', '').slice(0, 6), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}
