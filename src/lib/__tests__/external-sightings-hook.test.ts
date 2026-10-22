import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import React, { act, useEffect } from 'react';
import { create, type ReactTestRenderer } from 'react-test-renderer';

import { useSiteSightings, type UseSiteSightings } from '@/hooks/use-site-sightings';
import type { LoadOptions, LoadResult, SightingsService } from '@/lib/external-sightings/service';
import type { SiteSightings } from '@/lib/external-sightings/types';
import type { DiveSite } from '@/lib/types';

// The service is a stand-in here: these tests are about what the hook reports, not about requests.
// The summaries are hand-made, not real records.

const reef: DiveSite = { id: 'reef', name: 'Test Reef', lat: -16.5, lng: 145.9, region: 'Nowhere', country: 'Testland', blurb: '', notableSpecies: [], source: 'seed' };
const wall: DiveSite = { ...reef, id: 'wall', name: 'Test Wall' };

function summary(siteId: string, marker: number): SiteSightings {
  return {
    siteId,
    radiusKm: 3,
    fetchedAt: '2026-10-22T08:00:00.000Z',
    sources: [{ id: 'inaturalist', ok: true, fetchedAt: '2026-10-22T08:00:00.000Z', attribution: 'a', licenceNote: 'l', url: 'https://example.test' }],
    species: [{ speciesId: 'green-turtle', inaturalist: { observations: marker } }],
    recent: [],
    unmatched: { inaturalist: 0, obis: 0 },
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

type Load = (site: { id: string; lat: number; lng: number }, options?: LoadOptions) => Promise<LoadResult>;

function stubService(load: Load) {
  const mock = jest.fn(load);
  return { service: { load: mock } as Pick<SightingsService, 'load'>, load: mock };
}

let latest: UseSiteSightings;
let root: ReactTestRenderer | null = null;

function Harness({ site, service, radiusKm }: { site?: DiveSite; service: Pick<SightingsService, 'load'>; radiusKm?: number }) {
  const value = useSiteSightings(site, { service, radiusKm });
  useEffect(() => {
    latest = value;
  });
  return null;
}

async function mount(props: React.ComponentProps<typeof Harness>) {
  await act(async () => {
    root = create(React.createElement(Harness, props));
  });
}

async function update(props: React.ComponentProps<typeof Harness>) {
  await act(async () => {
    root?.update(React.createElement(Harness, props));
  });
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = null;
});

describe('useSiteSightings', () => {
  it('is idle without a site and asks for nothing', async () => {
    const { service, load } = stubService(async () => ({ summary: null, status: 'ready', stale: false, refreshed: false }));
    await mount({ service });
    expect(latest.status).toBe('idle');
    expect(latest.summary).toBeNull();
    expect(load).not.toHaveBeenCalled();
    act(() => latest.refresh()); // does nothing, and does not throw
    expect(load).not.toHaveBeenCalled();
  });

  it('shows the cached summary at once as stale, then the fresh one as ready', async () => {
    const cached = summary('reef', 1);
    const fresh = summary('reef', 2);
    const gate = deferred<LoadResult>();
    const { service } = stubService(async (_site, options) => {
      options?.onCached?.({ summary: cached, stale: true });
      return gate.promise;
    });
    await mount({ site: reef, service });
    expect(latest.status).toBe('stale');
    expect(latest.summary).toBe(cached);
    await act(async () => gate.resolve({ summary: fresh, status: 'ready', stale: false, refreshed: true }));
    expect(latest.status).toBe('ready');
    expect(latest.summary).toBe(fresh);
  });

  it('is ready straight away for a fresh cache', async () => {
    const cached = summary('reef', 1);
    const { service } = stubService(async (_site, options) => {
      options?.onCached?.({ summary: cached, stale: false });
      return { summary: cached, status: 'ready', stale: false, refreshed: false };
    });
    await mount({ site: reef, service });
    expect(latest).toMatchObject({ status: 'ready', summary: cached });
  });

  it('says loading while there is nothing to show', async () => {
    const gate = deferred<LoadResult>();
    const { service, load } = stubService(() => gate.promise);
    await mount({ site: reef, service });
    expect(latest).toMatchObject({ status: 'loading', summary: null });
    expect(load).toHaveBeenCalledWith({ id: 'reef', lat: -16.5, lng: 145.9 }, expect.objectContaining({ forceRefresh: false }));
    await act(async () => gate.resolve({ summary: null, status: 'error', stale: false, error: 'x', refreshed: false }));
  });

  it('keeps the cached summary when the refresh fails, and says why it is old', async () => {
    const cached = summary('reef', 1);
    const offline = stubService(async (_site, options) => {
      options?.onCached?.({ summary: cached, stale: true });
      return { summary: cached, status: 'offline', stale: true, error: 'No connection.', refreshed: false };
    });
    await mount({ site: reef, service: offline.service });
    expect(latest).toMatchObject({ status: 'offline', summary: cached });
    await update({ site: wall, service: stubService(async () => ({ summary: cached, status: 'error', stale: true, error: 'x', refreshed: false })).service });
    expect(latest).toMatchObject({ status: 'error', summary: cached });
  });

  it('shows nothing, not made-up data, when there is no cache and no connection', async () => {
    const { service } = stubService(async () => ({ summary: null, status: 'offline', stale: false, error: 'No connection.', refreshed: false }));
    await mount({ site: reef, service });
    expect(latest).toMatchObject({ status: 'offline', summary: null });
  });

  it('cancels its request when the screen goes away, and ignores a late answer', async () => {
    const gate = deferred<LoadResult>();
    let signal: AbortSignal | undefined;
    const { service } = stubService((_site, options) => {
      signal = options?.signal;
      return gate.promise;
    });
    await mount({ site: reef, service });
    expect(signal?.aborted).toBe(false);
    await act(async () => root?.unmount());
    root = null;
    expect(signal?.aborted).toBe(true);
    await act(async () => gate.resolve({ summary: summary('reef', 9), status: 'ready', stale: false, refreshed: true }));
    expect(latest.summary).toBeNull(); // the last render before unmount
  });

  it('never throws, whatever the service does', async () => {
    const rejecting = stubService(async () => {
      throw new Error('boom');
    });
    await mount({ site: reef, service: rejecting.service });
    expect(latest).toMatchObject({ status: 'error', summary: null });
    const throwing = stubService(() => {
      throw new Error('sync boom');
    });
    await update({ site: wall, service: throwing.service });
    expect(latest).toMatchObject({ status: 'error', summary: null });
  });

  it('starts over for another site, cancelling the first request and not showing its data', async () => {
    const first = deferred<LoadResult>();
    const second = deferred<LoadResult>();
    const signals: AbortSignal[] = [];
    const { service } = stubService((site, options) => {
      if (options?.signal) signals.push(options.signal);
      return site.id === 'reef' ? first.promise : second.promise;
    });
    await mount({ site: reef, service });
    await update({ site: wall, service });
    expect(signals[0].aborted).toBe(true);
    expect(latest).toMatchObject({ status: 'loading', summary: null });
    await act(async () => first.resolve({ summary: summary('reef', 1), status: 'ready', stale: false, refreshed: true }));
    expect(latest.summary).toBeNull();
    await act(async () => second.resolve({ summary: summary('wall', 2), status: 'ready', stale: false, refreshed: true }));
    expect(latest).toMatchObject({ status: 'ready' });
    expect(latest.summary?.siteId).toBe('wall');
  });

  it('refresh asks for a forced refresh and shows the old summary as stale meanwhile', async () => {
    const cached = summary('reef', 1);
    const fresh = summary('reef', 2);
    const gate = deferred<LoadResult>();
    const calls: (boolean | undefined)[] = [];
    const { service } = stubService((_site, options) => {
      calls.push(options?.forceRefresh);
      if (calls.length === 1) return Promise.resolve({ summary: cached, status: 'ready', stale: false, refreshed: false } as LoadResult);
      return gate.promise;
    });
    await mount({ site: reef, service });
    expect(latest).toMatchObject({ status: 'ready', summary: cached });
    await act(async () => latest.refresh());
    expect(calls).toEqual([false, true]);
    expect(latest).toMatchObject({ status: 'stale', summary: cached });
    await act(async () => gate.resolve({ summary: fresh, status: 'ready', stale: false, refreshed: true }));
    expect(latest).toMatchObject({ status: 'ready', summary: fresh });
  });

  it('does not force the next site just because the last one was refreshed', async () => {
    const calls: (boolean | undefined)[] = [];
    const { service } = stubService(async (_site, options) => {
      calls.push(options?.forceRefresh);
      return { summary: null, status: 'ready', stale: false, refreshed: false };
    });
    await mount({ site: reef, service });
    await act(async () => latest.refresh());
    await update({ site: wall, service });
    expect(calls).toEqual([false, true, false]);
  });

  it('passes the radius on', async () => {
    const { service, load } = stubService(async () => ({ summary: null, status: 'ready', stale: false, refreshed: false }));
    await mount({ site: reef, service, radiusKm: 5 });
    expect(load).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ radiusKm: 5 }));
  });
});
