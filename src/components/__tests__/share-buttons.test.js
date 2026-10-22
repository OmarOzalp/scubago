import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import React, { act } from 'react';
import { Image, Modal, Switch } from 'react-native';
import { create } from 'react-test-renderer';

import { ShareArchipelagoButton, ShareDiscoveryButton, ShareDiveButton } from '@/components/share/share-buttons';
import { CATALOG_BY_ID } from '@/lib/catalog';
import { SITES } from '@/data/sites';

// The theme module imports the web stylesheet, which Jest can't parse.
jest.mock('@/global.css', () => ({}));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));

let root;
beforeEach(() => { global.IS_REACT_ACT_ENVIRONMENT = true; });
afterEach(async () => { if (root) await act(async () => root.unmount()); root = null; });

const sp = (id) => CATALOG_BY_ID.get(id);
const sighting = (id, speciesId, over = {}) => ({
  id, userId: 'local', username: 'you', speciesId, siteId: 'shark-yolanda', sightedOn: '2026-03-12', isDemo: false, synced: true, createdAt: '2026-03-12T10:00:00Z', ...over,
});
const dive = { id: 'd1', userId: 'local', number: 87, siteId: 'shark-yolanda', divedOn: '2026-03-12', centreName: 'Red Sea Divers', synced: true, createdAt: '2026-03-12T12:00:00Z' };
const site = SITES.find((s) => s.id === 'shark-yolanda');
const api = () => ({ shareCard: jest.fn(async () => ({ status: 'shared' })), saveCard: jest.fn(), prepareCard: jest.fn(async () => null), canSaveCard: false });

async function render(element) { await act(async () => { root = create(element); }); return root; }
const pressable = (label) => root.root.findAll((n) => n.props.accessibilityLabel === label && typeof n.props.onPress === 'function')[0];
/** The button with this hint (the paper buttons have no label of their own: their title is their name). */
const byHint = (hint) => root.root.findAll((n) => n.props.accessibilityHint === hint && typeof n.props.onPress === 'function')[0];
const texts = () => root.root.findAll((n) => typeof n.children?.[0] === 'string').map((n) => n.children.join(''));

describe('Share this discovery', () => {
  const render1 = (sightings) => render(<ShareDiscoveryButton species={sp('reef-manta')} sightings={sightings} sites={SITES} ownerId="local" api={api()} />);

  test('is there once the diver has shared a sighting of the species', async () => {
    await render1([sighting('a', 'reef-manta')]);
    expect(texts()).toContain('Share this discovery');
  });

  test.each([
    ['has not seen the species', [sighting('a', 'whale-shark')]],
    ['has no sightings at all', []],
    ['has only an example sighting of it', [sighting('a', 'reef-manta', { isDemo: true })]],
    ['only has someone else’s sighting of it', [sighting('a', 'reef-manta', { userId: 'someone' })]],
  ])('is not there when the diver %s', async (_name, sightings) => {
    await render1(sightings);
    expect(root.toJSON()).toBeNull();
  });

  test('is there for a species seen only on a private sighting, whose card shows it and says nothing goes until Share', async () => {
    await render1([sighting('a', 'reef-manta', { visibility: 'private' })]);
    await act(async () => byHint('Shows a picture of this discovery to share').props.onPress());
    expect(texts()).toEqual(expect.arrayContaining(['Reef Manta Ray', '1 private sighting is on this card. They stay private in your log; nothing is shared until you tap Share.']));
    // With nothing else to show there is no choice to make, so no switch.
    expect(root.root.findAllByType(Switch)).toHaveLength(0);
  });

  test('opens the preview with the discovery’s card, and Close puts it away', async () => {
    await render1([sighting('a', 'reef-manta', { notes: 'secret', notesPrivate: true })]);
    expect(root.root.findAllByType(Modal)).toHaveLength(0);
    await act(async () => byHint('Shows a picture of this discovery to share').props.onPress());
    expect(root.root.findAllByType(Modal)).toHaveLength(1);
    expect(texts()).toEqual(expect.arrayContaining(['Share your discovery', 'Reef Manta Ray', 'No. 1 in my collection']));
    expect(texts().join(' ')).not.toContain('secret');
    await act(async () => pressable('Close the preview').props.onPress());
    expect(root.root.findAllByType(Modal)).toHaveLength(0);
  });

  test('says when a private sighting was left off the card', async () => {
    await render1([sighting('a', 'reef-manta'), sighting('b', 'reef-manta', { visibility: 'private' })]);
    await act(async () => byHint('Shows a picture of this discovery to share').props.onPress());
    expect(texts()).toContain('1 private sighting is left off this card.');
  });
});

describe('Share this page', () => {
  test('is on every dive’s page, and its preview is that dive’s card', async () => {
    await render(<ShareDiveButton dive={dive} site={site} sightings={[sighting('a', 'reef-manta', { diveId: 'd1' }), sighting('b', 'whale-shark', { diveId: 'd1', visibility: 'private' })]} api={api()} />);
    expect(texts()).toContain('Share this page');
    await act(async () => byHint('Shows a picture of this logbook page to share').props.onPress());
    const shown = texts();
    expect(shown).toEqual(expect.arrayContaining(['Share this dive', 'Shark & Yolanda Reef', '87', 'Reef Manta Ray', 'NOT VERIFIED']));
    expect(shown).not.toContain('Whale Shark');
    expect(shown).toContain('1 private sighting is left off this card.');
  });

  test('shows the animals of a dive logged only as private sightings, and can leave them off again', async () => {
    // The bug this guards: a diver whose log is all "Only me" got a card saying nothing was logged.
    const mine = [sighting('a', 'reef-manta', { diveId: 'd1', visibility: 'private' }), sighting('b', 'whale-shark', { diveId: 'd1', visibility: 'private' })];
    await render(<ShareDiveButton dive={dive} site={site} sightings={mine} api={api()} />);
    await act(async () => byHint('Shows a picture of this logbook page to share').props.onPress());
    expect(texts()).toEqual(expect.arrayContaining(['Reef Manta Ray', 'Whale Shark', '2 private sightings are on this card. They stay private in your log; nothing is shared until you tap Share.']));
    expect(texts()).not.toContain('No sightings logged on this page yet.');
    const toggle = root.root.findByType(Switch);
    expect(toggle.props.value).toBe(true);
    expect(toggle.props.accessibilityLabel).toBe('Include my private sightings');
    await act(async () => toggle.props.onValueChange(false));
    expect(texts()).not.toContain('Whale Shark');
    // Left off, the page says the animals are private rather than that none were logged.
    expect(texts()).toEqual(expect.arrayContaining(['The animals from this dive are in my private log.', '2 private sightings are left off this card.']));
  });

  test('starts with private sightings off when others are shared, and puts them on at a tap', async () => {
    await render(<ShareDiveButton dive={dive} site={site} sightings={[sighting('a', 'reef-manta', { diveId: 'd1' }), sighting('b', 'whale-shark', { diveId: 'd1', visibility: 'private' })]} api={api()} />);
    await act(async () => byHint('Shows a picture of this logbook page to share').props.onPress());
    const toggle = root.root.findByType(Switch);
    expect(toggle.props.value).toBe(false);
    await act(async () => toggle.props.onValueChange(true));
    expect(texts()).toEqual(expect.arrayContaining(['Reef Manta Ray', 'Whale Shark']));
  });

  test('on the web, the picture drawn ahead is drawn again when the private switch is turned off', async () => {
    jest.useFakeTimers();
    try {
      const shark = () => texts().includes('Whale Shark');
      // What the web's prepareCard draws: the card as it is at that moment.
      const web = { ...api(), canSaveCard: true, saveCard: jest.fn(async () => ({ status: 'saved' })), prepareCard: jest.fn(async () => ({ blob: {}, shark: shark() })) };
      const mine = [sighting('a', 'reef-manta', { diveId: 'd1', visibility: 'private' }), sighting('b', 'whale-shark', { diveId: 'd1', visibility: 'private' })];
      await render(<ShareDiveButton dive={dive} site={site} sightings={mine} api={web} />);
      await act(async () => byHint('Shows a picture of this logbook page to share').props.onPress());
      await act(async () => { jest.advanceTimersByTime(500); });
      expect(web.prepareCard).toHaveBeenCalledTimes(1);
      await act(async () => root.root.findByType(Switch).props.onValueChange(false));
      await act(async () => { jest.advanceTimersByTime(500); });
      expect(web.prepareCard).toHaveBeenCalledTimes(2);
      await act(async () => pressable('Download this card as a picture').props.onPress());
      expect(web.saveCard.mock.calls[0][1].prepared).toEqual({ blob: {}, shark: false });
    } finally {
      jest.useRealTimers();
    }
  });

  test('is there even when nothing was logged on the dive', async () => {
    await render(<ShareDiveButton dive={dive} site={undefined} sightings={[]} api={api()} />);
    expect(texts()).toContain('Share this page');
  });
});

describe('Share your archipelago', () => {
  const props = { name: 'Kai’s Atoll', dives: [dive], ownerId: 'local' };

  test('is there once the diver has found a species', async () => {
    await render(<ShareArchipelagoButton {...props} sightings={[sighting('a', 'reef-manta')]} api={api()} />);
    expect(pressable('Share your archipelago')).toBeTruthy();
    await act(async () => pressable('Share your archipelago').props.onPress());
    expect(texts()).toEqual(expect.arrayContaining(['Share your archipelago', 'Kai’s Atoll', 'Reef Manta Ray']));
  });

  test.each([
    ['nothing logged', []],
    ['only example sightings', [sighting('a', 'reef-manta', { isDemo: true })]],
  ])('is not there with %s', async (_name, sightings) => {
    await render(<ShareArchipelagoButton {...props} sightings={sightings} api={api()} />);
    expect(root.toJSON()).toBeNull();
  });

  test('is there for a diver who logs privately, with their islands on the card', async () => {
    await render(<ShareArchipelagoButton {...props} sightings={[sighting('a', 'reef-manta', { visibility: 'private' })]} api={api()} />);
    await act(async () => pressable('Share your archipelago').props.onPress());
    expect(texts()).toEqual(expect.arrayContaining(['Kai’s Atoll', 'Reef Manta Ray', '1 private sighting is on this card. They stay private in your log; nothing is shared until you tap Share.']));
  });

  test('waits for the 3D snapshot to load before Share is ready', async () => {
    await render(<ShareArchipelagoButton {...props} sightings={[sighting('a', 'reef-manta')]} snapshot="file:///cache/island.png" api={api()} />);
    await act(async () => pressable('Share your archipelago').props.onPress());
    const share = () => pressable('Share this card');
    expect(share().props.disabled).toBe(true);
    expect(texts()).toContain('Getting it ready…');
    await act(async () => root.root.findAllByType(Image)[0].props.onLoad());
    expect(share().props.disabled).toBe(false);
  });

  describe('with a picture of the live 3D scene', () => {
    const sightings = [sighting('a', 'reef-manta')];
    const deferred = () => {
      let resolve, reject;
      const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
      return { promise, resolve, reject };
    };
    const hero = () => root.root.findAllByType(Image)[0];
    let revoke;
    beforeEach(() => { revoke = jest.fn(); Object.assign(URL, { revokeObjectURL: revoke }); });

    test('frames the islands while the preview is open, then shows the picture on the card and waits for it to load', async () => {
      const pending = deferred();
      const capture = jest.fn(() => pending.promise);
      await render(<ShareArchipelagoButton {...props} sightings={sightings} captureSnapshot={capture} api={api()} />);
      expect(capture).not.toHaveBeenCalled();
      await act(async () => pressable('Share your archipelago').props.onPress());
      // The preview is up at once, says what is going on, and holds Share.
      expect(root.root.findAllByType(Modal)).toHaveLength(1);
      expect(capture).toHaveBeenCalledTimes(1);
      expect(texts()).toContain('Framing your islands…');
      expect(pressable('Share this card').props.disabled).toBe(true);
      expect(root.root.findAllByType(Image)).toHaveLength(0);
      await act(async () => pending.resolve('blob:http://localhost/island'));
      expect(texts()).not.toContain('Framing your islands…');
      expect(hero().props.source).toEqual({ uri: 'blob:http://localhost/island' });
      // Not ready until the picture has loaded.
      expect(pressable('Share this card').props.disabled).toBe(true);
      await act(async () => hero().props.onLoad());
      expect(pressable('Share this card').props.disabled).toBe(false);
    });

    test('draws no island art while framing, so it doesn’t flash under the picture', async () => {
      const pending = deferred();
      await render(<ShareArchipelagoButton {...props} sightings={sightings} captureSnapshot={() => pending.promise} api={api()} />);
      const without = JSON.stringify(root.toJSON());
      await act(async () => pressable('Share your archipelago').props.onPress());
      const framing = JSON.stringify(root.toJSON());
      await act(async () => pending.resolve(null));
      const fallback = JSON.stringify(root.toJSON());
      expect(without).not.toContain('Framing');
      // The card's illustration (a lot of SVG) is missing while framing and back when there is no picture.
      expect(framing.length).toBeLessThan(fallback.length - 1000);
    });

    test('falls back to the illustration when there is no picture, and Share is ready', async () => {
      await render(<ShareArchipelagoButton {...props} sightings={sightings} captureSnapshot={async () => null} api={api()} />);
      await act(async () => pressable('Share your archipelago').props.onPress());
      expect(texts()).not.toContain('Framing your islands…');
      expect(root.root.findAllByType(Image)).toHaveLength(0);
      expect(pressable('Share this card').props.disabled).toBe(false);
    });

    test.each([
      ['rejects', () => Promise.reject(new Error('GL lost'))],
      ['throws', () => { throw new Error('no scene'); }],
    ])('falls back too when the capture %s', async (_name, capture) => {
      await render(<ShareArchipelagoButton {...props} sightings={sightings} captureSnapshot={capture} api={api()} />);
      await act(async () => pressable('Share your archipelago').props.onPress());
      expect(root.root.findAllByType(Image)).toHaveLength(0);
      expect(pressable('Share this card').props.disabled).toBe(false);
    });

    test('takes a fresh picture each time the preview opens, and lets go of the last one when it closes', async () => {
      const capture = jest.fn()
        .mockResolvedValueOnce('blob:http://localhost/one')
        .mockResolvedValueOnce('blob:http://localhost/two');
      await render(<ShareArchipelagoButton {...props} sightings={sightings} captureSnapshot={capture} api={api()} />);
      await act(async () => pressable('Share your archipelago').props.onPress());
      expect(hero().props.source.uri).toBe('blob:http://localhost/one');
      await act(async () => pressable('Close the preview').props.onPress());
      expect(revoke).toHaveBeenCalledWith('blob:http://localhost/one');
      await act(async () => pressable('Share your archipelago').props.onPress());
      expect(capture).toHaveBeenCalledTimes(2);
      expect(hero().props.source.uri).toBe('blob:http://localhost/two');
      // Not shown stale between openings.
      expect(revoke).not.toHaveBeenCalledWith('blob:http://localhost/two');
    });

    test('a picture that arrives after the preview was closed is let go, not shown', async () => {
      const pending = deferred();
      const capture = jest.fn().mockReturnValueOnce(pending.promise).mockResolvedValue(null);
      await render(<ShareArchipelagoButton {...props} sightings={sightings} captureSnapshot={capture} api={api()} />);
      await act(async () => pressable('Share your archipelago').props.onPress());
      await act(async () => pressable('Close the preview').props.onPress());
      await act(async () => pending.resolve('blob:http://localhost/late'));
      expect(revoke).toHaveBeenCalledWith('blob:http://localhost/late');
      expect(root.root.findAllByType(Modal)).toHaveLength(0);
      // Opening again takes a new picture; the late one doesn't come back.
      await act(async () => pressable('Share your archipelago').props.onPress());
      expect(capture).toHaveBeenCalledTimes(2);
      expect(root.root.findAllByType(Image)).toHaveLength(0);
    });

    test('lets go of the picture when the button goes away', async () => {
      await render(<ShareArchipelagoButton {...props} sightings={sightings} captureSnapshot={async () => 'blob:http://localhost/gone'} api={api()} />);
      await act(async () => pressable('Share your archipelago').props.onPress());
      await act(async () => root.unmount());
      root = null;
      expect(revoke).toHaveBeenCalledWith('blob:http://localhost/gone');
    });

    test('leaves a phone’s picture file alone (the system clears its cache)', async () => {
      await render(<ShareArchipelagoButton {...props} sightings={sightings} captureSnapshot={async () => 'file:///cache/GLView/a.png'} api={api()} />);
      await act(async () => pressable('Share your archipelago').props.onPress());
      await act(async () => pressable('Close the preview').props.onPress());
      expect(revoke).not.toHaveBeenCalled();
    });

    describe('while private sightings are left off the card', () => {
      // Home's scene shows every one of the diver's animals, private ones too.
      const privateShark = [sighting('a', 'reef-manta'), sighting('b', 'whale-shark', { visibility: 'private' })];
      const toggle = () => root.root.findByType(Switch);

      test('the card draws its illustration when they add an animal to the island, and the picture comes back with them', async () => {
        const pending = deferred();
        await render(<ShareArchipelagoButton {...props} sightings={privateShark} captureSnapshot={() => pending.promise} api={api()} />);
        await act(async () => pressable('Share your archipelago').props.onPress());
        expect(toggle().props.value).toBe(false);
        // Not held for a picture the card won't use.
        expect(texts()).not.toContain('Framing your islands…');
        expect(pressable('Share this card').props.disabled).toBe(false);
        await act(async () => pending.resolve('blob:http://localhost/island'));
        expect(root.root.findAllByType(Image)).toHaveLength(0);
        await act(async () => toggle().props.onValueChange(true));
        expect(hero().props.source.uri).toBe('blob:http://localhost/island');
        await act(async () => toggle().props.onValueChange(false));
        expect(root.root.findAllByType(Image)).toHaveLength(0);
      });

      test('a snapshot passed in is left off too', async () => {
        await render(<ShareArchipelagoButton {...props} sightings={privateShark} snapshot="file:///cache/island.png" api={api()} />);
        await act(async () => pressable('Share your archipelago').props.onPress());
        expect(root.root.findAllByType(Image)).toHaveLength(0);
        expect(pressable('Share this card').props.disabled).toBe(false);
      });

      test('the picture stays when they add nothing the island shows (another sighting of a species already on the card)', async () => {
        const mine = [sighting('a', 'reef-manta'), sighting('b', 'reef-manta', { visibility: 'private', sightedOn: '2026-03-13' })];
        await render(<ShareArchipelagoButton {...props} sightings={mine} captureSnapshot={async () => 'blob:http://localhost/island'} api={api()} />);
        await act(async () => pressable('Share your archipelago').props.onPress());
        expect(toggle().props.value).toBe(false);
        expect(hero().props.source.uri).toBe('blob:http://localhost/island');
      });
    });

    test('a snapshot passed in is used as it is, without taking another', async () => {
      const capture = jest.fn(async () => 'blob:http://localhost/other');
      await render(<ShareArchipelagoButton {...props} sightings={sightings} snapshot="file:///cache/island.png" captureSnapshot={capture} api={api()} />);
      await act(async () => pressable('Share your archipelago').props.onPress());
      expect(capture).not.toHaveBeenCalled();
      expect(hero().props.source.uri).toBe('file:///cache/island.png');
      expect(texts()).not.toContain('Framing your islands…');
    });
  });
});
