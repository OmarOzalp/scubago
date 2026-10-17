/**
 * An in-memory stand-in for the parts of Supabase the app uses, for tests. One FakeServer holds
 * the data; each device gets its own client (signed in as one user, online or not).
 *
 * It enforces what the real project's row-level security enforces (supabase/migrations/0001 and
 * 0008): anyone reads public sightings and only their owner a private one, users write only their
 * own rows, sighting_details is readable and writable by its owner alone, and a photo can only be
 * written to or removed from the uploader's own folder (the private bucket is read by its owner
 * alone, too). `sightingUpdateColumns`, when set, mimics column privileges (only those columns may
 * be updated). `privacy = false` is a project without migration 0008.
 *
 * Dives (migration 0009): a diver reads and writes only their own pages, a sighting may only point
 * at its owner's page (and loses it when the page is deleted), and dive_signatures are read by the
 * page's owner or the signer. `diveLog = false` is a project without migration 0009.
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

export const PUBLIC_BUCKET = 'sighting-photos';
export const PRIVATE_BUCKET = 'sighting-photos-private';

export class FakeServer {
  tables: Record<string, Row[]> = { sightings: [], dive_sites: [], profiles: [], sighting_details: [], dives: [], dive_signatures: [] };
  /** Bucket contents, by bucket: path → owner folder. */
  buckets: Record<string, Map<string, string>> = { [PUBLIC_BUCKET]: new Map(), [PRIVATE_BUCKET]: new Map() };
  /** The public photo bucket. */
  get files(): Map<string, string> {
    return this.buckets[PUBLIC_BUCKET];
  }
  /** The private photo bucket (migration 0008). */
  get privateFiles(): Map<string, string> {
    return this.buckets[PRIVATE_BUCKET];
  }
  calls: FakeCall[] = [];
  /** The next write is applied, but its reply never reaches the device (a dropped connection). */
  loseNextReply = false;
  /** When set, only these sightings columns may be updated (like column-level privileges). */
  sightingUpdateColumns: string[] | null = null;
  /** The project has sightings.status (migration 0006); without it, selecting it fails with 42703. */
  statusColumn = true;
  /** The project has sightings.custom_name (migration 0007); without it, selecting or writing it fails with 42703. */
  customNameColumn = true;
  /** The project has migration 0008: sightings.visibility, sighting_details and the private bucket. */
  privacy = true;
  /** The project has migration 0009: dives, dive_signatures and sightings.dive_id. */
  diveLog = true;

  dive(id: string): Row | undefined {
    return this.tables.dives.find((r) => r.id === id);
  }

  details(sightingId: string): Row | undefined {
    return this.tables.sighting_details.find((r) => r.sighting_id === sightingId);
  }

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

const NO_BUCKET = { message: 'Bucket not found', statusCode: '404' };

function fakeBucket(device: FakeDevice, bucket: string) {
  const { server } = device;
  const ownFolder = (path: string) => path.split('/')[0] === device.userId;
  const files = (name: string) => (name === PRIVATE_BUCKET && !server.privacy ? undefined : server.buckets[name]);
  // The public bucket is readable by anyone; the private one only in the reader's own folder.
  const readable = (name: string, path: string) => name !== PRIVATE_BUCKET || ownFolder(path);
  const log = (op: string, ids: string[]) => server.calls.push({ device: device.name, table: `storage:${bucket}`, op, ids });
  return {
    upload: async (path: string, _bytes: unknown, opts: { upsert?: boolean } = {}) => {
      if (!device.online) return { data: null, error: NETWORK_ERROR };
      const here = files(bucket);
      if (!here) return { data: null, error: NO_BUCKET };
      if (!ownFolder(path)) return { data: null, error: rls('objects') };
      if (here.has(path) && !opts.upsert) return { data: null, error: { message: 'The resource already exists' } };
      here.set(path, device.userId!);
      log('upload', [path]);
      return { data: { path }, error: null };
    },
    copy: async (from: string, to: string, opts: { destinationBucket?: string } = {}) => {
      if (!device.online) return { data: null, error: NETWORK_ERROR };
      const target = opts.destinationBucket ?? bucket;
      const source = files(bucket);
      const dest = files(target);
      if (!source || !dest) return { data: null, error: NO_BUCKET };
      if (!readable(bucket, from) || !source.has(from)) return { data: null, error: { message: 'Object not found', statusCode: '404' } };
      if (!ownFolder(to)) return { data: null, error: rls('objects') };
      if (dest.has(to)) return { data: null, error: { message: 'The resource already exists', statusCode: '409' } };
      dest.set(to, device.userId!);
      log('copy', [from, `${target}/${to}`]);
      return { data: { path: to }, error: null };
    },
    exists: async (path: string) => {
      if (!device.online) return { data: false, error: NETWORK_ERROR };
      const here = files(bucket);
      if (!here) return { data: false, error: NO_BUCKET };
      return { data: readable(bucket, path) && here.has(path), error: null };
    },
    remove: async (paths: string[]) => {
      if (!device.online) return { data: null, error: NETWORK_ERROR };
      const here = files(bucket);
      if (!here) return { data: null, error: NO_BUCKET };
      // Like Storage: files the user may not delete (or that aren't there) are just not deleted.
      const removed = paths.filter((p) => ownFolder(p) && here.delete(p));
      log('remove', paths);
      return { data: removed.map((name) => ({ name })), error: null };
    },
    createSignedUrl: async (path: string, expiresIn: number) => {
      if (!device.online) return { data: null, error: NETWORK_ERROR };
      const here = files(bucket);
      if (!here) return { data: null, error: NO_BUCKET };
      if (!readable(bucket, path) || !here.has(path)) return { data: null, error: { message: 'Object not found', statusCode: '404' } };
      return { data: { signedUrl: `${FAKE_SUPABASE_URL}/storage/v1/object/sign/${bucket}/${path}?token=t&expires=${expiresIn}` }, error: null };
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

    if (this.table === 'sighting_details' && !server.privacy) {
      return { data: null, error: { message: "Could not find the table 'public.sighting_details' in the schema cache", code: 'PGRST205', details: '', hint: '' } };
    }
    if ((this.table === 'dives' || this.table === 'dive_signatures') && !server.diveLog) {
      return { data: null, error: { message: `Could not find the table 'public.${this.table}' in the schema cache`, code: 'PGRST205', details: '', hint: '' } };
    }
    // RLS: a private sighting is visible to its owner alone; private details and pages only to theirs.
    const visible = (r: Row) =>
      this.table === 'sighting_details' || this.table === 'dives' ? r.user_id === userId
        : this.table === 'sightings' ? r.visibility !== 'private' || r.user_id === userId
          : this.table === 'dive_signatures' ? r.signer_id === userId || server.tables.dives.some((d) => d.id === r.dive_id && d.user_id === userId)
            : true;

    if (this.op === 'select') {
      if (this.table === 'sightings' && !server.privacy && this.columns.split(',').includes('visibility')) {
        return { data: null, error: { message: 'column sightings.visibility does not exist', code: '42703', details: '', hint: '' } };
      }
      if (this.table === 'sightings' && !server.statusColumn && this.columns.split(',').includes('status')) {
        return { data: null, error: { message: 'column sightings.status does not exist', code: '42703', details: '', hint: '' } };
      }
      if (this.table === 'sightings' && !server.customNameColumn && this.columns.split(',').includes('custom_name')) {
        return { data: null, error: { message: 'column sightings.custom_name does not exist', code: '42703', details: '', hint: '' } };
      }
      if (this.table === 'sightings' && !server.diveLog && this.columns.split(',').includes('dive_id')) {
        return { data: null, error: { message: 'column sightings.dive_id does not exist', code: '42703', details: '', hint: '' } };
      }
      let out = rows.filter((r) => this.matches(r) && visible(r));
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

    const writes = Array.isArray(this.payload) ? this.payload : this.payload ? [this.payload] : [];
    if (this.table === 'sightings' && !server.customNameColumn && writes.some((r: Row) => 'custom_name' in r)) {
      return { data: null, error: { message: 'column "custom_name" of relation "sightings" does not exist', code: '42703' } };
    }
    if (this.table === 'sightings' && !server.privacy && writes.some((r: Row) => 'visibility' in r)) {
      return { data: null, error: { message: "Could not find the 'visibility' column of 'sightings' in the schema cache", code: 'PGRST204' } };
    }
    if (this.table === 'sightings' && !server.diveLog && writes.some((r: Row) => 'dive_id' in r)) {
      return { data: null, error: { message: "Could not find the 'dive_id' column of 'sightings' in the schema cache", code: 'PGRST204' } };
    }
    // A sighting may only point at a page that exists and is its owner's (the foreign key and the
    // ownership trigger in 0009).
    if (this.table === 'sightings' && writes.some((r: Row) => r.dive_id && !server.tables.dives.some((d) => d.id === r.dive_id && d.user_id === userId))) {
      return { data: null, error: { message: 'A sighting can only be on your own dive', code: '42501' } };
    }
    if (this.table === 'sightings' && writes.some((r: Row) => r.visibility !== undefined && !['public', 'private'].includes(r.visibility))) {
      return { data: null, error: { message: 'new row violates check constraint "sightings_visibility_check"', code: '23514' } };
    }
    // sighting_details: only for the writer's own sighting, and a private photo only from their own folder.
    if (this.table === 'sighting_details' && writes.some((r: Row) =>
      !server.tables.sightings.some((x) => x.id === r.sighting_id && x.user_id === userId))) {
      return { data: null, error: rls(this.table) };
    }
    if (this.table === 'sighting_details' && writes.some((r: Row) => r.photo_path && !String(r.photo_path).startsWith(`${r.user_id}/`))) {
      return { data: null, error: { message: 'new row violates check constraint "sighting_details_photo_in_own_folder"', code: '23514' } };
    }
    const key = this.opts.onConflict ?? (this.table === 'sighting_details' ? 'sighting_id' : 'id');

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
        const existing = rows.find((r) => r[key] === row[key]);
        if (existing) {
          if (this.op === 'insert') return { data: null, error: { message: 'duplicate key value', code: '23505' } };
          if (this.opts.ignoreDuplicates) continue;
          if (this.owner(existing) !== userId) return { data: null, error: rls(this.table) };
          if (this.table === 'dives') voidMovedSignatures(server, existing, row);
          Object.assign(existing, row);
          written.push(existing);
        } else {
          const created = { created_at: new Date().toISOString(), ...row };
          rows.push(created);
          written.push(created);
        }
      }
      log(written.map((r) => r[key]), Object.keys(incoming[0] ?? {}));
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
      for (const r of targets) {
        if (this.table === 'dives') voidMovedSignatures(server, r, this.payload);
        Object.assign(r, this.payload);
      }
      log(targets.map((r) => r[key]), columns);
      return reply(targets);
    }

    // delete
    const targets = rows.filter((r) => this.matches(r) && this.owner(r) === userId);
    server.tables[this.table] = rows.filter((r) => !targets.includes(r));
    // Deleting a sighting deletes its private details (on delete cascade).
    if (this.table === 'sightings') {
      const gone = new Set(targets.map((r) => r.id));
      server.tables.sighting_details = server.tables.sighting_details.filter((d) => !gone.has(d.sighting_id));
    }
    // Deleting a page takes it off its sightings (on delete set null) and removes its signatures.
    if (this.table === 'dives') {
      const gone = new Set(targets.map((r) => r.id));
      for (const sighting of server.tables.sightings) if (gone.has(sighting.dive_id)) sighting.dive_id = null;
      server.tables.dive_signatures = server.tables.dive_signatures.filter((x) => !gone.has(x.dive_id));
    }
    log(targets.map((r) => r[key]));
    return reply(targets);
  }
}

/**
 * A page moved to another site or day loses its signatures, as the trigger in 0009 does: they were
 * given for the old facts. A new number keeps them.
 */
function voidMovedSignatures(server: FakeServer, before: Row, after: Row): void {
  const moved = ('site_id' in after && after.site_id !== before.site_id) || ('dived_on' in after && after.dived_on !== before.dived_on);
  if (!moved) return;
  server.tables.dive_signatures = server.tables.dive_signatures.filter((x) => x.dive_id !== before.id);
  Object.assign(after, { signature_name: null, signature_svg: null, signature_role: null, signed_at: null });
}
