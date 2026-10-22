import { describe, expect, it } from '@jest/globals';

import { BackoffError, TimeoutError } from '@/lib/external-sightings/errors';
import type { FetchImpl, ResponseLike } from '@/lib/external-sightings/http';
import { createQueuedFetch, HostQueue, HOST_INTERVAL_MS, InFlight } from '@/lib/external-sightings/queue';

const INAT = 'api.inaturalist.org';
const OBIS = 'api.obis.org';

/** A clock that only moves when something sleeps or a test advances it, so no real time passes. */
function fakeClock() {
  let time = 1_000_000;
  const sleeps: number[] = [];
  return {
    now: () => time,
    advance: (ms: number) => {
      time += ms;
    },
    sleeps,
    sleep: async (ms: number, signal?: AbortSignal) => {
      if (signal?.aborted) throw Object.assign(new Error('Aborted'), { name: 'AbortError' });
      sleeps.push(ms);
      time += ms;
    },
  };
}

function deferred<T = void>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe('the request queue', () => {
  it('waits for iNaturalist: at least 1.1 s between request starts', async () => {
    expect(HOST_INTERVAL_MS[INAT]).toBeGreaterThanOrEqual(1100);
    const clock = fakeClock();
    const queue = new HostQueue({ now: clock.now, sleep: clock.sleep });
    const starts: number[] = [];
    const task = async () => {
      starts.push(clock.now());
    };
    await Promise.all([queue.schedule(INAT, task), queue.schedule(INAT, task), queue.schedule(INAT, task)]);
    expect(starts[1] - starts[0]).toBeGreaterThanOrEqual(1100);
    expect(starts[2] - starts[1]).toBeGreaterThanOrEqual(1100);
    expect(clock.sleeps).toEqual([1100, 1100]);
  });

  it('counts the gap between starts, so a slow request shortens the wait', async () => {
    const clock = fakeClock();
    const queue = new HostQueue({ now: clock.now, sleep: clock.sleep });
    await queue.schedule(INAT, async () => clock.advance(300));
    await queue.schedule(INAT, async () => undefined);
    expect(clock.sleeps).toEqual([800]);
  });

  it('does not wait when the gap has already passed', async () => {
    const clock = fakeClock();
    const queue = new HostQueue({ now: clock.now, sleep: clock.sleep });
    await queue.schedule(INAT, async () => undefined);
    clock.advance(5000);
    await queue.schedule(INAT, async () => undefined);
    expect(clock.sleeps).toEqual([]);
  });

  it('runs one request at a time per host, in order', async () => {
    const clock = fakeClock();
    const queue = new HostQueue({ now: clock.now, sleep: clock.sleep });
    const log: string[] = [];
    const first = deferred();
    const a = queue.schedule(INAT, async () => {
      log.push('a start');
      await first.promise;
      log.push('a end');
      return 'a';
    });
    const b = queue.schedule(INAT, async () => {
      log.push('b start');
      return 'b';
    });
    await tick();
    expect(log).toEqual(['a start']);
    first.resolve();
    expect(await Promise.all([a, b])).toEqual(['a', 'b']);
    expect(log).toEqual(['a start', 'a end', 'b start']);
  });

  it('lets different hosts run side by side', async () => {
    const clock = fakeClock();
    const queue = new HostQueue({ now: clock.now, sleep: clock.sleep });
    const gate = deferred();
    const log: string[] = [];
    const inat = queue.schedule(INAT, async () => {
      log.push('inat start');
      await gate.promise;
    });
    const obis = queue.schedule(OBIS, async () => {
      log.push('obis start');
    });
    await obis;
    expect(log).toEqual(['inat start', 'obis start']);
    gate.resolve();
    await inat;
  });

  it('keeps going after a request fails', async () => {
    const clock = fakeClock();
    const queue = new HostQueue({ now: clock.now, sleep: clock.sleep });
    const failed = queue.schedule(INAT, async () => {
      throw new Error('boom');
    });
    const next = queue.schedule(INAT, async () => 'ok');
    await expect(failed).rejects.toThrow('boom');
    expect(await next).toBe('ok');
  });

  it('drops an aborted request without using up a slot', async () => {
    const clock = fakeClock();
    const queue = new HostQueue({ now: clock.now, sleep: clock.sleep });
    const controller = new AbortController();
    const ran: string[] = [];
    const a = queue.schedule(INAT, async () => void ran.push('a'));
    const b = queue.schedule(INAT, async () => void ran.push('b'), controller.signal);
    const c = queue.schedule(INAT, async () => void ran.push('c'));
    controller.abort();
    await a;
    await expect(b).rejects.toMatchObject({ name: 'AbortError' });
    await c;
    expect(ran).toEqual(['a', 'c']);
    expect(clock.sleeps).toEqual([1100]); // c waited for a, not for the dropped b
  });

  it('holds a host back after a rate limit, and refuses to make a diver wait out a long one', async () => {
    const clock = fakeClock();
    const queue = new HostQueue({ now: clock.now, sleep: clock.sleep, maxBackoffWaitMs: 15_000 });
    queue.penalize(INAT, 5000);
    await queue.schedule(INAT, async () => undefined);
    expect(clock.sleeps).toEqual([5000]);

    queue.penalize(INAT, 60_000);
    let ran = false;
    const refused = queue.schedule(INAT, async () => {
      ran = true;
    });
    await expect(refused).rejects.toBeInstanceOf(BackoffError);
    expect(ran).toBe(false);
    // Another host is unaffected.
    await queue.schedule(OBIS, async () => undefined);
  });
});

describe('the queued fetch', () => {
  const json = (status: number, body: unknown = {}, headers: Record<string, string> = {}): ResponseLike => ({
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => headers[name.toLowerCase()] ?? null },
    json: async () => body,
  });

  it('reads the body inside the queue slot, so the next request waits for it', async () => {
    const clock = fakeClock();
    const queue = new HostQueue({ now: clock.now, sleep: clock.sleep });
    const body = deferred<unknown>();
    const log: string[] = [];
    const fetchImpl: FetchImpl = async (url) => ({
      ok: true,
      status: 200,
      json: async () => {
        log.push(`read ${url}`);
        return url.endsWith('/one') ? body.promise : { two: true };
      },
    });
    const queued = createQueuedFetch(queue, fetchImpl, 5000);
    const one = queued('https://api.inaturalist.org/one');
    const two = queued('https://api.inaturalist.org/two');
    await tick();
    expect(log).toEqual(['read https://api.inaturalist.org/one']);
    body.resolve({ one: true });
    expect(await (await one).json()).toEqual({ one: true });
    expect(await (await two).json()).toEqual({ two: true });
  });

  it('adds the headers it was given to every request, under the caller’s own', async () => {
    const queue = new HostQueue({ now: fakeClock().now, sleep: fakeClock().sleep });
    const seen: (Record<string, string> | undefined)[] = [];
    const fetchImpl: FetchImpl = async (_url, init) => {
      seen.push(init?.headers);
      return json(200);
    };
    const queued = createQueuedFetch(queue, fetchImpl, 5000, { 'User-Agent': 'ScubaGo test', Accept: 'text/plain' });
    await queued('https://api.obis.org/a', { headers: { Accept: 'application/json' } });
    await queued('https://api.obis.org/b');
    expect(seen).toEqual([{ 'User-Agent': 'ScubaGo test', Accept: 'application/json' }, { 'User-Agent': 'ScubaGo test', Accept: 'text/plain' }]);
  });

  it('turns an unreadable body into an error when asked for the JSON, not before', async () => {
    const queue = new HostQueue({ now: fakeClock().now, sleep: fakeClock().sleep });
    const fetchImpl: FetchImpl = async () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError('bad'); } });
    const response = await createQueuedFetch(queue, fetchImpl)('https://api.obis.org/x');
    await expect(response.json()).rejects.toMatchObject({ name: 'ParseError' });
  });

  it('backs off after a 429, using Retry-After', async () => {
    const clock = fakeClock();
    const queue = new HostQueue({ now: clock.now, sleep: clock.sleep });
    let calls = 0;
    const fetchImpl: FetchImpl = async () => {
      calls += 1;
      return calls === 1 ? json(429, {}, { 'retry-after': '3' }) : json(200, { ok: true });
    };
    const queued = createQueuedFetch(queue, fetchImpl);
    expect((await queued('https://api.inaturalist.org/a')).status).toBe(429);
    expect((await queued('https://api.inaturalist.org/b')).status).toBe(200);
    expect(clock.sleeps).toEqual([3000]);
  });

  it('refuses at once during a long back-off, without calling the network', async () => {
    const clock = fakeClock();
    const queue = new HostQueue({ now: clock.now, sleep: clock.sleep });
    let calls = 0;
    const fetchImpl: FetchImpl = async () => {
      calls += 1;
      return json(429); // no Retry-After: a minute
    };
    const queued = createQueuedFetch(queue, fetchImpl);
    await queued('https://api.inaturalist.org/a');
    await expect(queued('https://api.inaturalist.org/b')).rejects.toBeInstanceOf(BackoffError);
    expect(calls).toBe(1);
  });

  it('gives up on a request that never answers', async () => {
    const queue = new HostQueue({ now: fakeClock().now, sleep: fakeClock().sleep });
    const fetchImpl: FetchImpl = (_url, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(Object.assign(new Error('Aborted'), { name: 'AbortError' })));
      });
    await expect(createQueuedFetch(queue, fetchImpl, 20)('https://api.obis.org/slow')).rejects.toBeInstanceOf(TimeoutError);
  });

  it('passes the caller’s abort through', async () => {
    const queue = new HostQueue({ now: fakeClock().now, sleep: fakeClock().sleep });
    const fetchImpl: FetchImpl = (_url, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(Object.assign(new Error('Aborted'), { name: 'AbortError' })));
      });
    const controller = new AbortController();
    const pending = createQueuedFetch(queue, fetchImpl, 5000)('https://api.obis.org/slow', { signal: controller.signal });
    await tick();
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  });
});

describe('sharing a running job between callers', () => {
  it('starts one job for the same key and gives everyone its result', async () => {
    const inFlight = new InFlight<string>();
    const gate = deferred<string>();
    let starts = 0;
    const start = () => {
      starts += 1;
      return gate.promise;
    };
    const a = inFlight.run('site-1', start);
    const b = inFlight.run('site-1', start);
    const other = inFlight.run('site-2', async () => 'other');
    gate.resolve('shared');
    expect(await Promise.all([a, b, other])).toEqual(['shared', 'shared', 'other']);
    expect(starts).toBe(1);
  });

  it('starts a new job once the first has finished', async () => {
    const inFlight = new InFlight<number>();
    let starts = 0;
    const start = async () => ++starts;
    expect(await inFlight.run('k', start)).toBe(1);
    expect(await inFlight.run('k', start)).toBe(2);
  });

  it('shares a failure too, then lets the next call try again', async () => {
    const inFlight = new InFlight<string>();
    const gate = deferred<string>();
    const a = inFlight.run('k', () => gate.promise);
    const b = inFlight.run('k', () => gate.promise);
    gate.reject(new Error('down'));
    await expect(a).rejects.toThrow('down');
    await expect(b).rejects.toThrow('down');
    expect(await inFlight.run('k', async () => 'back')).toBe('back');
  });

  it('keeps the job going for others when one caller aborts, and stops it when all do', async () => {
    const inFlight = new InFlight<string>();
    const gate = deferred<string>();
    let jobSignal: AbortSignal | undefined;
    const start = (signal: AbortSignal) => {
      jobSignal = signal;
      return gate.promise;
    };
    const first = new AbortController();
    const second = new AbortController();
    const a = inFlight.run('k', start, first.signal);
    const b = inFlight.run('k', start, second.signal);
    first.abort();
    await expect(a).rejects.toMatchObject({ name: 'AbortError' });
    expect(jobSignal?.aborted).toBe(false);
    gate.resolve('done');
    expect(await b).toBe('done');

    const lonely = new AbortController();
    const c = inFlight.run('z', start, lonely.signal);
    lonely.abort();
    await expect(c).rejects.toMatchObject({ name: 'AbortError' });
    expect(jobSignal?.aborted).toBe(true);
    // The abandoned job does not poison the next call.
    expect(await inFlight.run('z', async () => 'fresh')).toBe('fresh');
  });

  it('rejects at once for a caller whose signal is already aborted', async () => {
    const inFlight = new InFlight<string>();
    const controller = new AbortController();
    controller.abort();
    await expect(inFlight.run('k', async () => 'never', controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
  });
});
