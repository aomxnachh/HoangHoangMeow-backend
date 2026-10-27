import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
vi.mock('node:dns/promises', () => ({ lookup: vi.fn() }));
vi.mock('node:https', () => ({ request: vi.fn() }));
import { lookup } from 'node:dns/promises';
import { request } from 'node:https';
import { availableProductLink } from '../src/utils/product-link.js';

beforeEach(() => { vi.resetAllMocks(); vi.mocked(lookup).mockResolvedValue([{ address: '93.184.216.34', family: 4 }] as any); });
function response(statusCode: number, location?: string) {
  vi.mocked(request).mockImplementationOnce(((url: URL, options: any, callback: any) => {
    const req = new EventEmitter() as any;
    req.setTimeout = () => req;
    req.end = () => { options.lookup(url.hostname, { all: true }, (_err: unknown, records: unknown) => expect(records).toEqual([{ address: '93.184.216.34', family: 4 }])); callback({ statusCode, headers: { location }, destroy() {} }); };
    req.destroy = () => req;
    return req;
  }) as any);
}
describe('Product destination checks', () => {
  it.each(['javascript:alert(1)', 'file:///secret', 'http://example.com', 'https://127.0.0.1', 'https://[::1]', 'https://example.com:444', 'https://user:password@example.com'])('reject unsafe destination %s', async (url) => { expect(await availableProductLink(url)).toBe(false); expect(request).not.toHaveBeenCalled(); });
  it('reject hostnames resolving to private addresses', async () => { vi.mocked(lookup).mockResolvedValue([{ address: '10.0.0.1', family: 4 }] as any); expect(await availableProductLink('https://private.example')).toBe(false); expect(request).not.toHaveBeenCalled(); });
  it('accept a reachable public HTTPS product', async () => { response(200); expect(await availableProductLink('https://example.com/product')).toBe(true); });
  it('report a missing product', async () => { response(404); expect(await availableProductLink('https://example.com/missing')).toBe(false); });
  it('follow public redirects and recheck destination', async () => { response(302, 'https://shop.example/product'); response(200); expect(await availableProductLink('https://example.com/product')).toBe(true); expect(lookup).toHaveBeenCalledTimes(2); });
  it('reject a redirect into a private network', async () => { response(302, 'https://private.example/'); vi.mocked(lookup).mockResolvedValueOnce([{ address: '93.184.216.34', family: 4 }] as any).mockResolvedValueOnce([{ address: '192.168.0.1', family: 4 }] as any); expect(await availableProductLink('https://example.com/product')).toBe(false); expect(request).toHaveBeenCalledTimes(1); });
});
