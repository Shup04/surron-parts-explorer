import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import manifest from '../src/app/manifest';

describe('standalone app assets', () => {
  it('provides standalone metadata and real PNG icons at the declared sizes', async () => {
    const app = manifest();
    expect(app.display).toBe('standalone');
    expect(app.start_url).toBe('/');
    expect(app.scope).toBe('/');
    for (const icon of app.icons!) {
      const bytes = await readFile(`public${icon.src}`);
      expect(bytes.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
      const [width, height] = icon.sizes!.split('x').map(Number);
      expect(bytes.readUInt32BE(16)).toBe(width);
      expect(bytes.readUInt32BE(20)).toBe(height);
    }
  });
});

async function worker() {
  const listeners = new Map<string, (event: unknown) => void>();
  const fallback = new Response('<h1>You’re offline</h1>', {
    headers: { 'Content-Type': 'text/html' },
  });
  const cache = {
    add: vi.fn().mockResolvedValue(undefined),
    match: vi.fn().mockResolvedValue(fallback),
  };
  const caches = {
    open: vi.fn().mockResolvedValue(cache),
    keys: vi.fn().mockResolvedValue(['surron-offline-v0', 'surron-offline-v1', 'other-app-cache']),
    delete: vi.fn().mockResolvedValue(true),
  };
  const fetch = vi.fn().mockResolvedValue(new Response('live app'));
  const self = {
    location: { origin: 'https://parts.example' },
    addEventListener: (name: string, listener: (event: unknown) => void) =>
      listeners.set(name, listener),
    skipWaiting: vi.fn().mockResolvedValue(undefined),
    clients: { claim: vi.fn().mockResolvedValue(undefined) },
  };
  // Browser Request accepts relative URLs; Node requires an explicit base.
  class WorkerRequest extends Request {
    constructor(url: string, options?: RequestInit) {
      super(new URL(url, self.location.origin), options);
    }
  }
  vm.runInNewContext(await readFile('public/sw.js', 'utf8'), {
    self,
    caches,
    fetch,
    URL,
    Request: WorkerRequest,
    Response,
  });
  async function lifecycle(name: string) {
    let work: Promise<unknown> | undefined;
    listeners.get(name)!({
      waitUntil: (promise: Promise<unknown>) => {
        work = promise;
      },
    });
    await work;
  }
  function request(url: string, mode = 'navigate', method = 'GET') {
    let response: Promise<Response> | undefined;
    listeners.get('fetch')!({
      request: { url, mode, method },
      respondWith: (promise: Promise<Response>) => {
        response = promise;
      },
    });
    return response;
  }
  return { listeners, cache, caches, fetch, fallback, self, lifecycle, request };
}

describe('offline navigation recovery', () => {
  it('caches only the recovery document and removes only its own obsolete caches', async () => {
    const app = await worker();
    await app.lifecycle('install');
    expect(app.cache.add).toHaveBeenCalledTimes(1);
    expect(app.cache.add.mock.calls[0][0].url).toBe('https://parts.example/offline.html');
    expect(app.cache.add.mock.calls[0][0].cache).toBe('reload');
    await app.lifecycle('activate');
    expect(app.caches.delete.mock.calls).toEqual([['surron-offline-v0']]);
    expect(app.self.clients.claim).toHaveBeenCalledOnce();
  });

  it('uses live navigation responses and falls back without changing the requested deep link', async () => {
    const app = await worker();
    const url = 'https://parts.example/?nav=nav.rear-wheel.hub';
    expect(await (await app.request(url))!.text()).toBe('live app');
    expect(app.cache.match).not.toHaveBeenCalled();
    app.fetch.mockRejectedValue(new TypeError('Offline'));
    expect(await app.request(url)).toBe(app.fallback);
    expect(app.fetch.mock.calls[1][0].url).toBe(url);
    app.cache.match.mockResolvedValue(undefined);
    expect((await app.request(url))!.status).toBe(503);
  });

  it('does not intercept model, bundle, cross-origin or write requests', async () => {
    const app = await worker();
    expect(app.request('https://parts.example/parts/Rear%20Hub.glb', 'cors')).toBeUndefined();
    expect(app.request('https://parts.example/_next/static/app.js', 'no-cors')).toBeUndefined();
    expect(app.request('https://another.example/', 'navigate')).toBeUndefined();
    expect(app.request('https://parts.example/', 'navigate', 'POST')).toBeUndefined();
    expect(app.fetch).not.toHaveBeenCalled();
    expect(app.caches.open).not.toHaveBeenCalled();
  });
});
