import { describe, expect, it, jest } from '@jest/globals';

import { MESSAGES } from '@/components/share/card-spec';
import { canSaveCard, prepareCard, saveCard, shareCard, unscaleParents, type ShareDeps } from '../share.web';

const png = () => new Blob(['png'], { type: 'image/png' });
const target = { current: { tag: 'div' } };

function deps(over: Partial<ShareDeps> = {}) {
  const shareMock = jest.fn(async (_data: ShareData) => undefined);
  const d = {
    shareMock,
    capture: jest.fn(async () => png()),
    nav: {
      canShare: jest.fn((data: ShareData) => !!data.files?.length),
      share: shareMock,
    },
    download: jest.fn(),
    makeFile: jest.fn((blob: Blob, fileName: string) => ({ blob, name: fileName, type: 'image/png' }) as unknown as File),
    ...over,
  } satisfies ShareDeps & { shareMock: unknown };
  return d;
}

describe('sharing a card on the web', () => {
  it('opens the browser share dialog with the card as a PNG file when the browser can share files', async () => {
    const d = deps();
    const result = await shareCard(target, { title: 'Share your dive', fileName: 'scubago-dive-87' }, d);
    expect(result).toEqual({ status: 'shared' });
    expect(d.makeFile).toHaveBeenCalledWith(expect.any(Blob), 'scubago-dive-87.png');
    const data = d.shareMock.mock.calls[0][0] as ShareData;
    expect(data.title).toBe('Share your dive');
    expect(data.files).toHaveLength(1);
    expect((data.files![0] as File).name).toBe('scubago-dive-87.png');
    expect(d.download).not.toHaveBeenCalled();
  });

  it('downloads the PNG when the browser cannot share files', async () => {
    const share = jest.fn(async () => undefined);
    const d = deps({ nav: { canShare: jest.fn(() => false), share } });
    const result = await shareCard(target, { fileName: 'scubago-card' }, d);
    expect(result).toEqual({ status: 'saved', message: MESSAGES.saved });
    expect(share).not.toHaveBeenCalled();
    expect(d.download).toHaveBeenCalledWith(expect.any(Blob), 'scubago-card.png');
  });

  it('downloads the PNG where there is no Web Share API at all', async () => {
    const d = deps({ nav: undefined });
    expect((await shareCard(target, {}, d)).status).toBe('saved');
    expect(d.download).toHaveBeenCalledWith(expect.any(Blob), 'scubago-card.png');
  });

  it('leaves it alone when the diver closes the share dialog', async () => {
    const abort = Object.assign(new Error('Share canceled'), { name: 'AbortError' });
    const d = deps();
    d.shareMock.mockRejectedValueOnce(abort);
    expect(await shareCard(target, {}, d)).toEqual({ status: 'cancelled' });
    expect(d.download).not.toHaveBeenCalled();
  });

  it('downloads the PNG when the browser refuses the share (it came too long after the tap)', async () => {
    const d = deps();
    d.shareMock.mockRejectedValueOnce(Object.assign(new Error('Must be handling a user gesture'), { name: 'NotAllowedError' }));
    expect((await shareCard(target, { fileName: 'late' }, d)).status).toBe('saved');
    expect(d.download).toHaveBeenCalledWith(expect.any(Blob), 'late.png');
  });

  it('uses a picture drawn ahead of the tap, instead of drawing the card again', async () => {
    const d = deps();
    const prepared = await prepareCard(target, d);
    expect(prepared).toEqual({ blob: expect.any(Blob) });
    expect(d.capture).toHaveBeenCalledTimes(1);
    await shareCard(target, { prepared }, d);
    expect(d.capture).toHaveBeenCalledTimes(1);
    expect(d.shareMock).toHaveBeenCalled();
  });

  it('draws the card at the tap when nothing was prepared, and prepares nothing when drawing fails', async () => {
    const d = deps();
    await shareCard(target, {}, d);
    expect(d.capture).toHaveBeenCalledTimes(1);
    const broken = deps({ capture: jest.fn(async () => { throw new Error('tainted canvas'); }) });
    expect(await prepareCard(target, broken)).toBeNull();
  });

  it('tells the diver politely when the picture could not be made, and downloads nothing', async () => {
    const d = deps({ capture: jest.fn(async () => { throw new Error('tainted canvas'); }) });
    expect(await shareCard(target, {}, d)).toEqual({ status: 'error', message: MESSAGES.capture });
    expect(d.shareMock).not.toHaveBeenCalled();
    expect(d.download).not.toHaveBeenCalled();
  });

  it('falls back to the download when the browser cannot make a File', async () => {
    const d = deps({ makeFile: jest.fn(() => { throw new Error('no File constructor'); }) });
    expect((await shareCard(target, {}, d)).status).toBe('saved');
  });

  it('says so when even the download fails', async () => {
    const d = deps({ nav: undefined, download: jest.fn(() => { throw new Error('blocked'); }) });
    expect(await shareCard(target, {}, d)).toEqual({ status: 'error', message: MESSAGES.share });
  });
});

describe('downloading a card on the web', () => {
  it('always downloads, never opens the share dialog', async () => {
    const d = deps();
    expect(canSaveCard).toBe(true);
    const result = await saveCard(target, { fileName: 'scubago-reef-manta' }, d);
    expect(result).toEqual({ status: 'saved', message: MESSAGES.saved });
    expect(d.shareMock).not.toHaveBeenCalled();
    expect(d.download).toHaveBeenCalledWith(expect.any(Blob), 'scubago-reef-manta.png');
  });

  it('says so when the picture could not be made', async () => {
    const d = deps({ capture: jest.fn(async () => { throw new Error('boom'); }) });
    expect(await saveCard(target, {}, d)).toEqual({ status: 'error', message: MESSAGES.capture });
  });
});

describe('the page the card is drawn from', () => {
  it('has the scale and clipping taken off the card’s parents, so it is laid out at its own size', () => {
    const root = { style: { transform: 'scale(0.3)', overflow: 'hidden', clipPath: 'inset(0)' }, parentElement: null };
    const frame = { style: { transform: 'scale(0.3)', overflow: 'hidden', clipPath: '' }, parentElement: root };
    const card = { style: { transform: 'translateZ(0)', overflow: 'hidden' }, parentElement: frame };
    unscaleParents(card as unknown as HTMLElement);
    expect(frame.style).toMatchObject({ transform: 'none', overflow: 'visible', clipPath: 'none' });
    expect(root.style).toMatchObject({ transform: 'none', overflow: 'visible', clipPath: 'none' });
    // The card's own style is its own.
    expect(card.style).toMatchObject({ transform: 'translateZ(0)', overflow: 'hidden' });
  });
});
