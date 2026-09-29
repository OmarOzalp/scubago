/**
 * The project's local .env files (not .env.example), parsed the way Expo CLI reads them, for
 * scripts that need the same settings the app gets. Values from the real environment win, then
 * .env.local, then .env.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/** Parse KEY=value lines (quotes stripped, comments ignored). */
export function parseEnvFile(text: string): Record<string, string> {
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

export type EnvSource = { origin: string; values: Record<string, string | undefined> };

/** The environment first, then every .env* file in `root` (except .env.example). */
export function envSources(root: string): EnvSource[] {
  const sources: EnvSource[] = [{ origin: 'environment', values: process.env }];
  for (const name of readdirSync(root)) {
    if (!/^\.env(\..+)?$/.test(name) || name === '.env.example' || !statSync(join(root, name)).isFile()) continue;
    sources.push({ origin: name, values: parseEnvFile(readFileSync(join(root, name), 'utf8')) });
  }
  return sources;
}

/** A setting as the app would see it locally: the environment, else .env.local, else .env. */
export function envSetting(sources: EnvSource[], name: string): string | undefined {
  for (const origin of ['environment', '.env.local', '.env']) {
    const value = sources.find((s) => s.origin === origin)?.values[name];
    if (value) return value;
  }
  return undefined;
}

/** The Supabase URL and client key the app would use. */
export function supabaseSettings(sources: EnvSource[]) {
  return {
    url: envSetting(sources, 'EXPO_PUBLIC_SUPABASE_URL'),
    key: envSetting(sources, 'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY') || envSetting(sources, 'EXPO_PUBLIC_SUPABASE_ANON_KEY'),
  };
}
