import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import React, { act } from 'react';
import { AccessibilityInfo, ActivityIndicator, Modal, Text } from 'react-native';
import { create } from 'react-test-renderer';

import { SharePreview } from '@/components/share/share-preview';
import { announce } from '@/lib/announce';

// The theme module imports the web stylesheet, which Jest can't parse.
jest.mock('@/global.css', () => ({}));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@/lib/announce', () => ({ announce: jest.fn() }));

let root;
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  announce.mockClear();
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
});
afterEach(async () => { if (root) await act(async () => root.unmount()); root = null; jest.useRealTimers(); });

const deferred = () => { let resolve; const promise = new Promise((r) => { resolve = r; }); return { promise, resolve }; };
function makeApi(over = {}) {
  return { shareCard: jest.fn(async () => ({ status: 'shared' })), saveCard: jest.fn(async () => ({ status: 'saved', message: 'Saved to your downloads.' })), prepareCard: jest.fn(async () => null), canSaveCard: false, ...over };
}
async function open(api, props = {}) {
  const onClose = jest.fn();
  await act(async () => {
    root = create(
      <SharePreview visible onClose={onClose} title="Share your discovery" cardLabel="Reef Manta Ray, epic" fileName="scubago-reef-manta-ray" api={api} {...props}>
        <Text>THE CARD</Text>
      </SharePreview>,
    );
  });
  return onClose;
}
const button = (label) => root.root.findAll((n) => n.props.accessibilityLabel === label && typeof n.props.onPress === 'function')[0];
const texts = () => root.root.findAll((n) => typeof n.children?.[0] === 'string').map((n) => n.children.join(''));
const disabled = (b) => !!(b.props.disabled || b.props['aria-disabled']);

describe('SharePreview', () => {
  test('shows nothing until it is opened', async () => {
    await act(async () => { root = create(<SharePreview visible={false} onClose={() => {}} title="t" cardLabel="c"><Text>THE CARD</Text></SharePreview>); });
    expect(root.toJSON()).toBeNull();
  });

  test('shows the card with Share and Close, and Download only where the platform offers it', async () => {
    const api = makeApi();
    await open(api);
    expect(texts()).toEqual(expect.arrayContaining(['Share your discovery', 'THE CARD', 'Share', 'Close']));
    expect(button('Share this card')).toBeTruthy();
    expect(button('Close the preview')).toBeTruthy();
    expect(button('Download this card as a picture')).toBeUndefined();
    await act(async () => root.unmount());

    await open(makeApi({ canSaveCard: true }));
    expect(button('Download this card as a picture')).toBeTruthy();
  });

  test('describes the card to a screen reader, which can’t read the picture', async () => {
    await open(makeApi());
    const image = root.root.find((n) => n.props.accessibilityRole === 'image');
    expect(image.props.accessibilityLabel).toBe('Reef Manta Ray, epic');
    const hidden = root.root.find((n) => n.props.importantForAccessibility === 'no-hide-descendants');
    expect(hidden.props.accessibilityElementsHidden).toBe(true);
  });

  test('lays the card out at its full size and captures that, not the scaled frame it is shown in', async () => {
    const api = makeApi();
    await open(api);
    const flat = (n) => Object.assign({}, ...[n.props.style].flat(Infinity).filter(Boolean));
    const full = root.root.findAll((n) => typeof n.type === 'string' && flat(n).width === 1080 && flat(n).height === 1350);
    // The scaled container, and inside it the card's own view.
    const scaled = full.find((n) => flat(n).transform);
    const card = full.find((n) => !flat(n).transform);
    expect(flat(scaled).transform[0].scale).toBeLessThan(1);
    expect(flat(scaled).transformOrigin).toBe('top left');
    expect(card.props.collapsable).toBe(false);
    // The frame around them is the size of what you see.
    const frame = root.root.find((n) => n.props.accessibilityRole === 'image');
    expect(flat(frame).width).toBeLessThan(1080);
    expect(flat(frame).width / flat(frame).height).toBeCloseTo(4 / 5, 1);

    await act(async () => button('Share this card').props.onPress());
    const [target] = api.shareCard.mock.calls[0];
    // The service is given a ref to the unscaled card view.
    expect(target.current).toBeTruthy();
  });

  test('Share hands the card to the share service with its title and file name', async () => {
    const api = makeApi();
    await open(api);
    await act(async () => button('Share this card').props.onPress());
    expect(api.shareCard).toHaveBeenCalledTimes(1);
    expect(api.shareCard.mock.calls[0][1]).toEqual({ title: 'Share your discovery', fileName: 'scubago-reef-manta-ray', prepared: null });
  });

  test('says it is busy while the picture is made, and doesn’t start a second share', async () => {
    const pending = deferred();
    const api = makeApi({ shareCard: jest.fn(() => pending.promise) });
    await open(api);
    await act(async () => { button('Share this card').props.onPress(); });
    expect(texts()).toContain('Making your picture…');
    expect(disabled(button('Making your picture'))).toBe(true);
    expect(root.root.findAllByType(ActivityIndicator)).toHaveLength(1);
    await act(async () => { button('Making your picture').props.onPress(); });
    expect(api.shareCard).toHaveBeenCalledTimes(1);
    await act(async () => pending.resolve({ status: 'shared' }));
    expect(texts()).toContain('Share');
    expect(disabled(button('Share this card'))).toBe(false);
  });

  test('shows no spinner under Reduce Motion, and the sheet doesn’t slide in', async () => {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
    const pending = deferred();
    await open(makeApi({ shareCard: jest.fn(() => pending.promise) }));
    expect(root.root.findByType(Modal).props.animationType).toBe('none');
    await act(async () => { button('Share this card').props.onPress(); });
    expect(texts()).toContain('Making your picture…');
    expect(root.root.findAllByType(ActivityIndicator)).toHaveLength(0);
    await act(async () => pending.resolve({ status: 'shared' }));
    await act(async () => root.unmount());
    AccessibilityInfo.isReduceMotionEnabled.mockResolvedValue(false);
    await open(makeApi());
    expect(root.root.findByType(Modal).props.animationType).toBe('slide');
  });

  test('tells the diver politely when it failed, and reads it aloud', async () => {
    const api = makeApi({ shareCard: jest.fn(async () => ({ status: 'error', message: 'Couldn’t make your picture. Please try again.' })) });
    await open(api);
    await act(async () => button('Share this card').props.onPress());
    expect(texts()).toContain('Couldn’t make your picture. Please try again.');
    expect(announce).toHaveBeenCalledWith('Couldn’t make your picture. Please try again.');
    // And they can try again.
    expect(disabled(button('Share this card'))).toBe(false);
  });

  test('says so when the device can’t share', async () => {
    await open(makeApi({ shareCard: jest.fn(async () => ({ status: 'unavailable', message: 'Sharing isn’t available on this device.' })) }));
    await act(async () => button('Share this card').props.onPress());
    expect(texts()).toContain('Sharing isn’t available on this device.');
  });

  test('carries on quietly when the diver shares or backs out', async () => {
    for (const status of ['shared', 'cancelled']) {
      const api = makeApi({ shareCard: jest.fn(async () => ({ status })) });
      await open(api, { note: '1 private sighting is left off this card.' });
      await act(async () => button('Share this card').props.onPress());
      expect(texts().some((t) => /Couldn|available|Saved/.test(t))).toBe(false);
      expect(texts()).toContain('1 private sighting is left off this card.');
      expect(announce).not.toHaveBeenCalled();
      await act(async () => root.unmount());
    }
  });

  test('Download saves the picture and says where it went', async () => {
    const api = makeApi({ canSaveCard: true });
    await open(api);
    await act(async () => button('Download this card as a picture').props.onPress());
    expect(api.saveCard).toHaveBeenCalledWith(expect.anything(), { title: 'Share your discovery', fileName: 'scubago-reef-manta-ray', prepared: null });
    expect(api.shareCard).not.toHaveBeenCalled();
    expect(texts()).toContain('Saved to your downloads.');
  });

  test('still shows a polite message if the service ever throws', async () => {
    await open(makeApi({ shareCard: jest.fn(async () => { throw new Error('boom'); }) }));
    await act(async () => button('Share this card').props.onPress());
    expect(texts()).toContain('Something went wrong. Please try again.');
  });

  test('Close closes it', async () => {
    const onClose = await open(makeApi());
    await act(async () => button('Close the preview').props.onPress());
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test('waits for a card that is still getting ready (an image loading), then draws it ahead of the tap', async () => {
    jest.useFakeTimers();
    const picture = { blob: 'png' };
    const api = makeApi({ prepareCard: jest.fn(async () => picture) });
    await open(api, { ready: false });
    expect(texts()).toContain('Getting it ready…');
    expect(disabled(button('Share this card'))).toBe(true);
    await act(async () => { jest.advanceTimersByTime(1000); });
    expect(api.prepareCard).not.toHaveBeenCalled();

    const onClose = jest.fn();
    await act(async () => root.update(
      <SharePreview visible onClose={onClose} title="Share your discovery" cardLabel="c" fileName="f" api={api} ready>
        <Text>THE CARD</Text>
      </SharePreview>,
    ));
    expect(disabled(button('Share this card'))).toBe(false);
    await act(async () => { jest.advanceTimersByTime(500); });
    expect(api.prepareCard).toHaveBeenCalledTimes(1);
    await act(async () => button('Share this card').props.onPress());
    expect(api.shareCard.mock.calls[0][1].prepared).toBe(picture);
  });

  describe('when what the card shows changes (the private switch, the hero picture)', () => {
    const sheet = (api, { content = 'shared', cardLabel = 'c' } = {}) => (
      <SharePreview visible onClose={() => {}} title="t" cardLabel={cardLabel} fileName="f" api={api} content={content}>
        <Text>THE CARD</Text>
      </SharePreview>
    );

    test.each([
      ['its content', { content: 'with private' }],
      ['its description', { cardLabel: 'c, and a whale shark' }],
    ])('throws away the picture drawn ahead when %s changes, and draws it again', async (_name, change) => {
      jest.useFakeTimers();
      const before = { blob: 'before' };
      const after = { blob: 'after' };
      const api = makeApi({ canSaveCard: true, prepareCard: jest.fn().mockResolvedValueOnce(before).mockResolvedValueOnce(after) });
      await act(async () => { root = create(sheet(api)); });
      await act(async () => { jest.advanceTimersByTime(500); });
      expect(api.prepareCard).toHaveBeenCalledTimes(1);
      await act(async () => root.update(sheet(api, change)));
      // Tapped before the new one is drawn: the service draws the card as it is now, not the old picture.
      await act(async () => button('Download this card as a picture').props.onPress());
      expect(api.saveCard.mock.calls[0][1].prepared).toBeNull();
      await act(async () => { jest.advanceTimersByTime(500); });
      expect(api.prepareCard).toHaveBeenCalledTimes(2);
      await act(async () => button('Share this card').props.onPress());
      expect(api.shareCard.mock.calls[0][1].prepared).toBe(after);
    });

    test('a picture of the old card that finishes late is dropped', async () => {
      jest.useFakeTimers();
      const late = deferred();
      const after = { blob: 'after' };
      const api = makeApi({ prepareCard: jest.fn().mockReturnValueOnce(late.promise).mockResolvedValueOnce(after) });
      await act(async () => { root = create(sheet(api)); });
      await act(async () => { jest.advanceTimersByTime(500); });
      await act(async () => root.update(sheet(api, { content: 'with private' })));
      await act(async () => { jest.advanceTimersByTime(500); });
      await act(async () => late.resolve({ blob: 'before' }));
      await act(async () => button('Share this card').props.onPress());
      expect(api.shareCard.mock.calls[0][1].prepared).toBe(after);
    });

    test('draws nothing again when nothing changed', async () => {
      jest.useFakeTimers();
      const api = makeApi({ prepareCard: jest.fn(async () => ({ blob: 'png' })) });
      await act(async () => { root = create(sheet(api)); });
      await act(async () => { jest.advanceTimersByTime(500); });
      await act(async () => root.update(sheet(api)));
      await act(async () => { jest.advanceTimersByTime(500); });
      expect(api.prepareCard).toHaveBeenCalledTimes(1);
    });
  });
});
