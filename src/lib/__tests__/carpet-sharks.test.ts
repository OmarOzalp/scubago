/**
 * The three carpet sharks (nurse, zebra, tasselled wobbegong): each swims as itself, lies on the bottom, rests
 * for long spells and then moves slowly, and its model is inside the budgets (docs/marine-species-art.md, batch v10).
 */
import { describe, expect, it } from '@jest/globals';
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { MARINE_ART } from '@/lib/marine-art';
import { hullOf, stanceOf, STANCES } from '@/lib/marine-bodies';
import { MOVEMENT } from '@/lib/marine-motion';
import { createSwimRig, SWIM_RIGS, type SharkRig } from '@/lib/marine-rigs';
import { marineModelFor, speciesMarineModel } from '@/lib/swimming';

const IDS = ['nurse-shark', 'zebra-shark', 'tasselled-wobbegong'] as const;
const DIR = join(__dirname, '../../../assets/models/marine');
const manifest = JSON.parse(readFileSync(join(DIR, 'species-manifest.json'), 'utf8')) as Record<string, { triangles: number; scientificName: string }>;

describe.each(IDS)('%s', (id) => {
  it('swims as itself, not as the shark family', () => {
    expect(speciesMarineModel(id)).toBe(id);
    expect(marineModelFor({ id, category: 'shark' } as never)).toBe(id);
    expect(MARINE_ART[id].name.length).toBeGreaterThan(5);
  });

  it('lies on the bottom, rests for long spells and then moves slowly', () => {
    expect(STANCES[id].kind).toBe('bottom');
    expect(stanceOf(id, id).kind).toBe('bottom');
    const move = MOVEMENT[id];
    expect(move.pause).toBeDefined();
    expect(move.pause!.hold).toBeGreaterThanOrEqual(move.pause!.every * .6);
    expect(move.cruise).toBeLessThanOrEqual(.25);
    // Low, broad bodies: they hang barely below their middle.
    expect(hullOf(id).keel).toBeLessThan(.25);
  });

  it('has a shark rig that all but stills its tail at rest and sways its whole body when it moves', () => {
    const rig = SWIM_RIGS[id] as SharkRig;
    expect(rig.kind).toBe('shark');
    expect(rig.hover).toBeLessThanOrEqual(.1);
    expect([...rig.joints]).toEqual([...rig.joints].sort((a, b) => a - b));
    const swim = createSwimRig(id), rest = createSwimRig(id);
    const tail = (r: typeof swim, effort: number) => {
      let widest = 0;
      for (let k = 0; k < 16; k++) {
        r.sample(k / 16 * Math.PI * 2, { effort, turn: 0, curvature: 0, climb: 0 });
        widest = Math.max(widest, Math.abs(r.offset.x), ...[...r.rotation].map(Math.abs));
      }
      return widest;
    };
    expect(tail(rest, .25)).toBeLessThan(tail(swim, 1) * .6);
  });

  it('is within the triangle and download budgets', () => {
    expect(manifest[id].triangles).toBeLessThan(5000);
    expect(statSync(join(DIR, `${id}.glb`)).size).toBeLessThan(220000);
  });
});

it('their scientific names are the ones the species list uses', () => {
  expect(manifest['nurse-shark'].scientificName).toBe('Ginglymostoma cirratum');
  expect(manifest['zebra-shark'].scientificName).toBe('Stegostoma tigrinum');
  expect(manifest['tasselled-wobbegong'].scientificName).toBe('Eucrossorhinus dasypogon');
});
