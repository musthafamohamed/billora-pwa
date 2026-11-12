// @vitest-environment node
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const script = fileURLToPath(new URL('../../../scripts/check-firebase-env.sh', import.meta.url));
const configured = {
  VITE_FIREBASE_API_KEY: 'test-public-api-key',
  VITE_FIREBASE_AUTH_DOMAIN: 'billora-pwa.firebaseapp.com',
  VITE_FIREBASE_PROJECT_ID: 'billora-pwa',
  VITE_FIREBASE_APP_ID: '1:123:web:test-only',
};
const check = (env: Record<string, string>) => spawnSync('bash', [script], { env, encoding: 'utf8' });

describe('production Firebase environment check', () => {
  it('accepts complete configuration without printing its values', () => {
    const result = check(configured);
    expect(result.status).toBe(0);
    expect(result.stdout + result.stderr).toBe('');
  });

  it.each(Object.keys(configured))('blocks deployment when %s is missing', name => {
    const env: Record<string, string> = { ...configured };
    delete env[name];
    const result = check(env);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(`Missing required Firebase web configuration: ${name}`);
    for (const value of Object.values(configured)) expect(result.stdout + result.stderr).not.toContain(value);
  });

  it.each(['', ' \t\n '])('rejects empty or whitespace-only configuration', value => {
    const result = check({ ...configured, VITE_FIREBASE_API_KEY: value });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('VITE_FIREBASE_API_KEY');
  });

  it('reports all missing variable names in one failed check', () => {
    const result = check({});
    expect(result.status).toBe(1);
    for (const name of Object.keys(configured)) expect(result.stderr).toContain(name);
  });
});
