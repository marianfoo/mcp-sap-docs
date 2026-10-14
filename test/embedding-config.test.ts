import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });

describe('semantic ranking configuration', () => {
  it.each([undefined, '0', 'not-a-number', 'Infinity', '-1'])('keeps lexical ranking and avoids preloading for weight %s', async (weight) => {
    vi.stubEnv('EMBEDDING_WEIGHT', weight);
    vi.stubEnv('MCP_PRELOAD_EMBEDDINGS', 'true');
    vi.resetModules();
    const { CONFIG } = await import('../src/lib/config.js');
    expect(CONFIG.EMBEDDING_WEIGHT).toBe(0);
    expect(CONFIG.PRELOAD_EMBEDDINGS).toBe(false);
  });

  it.each([undefined, 'false'])('enables explicit semantic weight while respecting preload %s', async (preload) => {
    vi.stubEnv('EMBEDDING_WEIGHT', '0.7');
    vi.stubEnv('MCP_PRELOAD_EMBEDDINGS', preload);
    vi.resetModules();
    const { CONFIG } = await import('../src/lib/config.js');
    expect(CONFIG.EMBEDDING_WEIGHT).toBe(0.7);
    expect(CONFIG.PRELOAD_EMBEDDINGS).toBe(preload !== 'false');
  });
});
