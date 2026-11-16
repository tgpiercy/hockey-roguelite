import { describe, expect, it } from 'vitest';
// The worker's own text, as shipped (Vite hands a file over as text when asked with ?raw).
import source from '../public/sw.js?raw';

/**
 * The offline copy (public/sw.js) run against a stand-in for the browser: a cache that is a map, and a
 * network that can be switched off. It cannot show that a phone opens the game with no signal, but it
 * shows the worker's own rules: what it keeps, what it serves, and what it lets go.
 */
const SCOPE = 'https://example.test/hockey-roguelite/';

interface Harness {
  online: boolean;
  /** What the "network" holds, by address. */
  site: Map<string, string>;
  kept: () => string[];
  install: () => Promise<void>;
  message: (data: unknown) => Promise<void>;
  /** Asks for an address as the page would; resolves to the text served, or null if nothing could be. */
  get: (url: string, navigate?: boolean) => Promise<string | null>;
}

function harness(): Harness {
  const store = new Map<string, Response>();
  const abs = (target: string | Request): string => new URL(typeof target === 'string' ? target : target.url, SCOPE).href;
  const h = { online: true, site: new Map<string, string>() } as Harness;
  const fetchFake = async (target: string | Request): Promise<Response> => {
    const url = abs(target);
    if (!h.online) throw new TypeError('offline');
    const body = h.site.get(url);
    return body === undefined ? new Response('missing', { status: 404 }) : new Response(body, { status: 200 });
  };
  const cache = {
    addAll: async (urls: string[]) => {
      for (const url of urls) store.set(abs(url), await fetchFake(url));
    },
    add: async (url: string) => {
      const response = await fetchFake(url);
      if (!response.ok) throw new Error('not found');
      store.set(abs(url), response);
    },
    put: async (target: string | Request, response: Response) => {
      store.set(abs(target), response);
    },
    keys: async () => [...store.keys()].map((url) => ({ url })),
    delete: async (url: string) => store.delete(abs(url)),
  };
  const caches = {
    open: async () => cache,
    keys: async () => ['third-line-v1'],
    delete: async () => true,
    match: async (target: string | Request) => store.get(abs(target))?.clone(),
  };
  const handlers = new Map<string, (event: unknown) => void>();
  const self = {
    addEventListener: (type: string, handler: (event: unknown) => void) => handlers.set(type, handler),
    skipWaiting: async () => undefined,
    clients: { claim: async () => undefined },
    registration: { scope: SCOPE },
    location: { origin: new URL(SCOPE).origin },
  };
  new Function('self', 'caches', 'fetch', source)(self, caches, fetchFake);

  const run = async (type: string, extra: Record<string, unknown>): Promise<Response | null> => {
    const waits: Promise<unknown>[] = [];
    let answer: Promise<Response> | null = null;
    handlers.get(type)!({ ...extra, waitUntil: (p: Promise<unknown>) => waits.push(p), respondWith: (p: Promise<Response>) => (answer = p) });
    await Promise.all(waits);
    const response = answer ? await (answer as Promise<Response>).catch(() => null) : null;
    // Let any copies being put away settle.
    await new Promise((r) => setTimeout(r, 0));
    return response;
  };
  h.kept = () => [...store.keys()].map((url) => url.replace(SCOPE, './')).sort();
  h.install = async () => {
    await run('install', {});
    await run('activate', {});
  };
  h.message = async (data) => {
    await run('message', { data });
  };
  h.get = async (url, navigate = false) => {
    const response = await run('fetch', { request: { method: 'GET', url: abs(url), mode: navigate ? 'navigate' : 'no-cors' } });
    return response && response.type !== 'error' && response.ok ? response.text() : null;
  };
  return h;
}

const page = (h: Harness, version: string): void => {
  h.site.set(SCOPE, `page ${version}`);
  h.site.set(`${SCOPE}manifest.webmanifest`, 'manifest');
  h.site.set(`${SCOPE}assets/index-${version}.js`, `code ${version}`);
  h.site.set(`${SCOPE}assets/index-${version}.css`, `style ${version}`);
};

describe('the offline copy of the game', () => {
  it('keeps the page and the manifest as soon as it is installed', async () => {
    const h = harness();
    page(h, 'a');
    await h.install();
    expect(h.kept()).toEqual(['./', './manifest.webmanifest']);
  });

  it('once told what the page is made of, opens with no network at all', async () => {
    const h = harness();
    page(h, 'a');
    await h.install();
    await h.message({ type: 'keep', urls: [SCOPE, `${SCOPE}manifest.webmanifest`, `${SCOPE}assets/index-a.js`, `${SCOPE}assets/index-a.css`] });
    h.online = false;
    expect(await h.get('./', true)).toBe('page a');
    expect(await h.get('./assets/index-a.js')).toBe('code a');
    expect(await h.get('./assets/index-a.css')).toBe('style a');
    expect(await h.get('./manifest.webmanifest')).toBe('manifest');
  });

  it('with a network, the page comes fresh, so an update arrives at once', async () => {
    const h = harness();
    page(h, 'a');
    await h.install();
    h.site.set(SCOPE, 'page b');
    expect(await h.get('./', true)).toBe('page b');
    // And the fresh page is the one kept for next time.
    h.online = false;
    expect(await h.get('./', true)).toBe('page b');
  });

  it('a file it has not kept is fetched once and served from the copy after', async () => {
    const h = harness();
    page(h, 'a');
    await h.install();
    expect(await h.get('./assets/index-a.js')).toBe('code a');
    h.online = false;
    expect(await h.get('./assets/index-a.js')).toBe('code a');
    // One it never saw cannot be served offline.
    expect(await h.get('./assets/never-seen.js')).toBeNull();
  });

  it('after an update, the old version’s files are let go and the new ones kept', async () => {
    const h = harness();
    page(h, 'a');
    await h.install();
    await h.message({ type: 'keep', urls: [SCOPE, `${SCOPE}manifest.webmanifest`, `${SCOPE}assets/index-a.js`, `${SCOPE}assets/index-a.css`] });
    page(h, 'b');
    await h.message({ type: 'keep', urls: [SCOPE, `${SCOPE}manifest.webmanifest`, `${SCOPE}assets/index-b.js`, `${SCOPE}assets/index-b.css`] });
    expect(h.kept()).toEqual(['./', './assets/index-b.css', './assets/index-b.js', './manifest.webmanifest']);
  });

  it('ignores anything that is not its own: other sites, and requests that change things', async () => {
    const h = harness();
    page(h, 'a');
    await h.install();
    const before = h.kept();
    expect(await h.get('https://elsewhere.test/thing.js')).toBeNull();
    await h.message({ type: 'something-else' });
    await h.message(null);
    expect(h.kept()).toEqual(before);
  });
});
