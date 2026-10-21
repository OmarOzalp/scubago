import { expect, test } from '@jest/globals';
import { sampleSwimPath, advanceSwimTime, hasSchool, islandPresence, marineModelFor, pickSwimmers, schoolSpeciesFor, noneSwim, speciesMarineModel, swimmerPages, swimsInSchool, MAX_ANIMATED } from '@/lib/swimming';
import { TUNA_SCHOOL } from '@/lib/tuna-school';
import type { DexEntry, Species } from '@/lib/types';

test('paths remain outside the island and always give finite continuous positions', () => {
  for (let lane = 0; lane < 12; lane++) {
    for (let time = 0; time < 120; time += .4) {
      const p = sampleSwimPath(time, lane);
      expect(Math.hypot(p.x, p.z)).toBeGreaterThan(2.7);
      expect([p.x, p.y, p.z, p.heading, p.bank].every(Number.isFinite)).toBe(true);
      const next = sampleSwimPath(time + .001, lane);
      expect(Math.hypot(next.x - p.x, next.z - p.z)).toBeLessThan(.01);
    }
  }
});
test('heading follows travel direction rather than flipping at turns', () => {
  for (let time = 0; time < 100; time++) {
    const p = sampleSwimPath(time, 0);
    const next = sampleSwimPath(time + .001, 0);
    const heading = Math.atan2(next.x - p.x, next.z - p.z);
    expect(Math.cos(p.heading - heading)).toBeGreaterThan(.999);
  }
});
test('pause freezes phase and a long background frame cannot jump the animation', () => {
  expect(advanceSwimTime(12, 10, false)).toBe(12);
  expect(advanceSwimTime(12, 10, true)).toBeCloseTo(12.05);
  expect(advanceSwimTime(12, .016, true)).toBeCloseTo(12.016);
});
test('sharks and rays select their own rigs', () => {
  expect(marineModelFor('shark')).toBe('shark');
  expect(marineModelFor('ray')).toBe('manta');
  expect(marineModelFor('fish')).toBe('reef-fish');
  expect(marineModelFor('turtle')).toBeNull();
});


function entry(id: string, category: Species['category']): DexEntry {
  return { species: { id, commonName: id, scientificName: id, category, rarity: 'common', blurb: '' }, count: 1, firstSeenOn: '2026-01-01', firstSeenSiteId: 'x', lastSeenOn: '2026-01-01' };
}

test('only species with a rig swim, in collection order, with lanes 0..n-1', () => {
  const residents = [entry('turtle-a', 'turtle'), entry('shark-a', 'shark'), entry('ray-a', 'ray'), entry('octo', 'cephalopod'), entry('fish-a', 'fish')];
  expect(pickSwimmers(residents)).toEqual([
    { species: residents[1].species, model: 'shark', lane: 0 },
    { species: residents[2].species, model: 'manta', lane: 1 },
    { species: residents[4].species, model: 'reef-fish', lane: 2 },
  ]);
  expect(pickSwimmers([])).toEqual([]);
  expect(pickSwimmers([entry('t', 'turtle')])).toEqual([]);
});

test('large collections are bounded and page deterministically, wrapping around', () => {
  const residents = Array.from({ length: 19 }, (_, i) => entry(`fish-${i}`, 'fish'));
  expect(swimmerPages(residents)).toBe(3);
  expect(pickSwimmers(residents, 0)).toHaveLength(MAX_ANIMATED);
  expect(pickSwimmers(residents, 0).map((s) => s.species.id)[0]).toBe('fish-0');
  expect(pickSwimmers(residents, 1).map((s) => s.species.id)[0]).toBe(`fish-${MAX_ANIMATED}`);
  expect(pickSwimmers(residents, 2)).toHaveLength(19 - 2 * MAX_ANIMATED);
  expect(pickSwimmers(residents, 3)).toEqual(pickSwimmers(residents, 0));
  expect(pickSwimmers(residents, 1)).toEqual(pickSwimmers(residents, 1));
  expect(swimmerPages([])).toBe(1);
  expect(swimmerPages([entry('t', 'turtle')])).toBe(1);
});

test('exact species receive distinct art before family fallbacks', () => {
  const residents = [entry('whale-shark', 'shark'), entry('tiger-shark', 'shark'), entry('great-white-shark', 'shark'), entry('other-shark', 'shark'), entry('reef-manta', 'ray'), entry('other-ray', 'ray')];
  expect(pickSwimmers(residents).map((s) => s.model)).toEqual(['whale-shark', 'tiger-shark', 'great-white-shark', 'shark', 'reef-manta', 'manta']);
  expect(marineModelFor(entry('unknown-turtle', 'turtle').species)).toBeNull();
});

test('logged tuna swim in the school, never also as a generic reef fish; other fish keep the family model', () => {
  const residents = [entry('clown-triggerfish', 'fish'), entry('yellowfin-tuna', 'fish'), entry('whale-shark', 'shark'), entry('dogtooth-tuna', 'fish'), entry('moorish-idol', 'fish')];
  expect(pickSwimmers(residents)).toEqual([
    { species: residents[0].species, model: 'reef-fish', lane: 0 },
    { species: residents[2].species, model: 'whale-shark', lane: 1 },
    { species: residents[4].species, model: 'reef-fish', lane: 2 },
  ]);
  expect(swimsInSchool('yellowfin-tuna')).toBe(true);
  expect(swimsInSchool('dogtooth-tuna')).toBe(true);
  expect(swimsInSchool('clown-triggerfish')).toBe(false);
  // The family fallback itself is untouched.
  expect(marineModelFor(residents[1].species)).toBe('reef-fish');
  expect(marineModelFor('fish')).toBe('reef-fish');
});

test('a collection of only tuna is shown by the school: not an empty ocean, no swimmers, and paging counts only animals of their own', () => {
  const tuna = [entry('yellowfin-tuna', 'fish')];
  expect(noneSwim(tuna)).toBe(false);
  expect(pickSwimmers(tuna)).toEqual([]);
  expect(swimmerPages(tuna)).toBe(1);
  expect(noneSwim([])).toBe(true);
  const crowd = [...Array.from({ length: MAX_ANIMATED }, (_, i) => entry(`fish-${i}`, 'fish')), entry('dogtooth-tuna', 'fish'), entry('yellowfin-tuna', 'fish')];
  expect(swimmerPages(crowd)).toBe(1);
  expect(pickSwimmers(crowd).map((s) => s.species.id)).toEqual(Array.from({ length: MAX_ANIMATED }, (_, i) => `fish-${i}`));
});

test('a tap on the school opens one tuna species: the logged one, preferring the species it is drawn after', () => {
  expect(schoolSpeciesFor([])).toBe('yellowfin-tuna');
  expect(schoolSpeciesFor([entry('clownfish', 'fish')])).toBe('yellowfin-tuna');
  expect(schoolSpeciesFor([entry('dogtooth-tuna', 'fish')])).toBe('dogtooth-tuna');
  expect(schoolSpeciesFor([entry('dogtooth-tuna', 'fish'), entry('yellowfin-tuna', 'fish')])).toBe('yellowfin-tuna');
});

test('the school swims only once a tuna is logged', () => {
  expect(hasSchool([])).toBe(false);
  expect(hasSchool([entry('clownfish', 'fish'), entry('whale-shark', 'shark')])).toBe(false);
  expect(hasSchool([entry('yellowfin-tuna', 'fish')])).toBe(true);
  expect(hasSchool([entry('clownfish', 'fish'), entry('dogtooth-tuna', 'fish')])).toBe(true);
});

test('with the school left out, tuna swim as fish again', () => {
  const size = TUNA_SCHOOL.size;
  TUNA_SCHOOL.size = 0;
  try {
    expect(swimsInSchool('yellowfin-tuna')).toBe(false);
    expect(pickSwimmers([entry('yellowfin-tuna', 'fish')]).map((s) => s.model)).toEqual(['reef-fish']);
  } finally {
    TUNA_SCHOOL.size = size;
  }
});

test('hammerheads and dolphins swim as their own models; their close relatives borrow them without claiming them', () => {
  expect(marineModelFor(entry('scalloped-hammerhead', 'shark').species)).toBe('scalloped-hammerhead');
  expect(marineModelFor(entry('bottlenose-dolphin', 'mammal').species)).toBe('bottlenose-dolphin');
  // The great hammerhead swims as the scalloped hammerhead, not the generic shark; the spinner dolphin as the bottlenose.
  expect(marineModelFor(entry('great-hammerhead', 'shark').species)).toBe('scalloped-hammerhead');
  expect(marineModelFor(entry('spinner-dolphin', 'mammal').species)).toBe('bottlenose-dolphin');
  // Neither is offered as its own 3D model.
  expect(speciesMarineModel('great-hammerhead')).toBeNull();
  expect(speciesMarineModel('spinner-dolphin')).toBeNull();
  expect(speciesMarineModel('scalloped-hammerhead')).toBe('scalloped-hammerhead');
  // Squid still have no model, so a collection of squid alone leaves the ocean empty.
  expect(marineModelFor(entry('bigfin-reef-squid', 'cephalopod').species)).toBeNull();
  expect(noneSwim([entry('bigfin-reef-squid', 'cephalopod')])).toBe(true);
  expect(pickSwimmers([entry('bigfin-reef-squid', 'cephalopod'), entry('spinner-dolphin', 'mammal'), entry('great-hammerhead', 'shark')]).map((s) => s.model))
    .toEqual(['bottlenose-dolphin', 'scalloped-hammerhead']);
});

test("the Open Ocean's whales, whitetip, leatherback and oceanic manta swim as their own models", () => {
  const ocean = [entry('humpback-whale', 'mammal'), entry('sperm-whale', 'mammal'), entry('oceanic-whitetip', 'shark'),
    entry('leatherback-turtle', 'turtle'), entry('oceanic-manta', 'ray')];
  for (const { species } of ocean) {
    expect(marineModelFor(species)).toBe(species.id);
    expect(speciesMarineModel(species.id)).toBe(species.id);
  }
  expect(noneSwim([entry('humpback-whale', 'mammal')])).toBe(false);
  expect(pickSwimmers(ocean).map((s) => s.model)).toEqual(['humpback-whale', 'sperm-whale', 'oceanic-whitetip', 'leatherback-turtle', 'oceanic-manta']);
  // The olive ridley swims as its fellow loggerhead (other turtles still have none); the reef manta is not the oceanic's.
  expect(marineModelFor(entry('olive-ridley-turtle', 'turtle').species)).toBe('loggerhead-turtle');
  expect(speciesMarineModel('olive-ridley-turtle')).toBeNull();
  expect(marineModelFor(entry('unknown-turtle', 'turtle').species)).toBeNull();
  expect(marineModelFor(entry('reef-manta', 'ray').species)).toBe('reef-manta');
});

test('the reef species swim as their own models; their close relatives borrow them; squid and nautilus still have none', () => {
  expect(marineModelFor(entry('day-octopus', 'cephalopod').species)).toBe('day-octopus');
  expect(marineModelFor(entry('giant-cuttlefish', 'cephalopod').species)).toBe('giant-cuttlefish');
  expect(marineModelFor(entry('giant-moray', 'fish').species)).toBe('giant-moray');
  for (const id of ['giant-pacific-octopus', 'blue-ringed-octopus', 'mimic-octopus', 'coconut-octopus']) expect(marineModelFor(entry(id, 'cephalopod').species)).toBe('day-octopus');
  for (const id of ['broadclub-cuttlefish', 'flamboyant-cuttlefish']) expect(marineModelFor(entry(id, 'cephalopod').species)).toBe('giant-cuttlefish');
  expect(marineModelFor(entry('green-moray', 'fish').species)).toBe('giant-moray');
  // Borrowed, never claimed as their own 3D model.
  expect(speciesMarineModel('blue-ringed-octopus')).toBeNull();
  expect(speciesMarineModel('green-moray')).toBeNull();
  // Other eels keep the fish family's model; squid and the nautilus have no model yet.
  expect(marineModelFor(entry('ribbon-eel', 'fish').species)).toBe('reef-fish');
  expect(marineModelFor(entry('bigfin-reef-squid', 'cephalopod').species)).toBeNull();
  expect(islandPresence(entry('chambered-nautilus', 'cephalopod').species)).toBeNull();
  expect(islandPresence(entry('mimic-octopus', 'cephalopod').species)).toBe('animal');
  // One species, one animal: each logged reef species takes one place among the island's animals.
  expect(pickSwimmers([entry('day-octopus', 'cephalopod'), entry('mimic-octopus', 'cephalopod'), entry('green-moray', 'fish')]).map((s) => [s.species.id, s.model]))
    .toEqual([['day-octopus', 'day-octopus'], ['mimic-octopus', 'day-octopus'], ['green-moray', 'giant-moray']]);
});

test('the six newer species swim as their own models; chevron barracuda borrow the great barracuda; the mammals and jellies without one stay off the island', () => {
  expect(marineModelFor(entry('great-barracuda', 'fish').species)).toBe('great-barracuda');
  expect(marineModelFor(entry('sailfish', 'fish').species)).toBe('sailfish');
  expect(marineModelFor(entry('clownfish', 'fish').species)).toBe('clownfish');
  expect(marineModelFor(entry('california-sea-lion', 'mammal').species)).toBe('california-sea-lion');
  expect(marineModelFor(entry('spotted-eagle-ray', 'ray').species)).toBe('spotted-eagle-ray');
  expect(marineModelFor(entry('golden-jellyfish', 'other').species)).toBe('golden-jellyfish');
  expect(marineModelFor(entry('chevron-barracuda', 'fish').species)).toBe('great-barracuda');
  expect(speciesMarineModel('chevron-barracuda')).toBeNull();
  // Other jellies are not golden: still no model of their own.
  expect(islandPresence(entry('moon-jellyfish', 'other').species)).toBeNull();
});

test("the Kelp Forest's seal, otter, garibaldi, seadragon and orca swim as their own models; their relatives borrow two", () => {
  for (const [id, category] of [['harbor-seal', 'mammal'], ['sea-otter', 'mammal'], ['garibaldi', 'fish'], ['leafy-seadragon', 'fish'], ['orca', 'mammal']] as const) {
    expect(marineModelFor(entry(id, category).species)).toBe(id);
    expect(speciesMarineModel(id)).toBe(id);
  }
  // The weedy seadragon swims as the leafy one, the wolf eel as the giant moray: borrowed, never claimed.
  expect(marineModelFor(entry('weedy-seadragon', 'fish').species)).toBe('leafy-seadragon');
  expect(marineModelFor(entry('wolf-eel', 'fish').species)).toBe('giant-moray');
  expect(speciesMarineModel('weedy-seadragon')).toBeNull();
  // The giant sea bass swims as the goliath grouper, its fellow giant; the lingcod keeps the fish family's model.
  expect(marineModelFor(entry('giant-sea-bass', 'fish').species)).toBe('goliath-grouper');
  expect(marineModelFor(entry('lingcod', 'fish').species)).toBe('reef-fish');
});
