import { expect, test } from '@jest/globals';
import { OCEAN, seabedProfile, shelfStretch, waveOffset, type OceanConfig } from '../ocean';

const layers = Object.entries(OCEAN.waves);
const only = (name: string): OceanConfig => ({
  ...OCEAN,
  waves: Object.fromEntries(layers.map(([key, wave]) => [key, key === name ? wave : { ...wave, amplitude: 0 }])) as OceanConfig['waves'],
});

test('the waves stay calm around a steady mean level', () => {
  const crest = layers.reduce((sum, [, wave]) => sum + wave.amplitude, 0);
  expect(crest).toBeLessThan(.08);
  let sum = 0, samples = 0;
  for (let t = 0; t < 600; t += .5) {
    const { x, y, z } = waveOffset(1.3, -2.1, t);
    sum += y; samples++;
    expect(Math.abs(y)).toBeLessThanOrEqual(crest);
    // Crests only roll forward a little: no choppy, pinched water.
    expect(Math.hypot(x, z)).toBeLessThan(crest * .5);
  }
  expect(Math.abs(sum / samples)).toBeLessThan(.004);
});

test('each layer travels across the water at its own speed and heading', () => {
  for (const [name, wave] of layers) {
    const config = only(name);
    const angle = wave.direction * Math.PI / 180;
    for (const t of [3, 11.5, 40]) {
      const moved = waveOffset(.7 + Math.cos(angle) * wave.speed * t, -1.2 + Math.sin(angle) * wave.speed * t, t, config);
      expect(moved.y).toBeCloseTo(waveOffset(.7, -1.2, 0, config).y, 6);
    }
  }
});

test('layers cross at different angles and unrelated rhythms, so the surface never pulses as one', () => {
  const periods = layers.map(([, wave]) => wave.wavelength / wave.speed);
  for (let i = 0; i < layers.length; i++) {
    for (let j = i + 1; j < layers.length; j++) {
      const turn = Math.abs((((layers[i][1].direction - layers[j][1].direction) % 360) + 540) % 360 - 180);
      expect(turn).toBeGreaterThan(30);
      const ratio = Math.max(periods[i], periods[j]) / Math.min(periods[i], periods[j]);
      expect(Math.abs(ratio - Math.round(ratio))).toBeGreaterThan(.08);
    }
  }
  // The broad swell is the longest, tallest layer; smaller layers ride on it.
  expect(layers.every(([, wave]) => wave.wavelength <= OCEAN.waves.large.wavelength && wave.amplitude <= OCEAN.waves.large.amplitude)).toBe(true);
});

test('the seabed slopes from the beach to a shallow shelf, then deepens smoothly into open water', () => {
  let last = seabedProfile(-.5);
  let waterline = NaN;
  for (let d = -.49; d <= 6; d += .01) {
    const p = seabedProfile(d);
    expect(p.depth).toBeGreaterThanOrEqual(last.depth - 1e-9);
    expect(p.floor).toBeLessThanOrEqual(last.floor + 1e-9);
    expect(p.depth - last.depth).toBeLessThan(.03);
    expect(last.floor - p.floor).toBeLessThan(.03);
    if (Number.isNaN(waterline) && p.wet > 0) waterline = d;
    last = p;
  }
  expect(waterline).toBeGreaterThan(.05);
  expect(waterline).toBeLessThan(.25);
  expect(seabedProfile(.5).depth).toBeLessThan(.6);
  expect(seabedProfile(OCEAN.seabed.openDistance).depth).toBeCloseTo(OCEAN.seabed.openDepth);
});

test('the shelf widens and narrows around the coast within its tuned range', () => {
  let min = Infinity, max = -Infinity;
  for (let x = -6; x <= 6; x += .25) {
    for (let z = -6; z <= 6; z += .25) {
      const stretch = shelfStretch(x, z);
      min = Math.min(min, stretch); max = Math.max(max, stretch);
    }
  }
  expect(min).toBeGreaterThanOrEqual(1 - OCEAN.shelfVariation - 1e-9);
  expect(max).toBeLessThanOrEqual(1 + OCEAN.shelfVariation + 1e-9);
  expect(max - min).toBeGreaterThan(OCEAN.shelfVariation);
});

test('water shades from bright turquoise shallows to a richer, deeper blue-teal', () => {
  const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const luminance = (hex: string) => { const [r, g, b] = rgb(hex); return .2126 * r + .7152 * g + .0722 * b; };
  for (const palette of Object.values(OCEAN.palettes)) {
    expect(luminance(palette.shallow)).toBeGreaterThan(luminance(palette.mid));
    expect(luminance(palette.mid)).toBeGreaterThan(luminance(palette.deep));
    for (const color of [palette.shallow, palette.mid, palette.deep]) {
      const [r, g, b] = rgb(color);
      // Blue-green water, never gray or purple.
      expect(Math.min(g, b)).toBeGreaterThan(r + .15);
    }
  }
});

test('animals near the surface stay clear while deep divers take on the water color', () => {
  const { clearDepth, visibility, tintStrength } = OCEAN.underwater;
  const tint = (depth: number) => tintStrength * (1 - Math.exp(-Math.max(0, depth - clearDepth) / visibility));
  // Swimmers cruise with their backs about .76 below the surface and dive about 1.65 deeper.
  expect(tint(.76)).toBeLessThan(.15);
  expect(tint(.76 + 1.65)).toBeGreaterThan(.3);
});
