import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createHmac } from 'crypto';

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  const info: Record<string, unknown> = {
    nodeVersion: process.version,
    platform: process.platform,
    hasFetch: typeof fetch !== 'undefined',
    cryptoHmacOk: false,
    fetchTest: null as unknown,
  };

  try {
    const hmac = createHmac('sha1', 'secret');
    hmac.update('test');
    hmac.digest('base64');
    info.cryptoHmacOk = true;
  } catch (e) {
    info.cryptoError = String(e);
  }

  try {
    const r = await fetch('https://thegarth.s3.amazonaws.com/oauth_consumer.json');
    info.fetchTest = { status: r.status, ok: r.ok };
    const body = await r.json();
    info.consumerKeyFound = typeof (body as Record<string,unknown>).consumer_key === 'string';
  } catch (e) {
    info.fetchError = String(e);
  }

  return res.status(200).json(info);
}
