// Shared helpers for the applicant-portal stress harness.
// Run any script with: node scripts/stress/<script>.mjs
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const OUT_DIR =
  process.env.STRESS_OUT || resolve(ROOT, 'scripts/stress/.out');

export function loadEnv() {
  const env = { ...process.env };
  const path = resolve(ROOT, '.env.local');
  if (existsSync(path)) {
    for (const line of readFileSync(path, 'utf8').split('\n')) {
      const m = line.match(/^\s*(?:export\s+)?([\w.]+)\s*=\s*(.*?)\s*$/);
      if (m && env[m[1]] === undefined) {
        env[m[1]] = m[2].replace(/^["']|["']$/g, '');
      }
    }
  }
  return env;
}

// supabase-js wants the bare project URL. A path suffix (e.g. "/rest/v1/")
// makes every auth/storage/functions request 404.
export function normalizeSupabaseUrl(raw) {
  const warnings = [];
  const url = String(raw || '').trim();
  const m = url.match(/^(https?:\/\/[^/]+)(\/.*)?$/);
  if (!m) {
    throw new Error(`VITE_SUPABASE_URL is not a valid URL: "${raw}"`);
  }
  if (m[2] && m[2] !== '/') {
    warnings.push(
      `VITE_SUPABASE_URL carries a path suffix "${m[2]}". supabase-js appends ` +
        `auth/v1, rest/v1, storage/v1 to it, so the portal cannot sign anyone ` +
        `in with this value. The harness uses ${m[1]} instead.`,
    );
  }
  return { url: m[1], warnings };
}

export function getConfig() {
  const env = loadEnv();
  const { url, warnings } = normalizeSupabaseUrl(env.VITE_SUPABASE_URL);
  if (!env.VITE_SUPABASE_ANON_KEY) {
    throw new Error('VITE_SUPABASE_ANON_KEY is missing from .env.local');
  }
  return {
    url,
    anonKey: env.VITE_SUPABASE_ANON_KEY,
    serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY || '',
    emailBase: env.STRESS_EMAIL_BASE || '',
    users: Number(env.STRESS_USERS || 10),
    redirectTo:
      env.STRESS_REDIRECT_TO || 'https://utwat-website.vercel.app/apply',
    warnings,
  };
}

export function testEmails(config) {
  if (!config.emailBase || !config.emailBase.includes('@')) {
    throw new Error(
      'Set STRESS_EMAIL_BASE=you@gmail.com (plus-addressed variants are used).',
    );
  }
  const [local, domain] = config.emailBase.split('@');
  return Array.from(
    { length: config.users },
    (_, i) => `${local}+bots-stress-${i + 1}@${domain}`,
  );
}

const authOpts = {
  persistSession: false,
  autoRefreshToken: false,
  detectSessionInUrl: false,
};

export function anonClient(config) {
  return createClient(config.url, config.anonKey, { auth: authOpts });
}

// A client that sends a real applicant JWT, exactly like the browser does
// after the magic link is consumed.
export function userClient(config, accessToken) {
  return createClient(config.url, config.anonKey, {
    auth: authOpts,
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}

export function serviceClient(config) {
  if (!config.serviceRoleKey) return null;
  return createClient(config.url, config.serviceRoleKey, { auth: authOpts });
}

export function saveJson(name, value) {
  mkdirSync(OUT_DIR, { recursive: true });
  const path = resolve(OUT_DIR, name);
  writeFileSync(path, JSON.stringify(value, null, 2));
  return path;
}

export function loadJson(name, fallback = null) {
  const path = resolve(OUT_DIR, name);
  return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : fallback;
}

export function logWarnings(config) {
  for (const w of config.warnings) console.log(`! ${w}`);
}

export async function timed(fn) {
  const t = performance.now();
  try {
    const value = await fn();
    return { ms: Math.round(performance.now() - t), value };
  } catch (error) {
    return { ms: Math.round(performance.now() - t), thrown: error };
  }
}

export function pad(s, n) {
  s = String(s ?? '');
  return s.length >= n ? s : s + ' '.repeat(n - s.length);
}

export function errorSummary(error) {
  if (!error) return '';
  const parts = [];
  if (error.status) parts.push(String(error.status));
  if (error.code) parts.push(error.code);
  parts.push(error.message || String(error));
  return parts.join(' ');
}
