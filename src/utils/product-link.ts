import { lookup } from 'node:dns/promises';
import { request } from 'node:https';
import { BlockList, isIP } from 'node:net';

const blocked = new BlockList();
for (const [address, prefix] of [['0.0.0.0',8],['10.0.0.0',8],['100.64.0.0',10],['127.0.0.0',8],['169.254.0.0',16],['172.16.0.0',12],['192.0.0.0',24],['192.0.2.0',24],['192.168.0.0',16],['198.18.0.0',15],['198.51.100.0',24],['203.0.113.0',24],['224.0.0.0',4],['240.0.0.0',4]] as const) blocked.addSubnet(address, prefix, 'ipv4');

// Probe only public HTTPS destinations. Pin the resolved address on every hop.
export async function availableProductLink(value: string): Promise<boolean> {
  let url: URL;
  try { url = new URL(value); } catch { return false; }
  for (let hop = 0; hop < 4; hop++) {
    if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443') || isIP(url.hostname.replace(/[\[\]]/g, ''))) return false;
    try {
      const addresses = await lookup(url.hostname, { all: true, family: 4 });
      if (!addresses.length || addresses.some((a) => blocked.check(a.address, 'ipv4'))) return false;
      const result = await new Promise<{ status: number; location?: string }>((resolve, reject) => {
        const req = request(url, { method: 'GET', headers: { Range: 'bytes=0-0' }, lookup: (_host, options, callback) => callback(null, options.all ? addresses : addresses[0].address, 4) }, (res) => {
          resolve({ status: res.statusCode || 500, location: res.headers.location });
          res.destroy();
        });
        req.setTimeout(3000, () => req.destroy(new Error('timeout')));
        req.on('error', reject); req.end();
      });
      if (result.status >= 200 && result.status < 300) return true;
      if (result.status >= 300 && result.status < 400 && result.location) { url = new URL(result.location, url); continue; }
      return false;
    } catch { return false; }
  }
  return false;
}
