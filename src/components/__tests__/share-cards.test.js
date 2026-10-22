import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import React, { act } from 'react';
import { create } from 'react-test-renderer';

import { CentreStamp } from '@/components/dive/marks';
import { ArchipelagoCard } from '@/components/share/archipelago-card';
import { archipelagoData, areaName, cardDate, diveCardData, discoveryData, sharedSightings, MAX_DIVE_SPECIES } from '@/components/share/card-data';
import { PALETTES } from '@/components/share/card-kit';
import { DiscoveryCard } from '@/components/share/discovery-card';
import { DiveLogCard, stampLook } from '@/components/share/dive-log-card';
import { CATALOG_BY_ID } from '@/lib/catalog';
import { SITES } from '@/data/sites';
import { Colors } from '@/constants/theme';

// The theme module imports the web stylesheet, which Jest can't parse.
jest.mock('@/global.css', () => ({}));
// The phone's colour scheme, so a card can be drawn in both.
let mockScheme = 'light';
jest.mock('react-native/Libraries/Utilities/useColorScheme', () => ({ __esModule: true, default: () => mockScheme }));
jest.mock('react-native-reanimated', () => ({ __esModule: true, useReducedMotion: () => false, default: { View: require('react-native').View } }));

const sp = (id) => CATALOG_BY_ID.get(id);
let root;
beforeEach(() => { global.IS_REACT_ACT_ENVIRONMENT = true; mockScheme = 'light'; });
afterEach(async () => { if (root) await act(async () => root.unmount()); root = null; });

async function render(element) {
  await act(async () => { root = create(element); });
  return root;
}
/** Every piece of text on the card, in order. */
function words(tree) {
  const out = [];
  const walk = (node) => {
    if (node == null) return;
    if (typeof node === 'string') out.push(node);
    else if (Array.isArray(node)) node.forEach(walk);
    else walk(node.children);
  };
  walk(tree.toJSON());
  return out;
}
const lines = (tree) => words(tree).join(' | ');
const colours = (tree) => [...new Set(JSON.stringify(tree.toJSON()).match(/#[0-9A-Fa-f]{6}\b/g) ?? [])].map((c) => c.toUpperCase()).sort();

describe('DiscoveryCard', () => {
  const props = { species: sp('reef-manta'), firstSeenOn: '2026-03-12', siteName: 'Ras Mohammed', collectionNumber: 23 };

  test('says what the diver found, its tier, when and where they first saw it, and where it sits in their collection', async () => {
    const tree = await render(<DiscoveryCard {...props} />);
    const text = lines(tree);
    expect(text).toContain('ScubaGo');
    expect(text).toContain('Reef Manta Ray');
    expect(text).toContain(sp('reef-manta').scientificName);
    expect(text).toContain('Epic');
    expect(text).toContain('First seen 12 Mar 2026 · Ras Mohammed');
    expect(text).toContain('No. 23 in my collection');
    expect(text).toContain('Lives in the Coral Reef');
    expect(text).toContain('Log your dives. Grow your own archipelago.');
    // No line of real data was given, so none is made up.
    expect(text).not.toContain('Recorded at');
  });

  test('sets a line of real data in its slot when it is given one', async () => {
    const tree = await render(<DiscoveryCard {...props} observedNote="Recorded at 4% of Red Sea sites" />);
    expect(lines(tree)).toContain('Recorded at 4% of Red Sea sites');
  });

  test('leaves the site out when it is not known', async () => {
    const tree = await render(<DiscoveryCard {...props} siteName={undefined} />);
    expect(words(tree)).toContain('First seen 12 Mar 2026');
  });

  test('puts epic and legendary finds on the twilight page and the rest on paper', async () => {
    let tree = await render(<DiscoveryCard {...props} />);
    expect(colours(tree)).toContain(PALETTES.twilight.page.toUpperCase());
    await act(async () => tree.unmount());
    tree = await render(<DiscoveryCard {...props} species={sp('clownfish')} />);
    expect(colours(tree)).toContain(PALETTES.paper.page.toUpperCase());
    expect(colours(tree)).not.toContain(PALETTES.twilight.page.toUpperCase());
    await act(async () => tree.unmount());
    tree = await render(<DiscoveryCard {...props} species={sp('clownfish')} tone="twilight" />);
    expect(colours(tree)).toContain(PALETTES.twilight.page.toUpperCase());
  });

  test('is drawn the same whether the phone is in light or dark mode', async () => {
    const draw = async (scheme, species) => {
      mockScheme = scheme;
      const tree = await render(<DiscoveryCard {...props} species={species} observedNote="Recorded at 4% of Red Sea sites" />);
      const result = { words: words(tree), colours: colours(tree) };
      await act(async () => tree.unmount());
      return result;
    };
    for (const species of [sp('reef-manta'), sp('clownfish')]) {
      const light = await draw('light', species);
      const dark = await draw('dark', species);
      expect(dark).toEqual(light);
      // None of the night-dive scheme's colours.
      for (const c of [Colors.dark.background, Colors.dark.backgroundElement, Colors.dark.text]) expect(dark.colours).not.toContain(c.toUpperCase());
    }
  });
});

describe('DiveLogCard', () => {
  const dive = {
    number: 1204, siteName: 'Shark & Yolanda Reef', region: 'Ras Mohammed, Egypt', divedOn: '2026-03-12',
    maxDepthM: 28.5, bottomTimeMin: 52, waterTempC: 26, visibilityM: 30,
    species: ['whale-shark', 'reef-manta', 'grey-reef-shark'].map(sp), centreName: 'Red Sea Divers', buddyName: 'Maria Lindqvist',
  };

  test('is a logbook page: the number in its margin box, the site, region and day, the measurements, the animals seen, the buddy and the centre stamp', async () => {
    const tree = await render(<DiveLogCard {...dive} />);
    const text = words(tree);
    expect(text).toContain('NO.');
    expect(text).toContain('1,204');
    expect(text).toContain('Shark & Yolanda Reef');
    expect(text).toContain('Ras Mohammed, Egypt');
    expect(text).toContain('12 Mar 2026');
    expect(text).toEqual(expect.arrayContaining(['28.5', '52', '26', '30', 'MAX DEPTH', 'BOTTOM TIME', 'WATER TEMP', 'VISIBILITY']));
    expect(text).toEqual(expect.arrayContaining(['Whale Shark', 'Reef Manta Ray', 'Grey Reef Shark']));
    expect(text).toContain('Maria Lindqvist');
    expect(text).toContain('RED SEA DIVERS');
    expect(text).toContain('ScubaGo');
  });

  test('the dive centre’s stamp keeps reading NOT VERIFIED', async () => {
    const tree = await render(<DiveLogCard {...dive} />);
    expect(words(tree)).toContain('NOT VERIFIED');
    expect(lines(tree)).not.toMatch(/\bVERIFIED\b(?<!NOT VERIFIED)/);
    const stamp = tree.root.findAll((n) => /not verified by the centre/.test(n.props.accessibilityLabel ?? ''));
    expect(stamp.length).toBeGreaterThan(0);
  });

  test('leaves out the measurements, buddy and stamp that are missing', async () => {
    const tree = await render(<DiveLogCard {...dive} maxDepthM={undefined} waterTempC={undefined} visibilityM={undefined} centreName={undefined} buddyName={undefined} />);
    const text = words(tree);
    expect(text).toEqual(expect.arrayContaining(['52', 'BOTTOM TIME']));
    expect(text).not.toContain('MAX DEPTH');
    expect(text).not.toContain('WATER TEMP');
    expect(text).not.toContain('VISIBILITY');
    expect(text).not.toContain('NOT VERIFIED');
    expect(text).not.toContain('Dived with');
  });

  test('shows a few animals as plates and says how many more', async () => {
    const many = ['whale-shark', 'reef-manta', 'grey-reef-shark', 'napoleon-wrasse', 'moorish-idol', 'giant-moray', 'green-turtle', 'clownfish'].map(sp);
    let tree = await render(<DiveLogCard {...dive} species={many} />);
    let text = words(tree);
    // Eight animals: five plates and a tile for the other three.
    expect(text.filter((t) => many.some((s) => s.commonName === t))).toHaveLength(MAX_DIVE_SPECIES - 1);
    expect(text).toContain('+3');
    await act(async () => tree.unmount());
    // Exactly six fit without a "more" tile.
    tree = await render(<DiveLogCard {...dive} species={many.slice(0, 6)} />);
    text = words(tree);
    expect(text.filter((t) => many.some((s) => s.commonName === t))).toHaveLength(6);
    expect(text.some((t) => /^\+\d+$/.test(t))).toBe(false);
  });

  test('a page with nothing on it says so', async () => {
    const tree = await render(<DiveLogCard number={3} siteName="Somewhere" divedOn="2026-01-02" species={[]} />);
    expect(lines(tree)).toContain('No sightings logged on this page yet.');
  });

  test('leaves the dive’s notes off unless it is given them', async () => {
    let tree = await render(<DiveLogCard {...dive} />);
    expect(lines(tree)).not.toContain('Surge');
    await act(async () => tree.unmount());
    tree = await render(<DiveLogCard {...dive} notes="Surge at the corner, calm after." />);
    expect(lines(tree)).toContain('Surge at the corner, calm after.');
  });

  test('draws the stamp as the dive’s page does: the same angle and ink for the same name', async () => {
    const tree = await render(<CentreStamp name="Red Sea Divers" divedOn="2026-03-12" number={1204} />);
    const stamp = tree.root.find((n) => n.props.accessibilityRole === 'image');
    const style = Object.assign({}, ...[stamp.props.style].flat(Infinity).filter(Boolean));
    const look = stampLook('Red Sea Divers');
    expect(style.transform).toEqual([{ rotate: `${look.rotate}deg` }]);
    expect(style.borderColor).toBe(look.ink);
    for (const name of ['Blue Fin Dive Centre', 'Aquanaut', 'Coral Bay Divers']) {
      expect(stampLook(name).ink).toMatch(/^#(0E6F78|B8371F)$/i);
    }
  });
});

describe('ArchipelagoCard', () => {
  const props = {
    name: 'Kai’s Atoll', rank: 'Reef Guardian', level: 4, speciesCount: 27, islandsFound: 3, sitesDived: 14,
    rarest: ['whale-shark', 'great-white-shark', 'reef-manta', 'clownfish'].map(sp), islands: ['coral-reef', 'kelp-forest', 'volcanic-pinnacle'],
  };

  test('shows the island’s name, how far it has grown and the three rarest finds', async () => {
    const tree = await render(<ArchipelagoCard {...props} />);
    const text = words(tree);
    expect(text).toContain('Kai’s Atoll');
    expect(text).toContain('Reef Guardian');
    expect(text).toEqual(expect.arrayContaining(['4', '27', '3', '/5', '14', 'LEVEL', 'SPECIES', 'ISLANDS', 'SITES DIVED']));
    expect(text).toEqual(expect.arrayContaining(['Whale Shark', 'Great White Shark', 'Reef Manta Ray', 'Legendary', 'Epic']));
    // Only three finds, however many are passed.
    expect(text).not.toContain('Ocellaris Clownfish');
    expect(text).toContain('ScubaGo');
  });

  test('falls back to an illustration of the islands when there is no snapshot of the 3D scene', async () => {
    const onSettled = jest.fn();
    const tree = await render(<ArchipelagoCard {...props} onSettled={onSettled} />);
    expect(tree.root.findAllByType(require('react-native').Image)).toHaveLength(0);
    expect(onSettled).toHaveBeenCalled();
  });

  test('draws the snapshot over the illustration once it has loaded, and says when it is ready; a snapshot that fails leaves the illustration', async () => {
    const { Image } = require('react-native');
    const onSettled = jest.fn();
    const tree = await render(<ArchipelagoCard {...props} snapshot="file:///cache/island.png" onSettled={onSettled} />);
    const [image] = tree.root.findAllByType(Image);
    expect(image.props.source).toEqual({ uri: 'file:///cache/island.png' });
    expect(image.props.resizeMode).toBe('cover');
    expect(onSettled).not.toHaveBeenCalled();
    await act(async () => image.props.onLoad());
    expect(onSettled).toHaveBeenCalledTimes(1);
    expect(tree.root.findAllByType(Image)[0].props.style[1].opacity).toBe(1);
    await act(async () => tree.unmount());

    const failed = jest.fn();
    const tree2 = await render(<ArchipelagoCard {...props} snapshot="file:///gone.png" onSettled={failed} />);
    await act(async () => tree2.root.findAllByType(Image)[0].props.onError());
    expect(failed).toHaveBeenCalled();
    expect(tree2.root.findAllByType(Image)).toHaveLength(0);
  });

  test('draws no illustration while the picture is being taken or loading, and brings it back if there is none or it fails', async () => {
    const { Image } = require('react-native');
    const size = (tree) => JSON.stringify(tree.toJSON()).length;
    const plain = await render(<ArchipelagoCard {...props} />);
    const withArt = size(plain);
    await act(async () => plain.unmount());
    // Being taken: calm water only, and no picture yet.
    const framing = await render(<ArchipelagoCard {...props} framing />);
    expect(size(framing)).toBeLessThan(withArt - 1000);
    expect(framing.root.findAllByType(Image)).toHaveLength(0);
    // Taken, loading: the picture isn't visible yet, and the illustration isn't there to flash under it.
    await act(async () => framing.update(<ArchipelagoCard {...props} snapshot="blob:http://localhost/island" />));
    expect(size(framing)).toBeLessThan(withArt - 1000);
    // Loaded: the picture is the hero. Failed: the illustration is back.
    await act(async () => framing.root.findAllByType(Image)[0].props.onLoad());
    expect(framing.root.findAllByType(Image)[0].props.style[1].opacity).toBe(1);
    await act(async () => framing.update(<ArchipelagoCard {...props} snapshot="blob:http://localhost/gone" />));
    await act(async () => framing.root.findAllByType(Image)[0].props.onError());
    expect(framing.root.findAllByType(Image)).toHaveLength(0);
    expect(size(framing)).toBeGreaterThan(withArt - 200);
  });

  test('draws each island in the illustration with its own shore (the habitat the 3D scene gives it)', async () => {
    const { IslandArt } = require('@/components/home/island-art');
    const tree = await render(<ArchipelagoCard {...props} islands={['coral-reef', 'kelp-forest', 'volcanic-pinnacle', 'mangroves', 'shipwreck']} />);
    expect(tree.root.findAllByType(IslandArt.type).map((art) => art.props.habitat)).toEqual(['island', 'kelp', 'volcanic', 'mangrove', 'wreck']);
  });

  test('is drawn the same whether the phone is in light or dark mode', async () => {
    const draw = async (scheme) => {
      mockScheme = scheme;
      const tree = await render(<ArchipelagoCard {...props} />);
      const result = { words: words(tree), colours: colours(tree) };
      await act(async () => tree.unmount());
      return result;
    };
    expect(await draw('dark')).toEqual(await draw('light'));
  });
});

// ── What goes on a card, and what never does ─────────────────────────────────────────────────────

const sighting = (id, speciesId, over = {}) => ({
  id, userId: 'local', username: 'you', speciesId, siteId: 'shark-yolanda', sightedOn: '2026-03-12', isDemo: false, synced: true,
  createdAt: `2026-03-12T10:0${id.length}:00Z`, ...over,
});
const SECRET = 'SECRET-NOTE-ONLY-FOR-ME';
const PHOTO = 'file:///photos/PRIVATE-PHOTO.jpg';

describe('what goes on a card', () => {
  const dive = { id: 'd1', userId: 'local', number: 87, siteId: 'shark-yolanda', divedOn: '2026-03-12', centreName: 'Red Sea Divers', buddyName: 'Maria', notes: 'Dive notes only for me', signature: { name: 'Maria L.', svg: 'M0,0L10,10', at: '2026-03-12T12:00:00Z' }, synced: true, createdAt: '2026-03-12T12:00:00Z' };
  const site = SITES.find((s) => s.id === 'shark-yolanda');
  const sightings = [
    sighting('a', 'reef-manta', { diveId: 'd1', notes: SECRET, notesPrivate: true, photoUri: PHOTO, photoPrivate: true }),
    sighting('b', 'whale-shark', { diveId: 'd1', visibility: 'private', notes: SECRET, photoUri: PHOTO }),
    sighting('c', 'clownfish', { diveId: 'd1', notes: 'public note', sightedOn: '2026-03-13' }),
    sighting('d', 'tiger-shark', { diveId: 'd1', isDemo: true }),
    sighting('e', 'grey-reef-shark', { diveId: 'd1', userId: 'someone-else' }),
    sighting('f', 'napoleon-wrasse'),
  ];

  test('a sighting marked private, an example sighting and another diver’s are not the diver’s to share', () => {
    expect(sharedSightings(sightings, 'local').map((s) => s.id)).toEqual(['a', 'c', 'f']);
  });

  test('a species found only on a private sighting has no discovery card', () => {
    expect(discoveryData(sp('whale-shark'), sightings, SITES, 'local')).toBeNull();
    expect(discoveryData(sp('tiger-shark'), sightings, SITES, 'local')).toBeNull();
    expect(discoveryData(sp('reef-manta'), sightings, SITES, 'local')).not.toBeNull();
  });

  test('a discovery is numbered by the order it joined the collection, from the first sighting’s date and site', () => {
    const joined = [
      sighting('1', 'napoleon-wrasse', { createdAt: '2026-01-01T00:00:00Z', sightedOn: '2026-01-01', siteId: 'richelieu-rock' }),
      sighting('2', 'reef-manta', { createdAt: '2026-02-01T00:00:00Z', sightedOn: '2026-02-01' }),
      sighting('3', 'reef-manta', { createdAt: '2026-05-01T00:00:00Z', sightedOn: '2025-12-24', siteId: 'richelieu-rock' }),
      sighting('4', 'clownfish', { createdAt: '2026-03-01T00:00:00Z', visibility: 'private' }),
      sighting('5', 'whale-shark', { createdAt: '2026-04-01T00:00:00Z' }),
    ];
    const manta = discoveryData(sp('reef-manta'), joined, SITES, 'local');
    expect(manta).toMatchObject({ collectionNumber: 2, firstSeenOn: '2025-12-24', siteName: 'Richelieu Rock', areaId: 'coral-reef' });
    // The private clownfish doesn't take a number: the whale shark is third.
    expect(discoveryData(sp('whale-shark'), joined, SITES, 'local').collectionNumber).toBe(3);
    expect(areaName(manta.areaId)).toBe('Coral Reef');
  });

  test('the dive card lists only shared animals, rarest first, and leaves the dive’s notes and the signature off', () => {
    const data = diveCardData(dive, site, sightings);
    expect(data.species.map((s) => s.id)).toEqual(['reef-manta', 'clownfish']);
    expect(data.notes).toBeUndefined();
    expect(data).toMatchObject({ number: 87, siteName: 'Shark & Yolanda Reef', region: 'Ras Mohammed, Egypt', centreName: 'Red Sea Divers', buddyName: 'Maria' });
    expect(JSON.stringify(data)).not.toMatch(/signature|Maria L\.|lat|lng|27\.7/);
    expect(diveCardData(dive, site, sightings, { includeNotes: true }).notes).toBe('Dive notes only for me');
  });

  test('the archipelago card counts only what is shared', () => {
    const data = archipelagoData('  ', sightings, [dive, { siteId: 'richelieu-rock', userId: 'local' }, { siteId: 'sail-rock', userId: 'someone-else' }], 'local');
    expect(data).toMatchObject({ name: 'My little island', speciesCount: 3, sitesDived: 2 });
    expect(data.rarest.map((s) => s.id)).toEqual(['reef-manta', 'napoleon-wrasse', 'clownfish']);
    expect(archipelagoData('x', [sighting('p', 'reef-manta', { visibility: 'private' })], [], 'local')).toBeNull();
  });

  test.each([
    ['discovery', () => { const d = discoveryData(sp('reef-manta'), sightings, SITES, 'local'); return <DiscoveryCard species={d.species} firstSeenOn={d.firstSeenOn} siteName={d.siteName} collectionNumber={d.collectionNumber} />; }],
    ['dive', () => <DiveLogCard {...diveCardData(dive, site, sightings)} />],
    ['archipelago', () => { const d = archipelagoData('Home', sightings, [dive], 'local'); return <ArchipelagoCard {...d} />; }],
  ])('the %s card has no private notes, photos, private animals, coordinates or signatures on it', async (_name, card) => {
    const tree = await render(card());
    const everything = JSON.stringify(tree.toJSON());
    expect(everything).not.toContain(SECRET);
    expect(everything).not.toContain('PRIVATE-PHOTO');
    expect(everything).not.toContain('public note');
    expect(everything).not.toContain('Dive notes only for me');
    expect(everything).not.toContain('Maria L.');
    expect(everything).not.toMatch(/27\.723|34\.257|"lat"|"lng"/);
    // The private whale shark, the example tiger shark and another diver's grey reef shark.
    for (const hidden of ['Whale Shark', 'Tiger Shark', 'Grey Reef Shark']) expect(lines(tree)).not.toContain(hidden);
  });

  test('dates are written the same way everywhere', () => {
    expect(cardDate('2026-03-12')).toBe('12 Mar 2026');
    expect(cardDate('2026-12-01')).toBe('1 Dec 2026');
    expect(cardDate('nonsense')).toBe('nonsense');
  });
});
