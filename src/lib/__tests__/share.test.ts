import { describe, expect, it, jest } from '@jest/globals';

import { cardFileName, isCancellation, resultForError, toFileUri, CARD_SIZE, MESSAGES } from '@/components/share/card-spec';
import { canSaveCard, captureSize, DEFAULT_TITLE, prepareCard, saveCard, shareCard, type ShareDeps } from '../share';

jest.mock('expo-sharing', () => ({ isAvailableAsync: jest.fn(async () => true), shareAsync: jest.fn(async () => undefined) }));
jest.mock('react-native-view-shot', () => ({ captureRef: jest.fn(async () => '/var/tmp/ReactNative/card.png') }));

const ref = { current: { id: 'card' } };

function deps(over: Partial<ShareDeps> = {}) {
  const calls: string[] = [];
  const d = {
    capture: jest.fn(async () => {
      calls.push('capture');
      return 'file:///data/user/0/app/cache/card.png';
    }),
    isAvailable: jest.fn(async () => {
      calls.push('isAvailable');
      return true;
    }),
    share: jest.fn(async () => {
      calls.push('share');
    }),
    platform: 'android',
    pixelRatio: 3,
    ...over,
  } satisfies ShareDeps;
  return { d, calls };
}

describe('shareCard (iOS and Android)', () => {
  it('checks the device can share, draws the card as a 1080×1350 PNG file and opens the share sheet with it', async () => {
    const { d, calls } = deps();
    const result = await shareCard(ref, { title: 'Share your discovery' }, d);
    expect(result).toEqual({ status: 'shared' });
    expect(calls).toEqual(['isAvailable', 'capture', 'share']);
    expect(d.capture).toHaveBeenCalledWith(ref, { format: 'png', result: 'tmpfile', quality: 1, width: 1080, height: 1350 });
    expect(d.share).toHaveBeenCalledWith('file:///data/user/0/app/cache/card.png', { mimeType: 'image/png', UTI: 'public.png', dialogTitle: 'Share your discovery' });
  });

  it('gives the sheet a default title, and turns the bare path iOS returns into a file URI', async () => {
    const { d } = deps({ capture: jest.fn(async () => '/private/var/tmp/card.png'), platform: 'ios', pixelRatio: 3 });
    await shareCard(ref, {}, d);
    expect(d.share).toHaveBeenCalledWith('file:///private/var/tmp/card.png', expect.objectContaining({ dialogTitle: DEFAULT_TITLE }));
    // iOS counts the size in points and draws at the screen's scale: 360×450 pt at 3× is 1080×1350 px.
    expect(d.capture).toHaveBeenCalledWith(ref, expect.objectContaining({ width: 360, height: 450 }));
  });

  it('says so, and neither draws nor opens anything, when the device cannot share', async () => {
    const { d } = deps({ isAvailable: jest.fn(async () => false) });
    const result = await shareCard(ref, {}, d);
    expect(result).toEqual({ status: 'unavailable', message: MESSAGES.unavailable });
    expect(d.capture).not.toHaveBeenCalled();
    expect(d.share).not.toHaveBeenCalled();
  });

  it('treats a failing availability check as unavailable', async () => {
    const { d } = deps({ isAvailable: jest.fn(async () => { throw new Error('native module missing'); }) });
    expect(await shareCard(ref, {}, d)).toEqual({ status: 'unavailable', message: MESSAGES.unavailable });
  });

  it('reports a cancelled share as cancelled, not as an error', async () => {
    const abort = Object.assign(new Error('Share canceled'), { name: 'AbortError' });
    const { d } = deps({ share: jest.fn(async () => { throw abort; }) });
    expect(await shareCard(ref, {}, d)).toEqual({ status: 'cancelled' });
  });

  it('tells the diver politely when the picture could not be made, and does not open the sheet', async () => {
    const { d } = deps({ capture: jest.fn(async () => { throw new Error('The view cannot be captured'); }) });
    const result = await shareCard(ref, {}, d);
    expect(result).toEqual({ status: 'error', message: MESSAGES.capture });
    expect(d.share).not.toHaveBeenCalled();
  });

  it('treats an empty capture as a failure', async () => {
    const { d } = deps({ capture: jest.fn(async () => '') });
    expect((await shareCard(ref, {}, d)).status).toBe('error');
    expect(d.share).not.toHaveBeenCalled();
  });

  it('tells the diver politely when the share sheet failed, or another share is still open', async () => {
    const failing = deps({ share: jest.fn(async () => { throw new Error('Failed to share the file: boom'); }) });
    expect(await shareCard(ref, {}, failing.d)).toEqual({ status: 'error', message: MESSAGES.share });
    const busy = deps({ share: jest.fn(async () => { throw Object.assign(new Error('Another share request is being processed now.'), { code: 'ERR_SHARING_IN_PROGRESS' }); }) });
    expect(await shareCard(ref, {}, busy.d)).toEqual({ status: 'error', message: MESSAGES.busy });
  });

  it('never throws, whatever is thrown', async () => {
    const odd = deps({ capture: jest.fn(async () => { throw 'a string'; }), share: jest.fn(async () => { throw undefined; }) });
    await expect(shareCard(ref, {}, odd.d)).resolves.toEqual({ status: 'error', message: MESSAGES.capture });
    const odd2 = deps({ share: jest.fn(async () => { throw null; }) });
    await expect(shareCard(ref, {}, odd2.d)).resolves.toEqual({ status: 'error', message: MESSAGES.share });
  });

  it('uses expo-sharing and react-native-view-shot by default', async () => {
    const Sharing = jest.requireMock('expo-sharing') as { isAvailableAsync: jest.Mock; shareAsync: jest.Mock };
    const ViewShot = jest.requireMock('react-native-view-shot') as { captureRef: jest.Mock };
    const result = await shareCard(ref, { title: 'Share it' });
    expect(result).toEqual({ status: 'shared' });
    expect(Sharing.isAvailableAsync).toHaveBeenCalled();
    expect(ViewShot.captureRef).toHaveBeenCalledWith(ref, { format: 'png', result: 'tmpfile', quality: 1, ...captureSize() });
    expect(Sharing.shareAsync).toHaveBeenCalledWith('file:///var/tmp/ReactNative/card.png', { mimeType: 'image/png', UTI: 'public.png', dialogTitle: 'Share it' });
  });
});

describe('the rest of the native service', () => {
  it('asks Android for pixels and iOS for points at the screen scale', () => {
    expect(captureSize('android', 2.75)).toEqual({ width: CARD_SIZE.width, height: CARD_SIZE.height });
    expect(captureSize('ios', 3)).toEqual({ width: 360, height: 450 });
    expect(captureSize('ios', 2)).toEqual({ width: 540, height: 675 });
    expect(captureSize('ios', 0)).toEqual({ width: 1080, height: 1350 });
  });

  it('has nothing to prepare, and no Download, on a phone', async () => {
    expect(await prepareCard()).toBeNull();
    expect(canSaveCard).toBe(false);
    expect((await saveCard()).status).toBe('unavailable');
  });
});

describe('the card spec helpers', () => {
  it('recognises a diver backing out', () => {
    expect(isCancellation(Object.assign(new Error('x'), { name: 'AbortError' }))).toBe(true);
    expect(isCancellation({ code: 'ERR_SHARING_CANCELLED' })).toBe(true);
    expect(isCancellation(new Error('The user cancelled the share'))).toBe(true);
    expect(isCancellation(new Error('disk full'))).toBe(false);
    expect(isCancellation(undefined)).toBe(false);
    expect(isCancellation('cancelled')).toBe(false);
  });

  it('turns a thrown value into a result', () => {
    expect(resultForError(new Error('boom'), 'capture')).toEqual({ status: 'error', message: MESSAGES.capture });
    expect(resultForError(new Error('boom'), 'share')).toEqual({ status: 'error', message: MESSAGES.share });
    expect(resultForError(Object.assign(new Error('nope'), { code: 'ERR_UNAVAILABLE' }), 'share').status).toBe('unavailable');
  });

  it('makes safe file names and file URIs', () => {
    expect(cardFileName('Reef Manta Ray')).toBe('scubago-reef-manta-ray');
    expect(cardFileName('dive', 1204, 'Shark & Yolanda Reef')).toBe('scubago-dive-1204-shark-yolanda-reef');
    expect(cardFileName('Île de Bréhat!')).toBe('scubago-ile-de-brehat');
    expect(cardFileName('', undefined)).toBe('scubago-card');
    expect(toFileUri('/tmp/a.png')).toBe('file:///tmp/a.png');
    expect(toFileUri('file:///tmp/a.png')).toBe('file:///tmp/a.png');
  });
});
