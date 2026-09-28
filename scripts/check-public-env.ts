/**
 * Fails when a build could expose a privileged credential, or would ship without its backend.
 *
 * Everything named EXPO_PUBLIC_* is compiled into the app, where anyone can read it. This checks
 * those values (from the environment EAS provides and any local .env files), the env blocks in
 * eas.json (committed to git), app.json and the app's source for Supabase secret or service-role
 * keys, database URLs and secret-sounding names. On EAS (`--eas`), preview and production builds
 * must also carry the Supabase URL and client key, or the app would quietly run without sync.
 *
 * Run: npm run check:env        (EAS runs it after installing dependencies: eas-build-post-install)
 * Relative imports on purpose: tsx doesn't get the app's `@/` alias in scripts.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { checkSupabaseConfig, classifySupabaseKey, isPrivilegedKey } from '../src/lib/supabase-env';

const root = join(__dirname, '..');
const eas = process.argv.includes('--eas') || process.env.EAS_BUILD === 'true';
const profile = process.env.EAS_BUILD_PROFILE ?? '';
const errors: string[] = [], warnings: string[] = [];

/** Parse KEY=value lines (quotes stripped, comments ignored). */
function parseEnvFile(text: string): Record<string, string> {
  const values: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const match = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
    if (!match) continue;
    let value = match[2];
    if (/^(['"]).*\1$/.test(value)) value = value.slice(1, -1);
    else value = value.replace(/\s+#.*$/, '');
    values[match[1]] = value;
  }
  return values;
}

/** Why a value must not ship, or null. */
function danger(value: string): string | null {
  const kind = classifySupabaseKey(value);
  if (isPrivilegedKey(kind)) return `a Supabase ${kind === 'secret' ? 'secret' : 'service-role'} key`;
  if (/postgres(ql)?:\/\/[^:\s]+:[^@\s]+@/i.test(value)) return 'a database connection string with a password';
  if (/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(value)) return 'a private key';
  return null;
}
const SECRET_NAME = /SERVICE_ROLE|SECRET|PRIVATE|PASSWORD|DATABASE_URL|DB_URL/i;

// 1. Everything that will be compiled into the app: EXPO_PUBLIC_* from the environment and .env files.
const sources: { origin: string; values: Record<string, string | undefined> }[] = [{ origin: 'environment', values: process.env }];
for (const name of readdirSync(root)) {
  if (!/^\.env(\..+)?$/.test(name) || name === '.env.example' || !statSync(join(root, name)).isFile()) continue;
  sources.push({ origin: name, values: parseEnvFile(readFileSync(join(root, name), 'utf8')) });
}
for (const { origin, values } of sources) {
  for (const [name, value] of Object.entries(values)) {
    if (!name.startsWith('EXPO_PUBLIC_') || !value) continue;
    const found = danger(value);
    if (found) errors.push(`${name} (${origin}) holds ${found}; EXPO_PUBLIC_ values are readable by anyone with the app.`);
    else if (SECRET_NAME.test(name)) errors.push(`${name} (${origin}) looks like a secret; never put secrets in EXPO_PUBLIC_ variables.`);
  }
}

// 2. eas.json build profiles' env blocks are committed to git: no secrets at all, public or not.
const easPath = join(root, 'eas.json');
if (existsSync(easPath)) {
  const easJson = JSON.parse(readFileSync(easPath, 'utf8'));
  for (const [name, build] of Object.entries<{ env?: Record<string, string> }>(easJson.build ?? {})) {
    for (const [key, value] of Object.entries(build.env ?? {})) {
      const found = typeof value === 'string' ? danger(value) : null;
      if (found || SECRET_NAME.test(key)) errors.push(`eas.json build.${name}.env.${key} ${found ? `holds ${found}` : 'looks like a secret'}; use EAS environment variables (eas env:set) for private values, and keep privileged keys out of the app entirely.`);
    }
  }
}

// 3. app.json and the app's source: no hard-coded privileged keys.
function* files(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) { if (name !== '__tests__') yield* files(path); }
    else if (/\.(ts|tsx|js|jsx|json)$/.test(name)) yield path;
  }
}
const TOKEN = /sb_secret_[A-Za-z0-9_-]+|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g;
for (const path of [join(root, 'app.json'), ...files(join(root, 'src'))]) {
  if (!existsSync(path)) continue;
  for (const token of readFileSync(path, 'utf8').match(TOKEN) ?? []) {
    const found = danger(token);
    if (found) errors.push(`${relative(root, path)} contains ${found}.`);
  }
}

// 4. Preview and production builds need their backend. Locally, .env files fill in what the
//    environment doesn't set (as Expo CLI does); .env.local wins over .env.
const setting = (name: string) => process.env[name] || sources.find((s) => s.origin === '.env.local')?.values[name] || sources.find((s) => s.origin === '.env')?.values[name];
const url = setting('EXPO_PUBLIC_SUPABASE_URL');
const key = setting('EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY') || setting('EXPO_PUBLIC_SUPABASE_ANON_KEY');
const config = checkSupabaseConfig(url, key);
if (config.status === 'invalid-url') errors.push(`EXPO_PUBLIC_SUPABASE_URL must be https://<project-ref>.supabase.co (got "${config.url}").`);
if (eas && config.status === 'unconfigured') {
  const message = `EAS profile "${profile || 'unknown'}" has no EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: the app would run without sign-in or sync. Set them with eas env:set (see docs/ios-distribution.md).`;
  if (profile === 'preview' || profile === 'production') errors.push(message);
  else warnings.push(message);
}
if (config.status === 'ok' && config.kind === 'unknown') {
  warnings.push('The Supabase client key is neither a publishable key (sb_publishable_…) nor an anon JWT; check it is the publishable key from Project Settings → API Keys.');
}

for (const warning of warnings) console.warn(`warning: ${warning}`);
for (const error of errors) console.error(`error: ${error}`);
if (errors.length) {
  console.error(`\ncheck:env failed with ${errors.length} problem(s). Nothing secret may be compiled into the app.`);
  process.exit(1);
}
console.log(`check:env passed${config.status === 'ok' ? ` (Supabase ${config.kind} key, ${new URL(config.url).host})` : ' (no Supabase settings found here: the app runs local-only)'}.`);
