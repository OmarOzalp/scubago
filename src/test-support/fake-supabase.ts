/**
 * An in-memory stand-in for the parts of Supabase the app uses, for tests. One FakeServer holds
 * the data; each device gets its own client (signed in as one user, online or not).
 *
 * It enforces what the real project's row-level security enforces (supabase/migrations/0001):
 * anyone reads sightings, users write only their own rows, and a photo can only be written to or
 * removed from the uploader's own folder. `sightingUpdateColumns`, when set, mimics column
 * privileges (only those columns may be updated).
 */
export const FAKE_SUPABASE_URL = 'https://test-project.supabase.co';

const NETWORK_ERROR = { message: 'TypeError: Network request failed', code: '', details: '', hint: '' };
const rls = (table: string) => ({
  message: `new row violates row-level security policy for table "${table}"`,
  code: '42501',
  details: '',
  hint: '',
});

type Row = Record<string, any>;

export interface FakeCall {
  device: string;
  table: string;
  op: string;
  ids: string[];
  columns?: string[];
}

export class FakeServer {
  tables: Record<string, Row[]> = { sightings: [], dive_sites: [], profiles: [] };
  /** Photo bucket contents: path → owner folder. */
  files = new Map<string, string>();
  calls: FakeCall[] = [];
  /** The next write is applied, but its reply never reaches the device (a dropped connection). */
  loseNextReply = false;
  /** When set, only these sightings columns may be updated (like column-level privileges). */
  sightingUpdateColumns: string[] | null = null;

  device(name: string, userId: string | null): FakeDevice {
    return new FakeDevice(this, name, userId);
  }

  sighting(id: string): Row | undefined {
    return this.tables.sightings.find((r) => r.id === id);
  }

  /** A row written straight into the database (as another app version or another device would). */
  seedSighting(row: Partial<Row> & { id: string; user_id: string }): Row {
    const full = {
      species_id: 'reef-manta', site_id: 'blue-corner', sighted_on: '2026-09-01', notes: null,
      photo_url: null, created_at: new Date().toISOString(), ...row,
    };
    this.tables.sightings.push(full);
    return full;
  }
}

export class FakeDevice {
  online = true;

  constructor(
    readonly server: FakeServer,
    readonly name: string,
    public userId: string | null,
  ) {}

  /** The object handed to the app as its SupabaseClient. */
  get client(): any {
    return {
      from: (table: string) => new FakeQuery(this, table),
      storage: { from: (bucket: string) => fakeBucket(this, bucket) },
      auth: {
        getSession: async () => ({ data: { session: this.userId ? { user: { id: this.userId } } : null }, error: null }),
        signOut: async () => ({ error: null }),
      },
      rpc: async () => ({ data: null, error: { message: 'not in fake', code: 'PGRST202' } }),
    };
  }
}

function fakeBucket(device: FakeDevice, bucket: string) {
  const { server } = device;
  const ownFolder = (path: string) => path.split('/')[0] === device.userId;
  return {
    upload: async (path: string, _bytes: unknown, opts: { upsert?: boolean } = {}) => {
      if (!device.online) return { data: null, error: NETWORK_ERROR };
      if (!ownFolder(path)) return { data: null, error: rls('objects') };
      if (server.files.has(path) && !opts.upsert) return { data: null, error: { message: 'The resource already exists' } };
      server.files.set(path, device.userId!);
      server.calls.push({ device: device.name, table: `storage:${bucket}`, op: 'upload', ids: [path] });
      return { data: { path }, error: null };
    },
    remove: async (paths: string[]) => {
      if (!device.online) return { data: null, error: NETWORK_ERROR };
      // Like Storage: files the user may not delete (or that aren't there) are just not deleted.
      const removed = paths.filter((p) => ownFolder(p) && server.files.delete(p));
      server.calls.push({ device: device.name, table: `storage:${bucket}`, op: 'remove', ids: paths });
      return { data: removed.map((name) => ({ name })), error: null };
    },
    getPublicUrl: (path: string) => ({
      data: { publicUrl: `${FAKE_SUPABASE_URL}/storage/v1/object/public/${bucket}/${path}` },
    }),
  };
}

type Result = { data: any; error: any };

class FakeQuery implements PromiseLike<Result> {
  private op: 'select' | 'insert' | 'upsert' | 'update' | 'delete' = 'select';
  private payload: any;
  private opts: { onConflict?: string; ignoreDuplicates?: boolean } = {};
  private filters: [string, unknown][] = [];
  private columns = '*';
  private returning = false;
  private orderBy: { col: string; asc: boolean } | null = null;
  private max: number | null = null;
  private single = false;

  constructor(
    private device: FakeDevice,
    private table: string,
  ) {}

  select(columns = '*') {
    if (this.op === 'select') this.columns = columns;
    else this.returning = true;
    return this;
  }
  insert(rows: Row | Row[]) {
    this.op = 'insert';
    this.payload = rows;
    return this;
  }
  upsert(rows: Row | Row[], opts: { onConflict?: string; ignoreDuplicates?: boolean } = {}) {
    this.op = 'upsert';
    this.payload = rows;
    this.opts = opts;
    return this;
  }
  update(values: Row) {
    this.op = 'update';
    this.payload = values;
    return this;
  }
  delete() {
    this.op = 'delete';
    return this;
  }
  eq(col: string, value: unknown) {
    this.filters.push([col, value]);
    return this;
  }
  order(col: string, { ascending = true }: { ascending?: boolean } = {}) {
    this.orderBy = { col, asc: ascending };
    return this;
  }
  limit(n: number) {
    this.max = n;
    return this;
  }
  maybeSingle() {
    this.single = true;
    return this;
  }

  then<A = Result, B = never>(
    onfulfilled?: ((value: Result) => A | PromiseLike<A>) | null,
    onrejected?: ((reason: any) => B | PromiseLike<B>) | null,
  ): PromiseLike<A | B> {
    return Promise.resolve().then(() => this.run()).then(onfulfilled, onrejected);
  }

  private matches(row: Row) {
    return this.filters.every(([col, value]) => row[col] === value);
  }

  private owner(row: Row) {
    return this.table === 'dive_sites' ? row.created_by : row.user_id;
  }

  private run(): Result {
    const { server, userId } = this.device;
    if (!this.device.online) return { data: null, error: NETWORK_ERROR };
    const rows = server.tables[this.table] ?? (server.tables[this.table] = []);
    const log = (ids: string[], columns?: string[]) =>
      server.calls.push({ device: this.device.name, table: this.table, op: this.op, ids, columns });

    if (this.op === 'select') {
      let out = rows.filter((r) => this.matches(r));
      if (this.orderBy) {
        const { col, asc } = this.orderBy;
        out = [...out].sort((a, b) => (a[col] < b[col] ? -1 : a[col] > b[col] ? 1 : 0) * (asc ? 1 : -1));
      }
      if (this.max !== null) out = out.slice(0, this.max);
      const embed = this.columns.includes('profiles(username)');
      const data = out.map((r) => {
        const copy = { ...r };
        if (embed) {
          const profile = server.tables.profiles.find((p) => p.user_id === r.user_id);
          copy.profiles = profile ? { username: profile.username } : null;
        }
        return copy;
      });
      return { data: this.single ? (data[0] ?? null) : data, error: null };
    }

    const reply = (data: Row[]): Result => {
      if (server.loseNextReply) {
        server.loseNextReply = false;
        return { data: null, error: NETWORK_ERROR };
      }
      return { data: this.returning ? data.map((r) => ({ id: r.id })) : null, error: null };
    };

    if (this.op === 'insert' || this.op === 'upsert') {
      const incoming: Row[] = Array.isArray(this.payload) ? this.payload : [this.payload];
      for (const row of incoming) {
        const own = this.owner(row) === userId;
        if (!own || (this.table === 'dive_sites' && row.source !== 'user')) return { data: null, error: rls(this.table) };
      }
      const written: Row[] = [];
      for (const row of incoming) {
        const existing = rows.find((r) => r.id === row.id);
        if (existing) {
          if (this.op === 'insert') return { data: null, error: { message: 'duplicate key value', code: '23505' } };
          if (this.opts.ignoreDuplicates) continue;
          if (this.owner(existing) !== userId) return { data: null, error: rls(this.table) };
          Object.assign(existing, row);
          written.push(existing);
        } else {
          const created = { created_at: new Date().toISOString(), ...row };
          rows.push(created);
          written.push(created);
        }
      }
      log(written.map((r) => r.id), Object.keys(incoming[0] ?? {}));
      return reply(written);
    }

    if (this.op === 'update') {
      const columns = Object.keys(this.payload);
      if (this.table === 'sightings' && server.sightingUpdateColumns) {
        const denied = columns.filter((c) => !server.sightingUpdateColumns!.includes(c));
        if (denied.length > 0) return { data: null, error: { message: 'permission denied for table sightings', code: '42501' } };
      }
      // RLS: the rows an update can reach are the user's own; the new row must stay theirs.
      const targets = rows.filter((r) => this.matches(r) && this.owner(r) === userId);
      if ('user_id' in this.payload && this.payload.user_id !== userId && targets.length > 0) {
        return { data: null, error: rls(this.table) };
      }
      for (const r of targets) Object.assign(r, this.payload);
      log(targets.map((r) => r.id), columns);
      return reply(targets);
    }

    // delete
    const targets = rows.filter((r) => this.matches(r) && this.owner(r) === userId);
    server.tables[this.table] = rows.filter((r) => !targets.includes(r));
    log(targets.map((r) => r.id));
    return reply(targets);
  }
}
