import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createHmac, randomBytes } from 'crypto';

// ─── Cookie jar ───────────────────────────────────────────────────────────────

type CookieJar = Map<string, string>;

function extractSetCookies(headers: Headers): string[] {
  const h = headers as unknown as { getSetCookie?: () => string[] };
  if (typeof h.getSetCookie === 'function') return h.getSetCookie();
  const raw = headers.get('set-cookie');
  return raw ? [raw] : [];
}

function updateJar(jar: CookieJar, setCookies: string[]): void {
  for (const c of setCookies) {
    const nameVal = c.split(';')[0].trim();
    const eq = nameVal.indexOf('=');
    if (eq > 0) jar.set(nameVal.slice(0, eq), nameVal.slice(eq + 1));
  }
}

function jarHeader(jar: CookieJar): string {
  return Array.from(jar.entries()).map(([k, v]) => `${k}=${v}`).join('; ');
}

// ─── OAuth 1.0a helpers ───────────────────────────────────────────────────────

function pct(s: string): string {
  return encodeURIComponent(s)
    .replace(/!/g, '%21').replace(/'/g, '%27')
    .replace(/\(/g, '%28').replace(/\)/g, '%29').replace(/\*/g, '%2A');
}

function oauthBase(consumerKey: string, tokenKey?: string): Record<string, string> {
  const p: Record<string, string> = {
    oauth_consumer_key: consumerKey,
    oauth_nonce: randomBytes(16).toString('hex'),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: String(Math.floor(Date.now() / 1000)),
    oauth_version: '1.0',
  };
  if (tokenKey) p.oauth_token = tokenKey;
  return p;
}

function oauthSign(
  method: string,
  baseUrl: string,
  allParams: Record<string, string>,
  consumerSecret: string,
  tokenSecret = ''
): string {
  const sorted = Object.keys(allParams)
    .sort()
    .map(k => `${pct(k)}=${pct(allParams[k])}`)
    .join('&');
  const sigBase = [method.toUpperCase(), pct(baseUrl), pct(sorted)].join('&');
  const sigKey = `${pct(consumerSecret)}&${pct(tokenSecret)}`;
  return createHmac('sha1', sigKey).update(sigBase).digest('base64');
}

function toAuthHeader(params: Record<string, string>): string {
  return 'OAuth ' + Object.entries(params)
    .map(([k, v]) => `${pct(k)}="${pct(v)}"`)
    .join(', ');
}

// ─── Garmin SSO + OAuth flow ─────────────────────────────────────────────────

const GC_API      = 'https://connectapi.garmin.com';
const SSO_ORIGIN  = 'https://sso.garmin.com';
const SERVICE_URL = 'https://mobile.integration.garmin.com/gcm/ios';
const CLIENT_ID   = 'GCM_IOS_DARK';
const IOS_APP_VER = '5.23.1';
const UA_IOS_APP  = `GCM-iOS-${IOS_APP_VER}.1`;
const UA_IOS_FULL = `com.garmin.connect.mobile/${IOS_APP_VER}.1;;Apple/iPhone14,7/;iOS/18.4.1;CFNetwork/1.0(Darwin/25.3.0)`;

const SSO_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_4_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept-Encoding': 'gzip, deflate, br',
  'Origin': SSO_ORIGIN,
  'Sec-Fetch-Site': 'same-origin',
  'Sec-Fetch-Mode': 'cors',
  'Sec-Fetch-Dest': 'empty',
};

// TOKEN_LIFETIME_MS: Garmin OAuth2 tokens duran ~1 año (31536000 segundos)
const TOKEN_LIFETIME_MS = 365 * 24 * 60 * 60 * 1000;
const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 2000;

async function garminGetBearerToken(email: string, password: string): Promise<{ accessToken: string; expiresAt: number }> {
  // Step 1: OAuth consumer keys
  const consumerRes = await fetch('https://thegarth.s3.amazonaws.com/oauth_consumer.json');
  if (!consumerRes.ok) throw new Error('No se pudieron obtener las claves OAuth de Garmin');
  const { consumer_key, consumer_secret } = await consumerRes.json() as { consumer_key: string; consumer_secret: string };

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const jar: CookieJar = new Map();

    // Step 2: Init SSO session
    const r1 = await fetch(
      `${SSO_ORIGIN}/mobile/sso/en/sign-in?clientId=${CLIENT_ID}`,
      {
        headers: { ...SSO_HEADERS, 'Sec-Fetch-Site': 'none', 'Sec-Fetch-Mode': 'navigate', 'Sec-Fetch-Dest': 'document' },
        redirect: 'follow',
      }
    );
    updateJar(jar, extractSetCookies(r1.headers));

    // Step 3: Login via JSON mobile API
    const loginParams = new URLSearchParams({ clientId: CLIENT_ID, locale: 'en-US', service: SERVICE_URL });
    const r2 = await fetch(`${SSO_ORIGIN}/mobile/api/login?${loginParams}`, {
      method: 'POST',
      headers: {
        ...SSO_HEADERS,
        'Content-Type': 'application/json',
        'Cookie': jarHeader(jar),
        'Referer': `${SSO_ORIGIN}/mobile/sso/en/sign-in?clientId=${CLIENT_ID}`,
      },
      body: JSON.stringify({ username: email, password, rememberMe: false, captchaToken: '' }),
      redirect: 'follow',
    });
    updateJar(jar, extractSetCookies(r2.headers));

    const r2Text = await r2.text();

    if (r2.status === 429 || r2Text.toLowerCase().includes('too many requests')) {
      console.log(`[connect-garmin] Intento ${attempt}/${MAX_ATTEMPTS} → 429${attempt < MAX_ATTEMPTS ? ', reintentando...' : ''}`);
      if (attempt < MAX_ATTEMPTS) {
        await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
        continue;
      }
      throw new Error(`Garmin está bloqueando temporalmente la conexión (error 429 tras ${MAX_ATTEMPTS} intentos). Esperá unos minutos e intentá de nuevo.`);
    }

    if (!r2.ok) {
      throw new Error(`Error al conectar con Garmin SSO (${r2.status}): ${r2Text.slice(0, 300)}`);
    }

    let loginJson: { responseStatus?: { type?: string; message?: string }; serviceTicketId?: string };
    try {
      loginJson = JSON.parse(r2Text);
    } catch {
      const preview = r2Text.slice(0, 300).replace(/\s+/g, ' ');
      throw new Error(`Garmin SSO devolvió HTML en lugar de JSON (${r2.status}). Posible bloqueo de Cloudflare. Detalle: ${preview}`);
    }

    const respType = loginJson?.responseStatus?.type ?? '';
    if (respType === 'MFA_REQUIRED') {
      throw new Error('Garmin requiere verificación en dos pasos (MFA). Desactivala en connect.garmin.com para poder usar esta app.');
    }
    if (respType !== 'SUCCESSFUL' || !loginJson.serviceTicketId) {
      const msg = loginJson?.responseStatus?.message ?? respType ?? 'sin detalle';
      throw new Error(`Credenciales de Garmin incorrectas: ${msg}`);
    }

    const ticket = loginJson.serviceTicketId;

    // Step 4: Exchange ticket → OAuth 1.0a token
    const preauthBase = `${GC_API}/oauth-service/oauth/preauthorized`;
    const preauthQp: Record<string, string> = { ticket, 'login-url': SERVICE_URL, 'accepts-mfa-tokens': 'true' };
    const preauthOauth = oauthBase(consumer_key);
    preauthOauth.oauth_signature = oauthSign('GET', preauthBase, { ...preauthQp, ...preauthOauth }, consumer_secret);

    const r3 = await fetch(`${preauthBase}?${new URLSearchParams(preauthQp)}`, {
      headers: {
        Authorization: toAuthHeader(preauthOauth),
        'User-Agent': UA_IOS_APP,
        'X-app-ver': IOS_APP_VER,
        'X-Garmin-User-Agent': UA_IOS_FULL,
      },
    });
    const oauth1Text = await r3.text();
    const oauth1Qs = new URLSearchParams(oauth1Text);
    const oauth_token = oauth1Qs.get('oauth_token') ?? '';
    const oauth_token_secret = oauth1Qs.get('oauth_token_secret') ?? '';
    if (!oauth_token) throw new Error(`OAuth 1.0a falló (${r3.status}): ${oauth1Text.slice(0, 200)}`);

    // Step 5: Exchange OAuth 1.0a → OAuth 2.0 bearer token
    const exchangeBase = `${GC_API}/oauth-service/oauth/exchange/user/2.0`;
    const exchOauth = oauthBase(consumer_key, oauth_token);
    exchOauth.oauth_signature = oauthSign('POST', exchangeBase, exchOauth, consumer_secret, oauth_token_secret);

    const r4 = await fetch(`${exchangeBase}?${new URLSearchParams(exchOauth)}`, {
      method: 'POST',
      headers: {
        'User-Agent': UA_IOS_APP,
        'X-app-ver': IOS_APP_VER,
        'X-Garmin-User-Agent': UA_IOS_FULL,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });
    const r4Text = await r4.text();
    let oauth2: { access_token?: string; expires_in?: number };
    try {
      oauth2 = JSON.parse(r4Text);
    } catch {
      throw new Error(`OAuth2 exchange devolvió respuesta inválida (${r4.status}): ${r4Text.slice(0, 300)}`);
    }
    if (!oauth2.access_token) throw new Error(`Bearer token no recibido (${r4.status}): ${r4Text.slice(0, 200)}`);

    const expiresAt = Date.now() + (oauth2.expires_in ? oauth2.expires_in * 1000 : TOKEN_LIFETIME_MS);
    return { accessToken: oauth2.access_token, expiresAt };
  }

  throw new Error('Error inesperado en el flujo de autenticación de Garmin.');
}

// ─── Handler ──────────────────────────────────────────────────────────────────

// ─── Proxy residencial (opcional) ────────────────────────────────────────────
// Si GARMIN_AUTH_PROXY_URL está configurado, delega el SSO al servidor local
// corriendo en una PC con IP residencial para evitar el bloqueo de Cloudflare.

async function garminGetBearerTokenViaProxy(
  email: string,
  password: string,
  proxyUrl: string,
  proxyApiKey: string
): Promise<{ accessToken: string; expiresAt: number }> {
  const url = proxyUrl.replace(/\/$/, '') + '/connect-garmin';
  console.log('[connect-garmin] Usando proxy residencial:', proxyUrl);

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Api-Key': proxyApiKey,
    },
    body: JSON.stringify({ email, password }),
    signal: AbortSignal.timeout(55_000),
  });

  const data = await res.json() as { accessToken?: string; expiresAt?: number; error?: string };

  if (!res.ok || !data.accessToken) {
    throw new Error(data.error ?? `Proxy respondió con error ${res.status}`);
  }

  return { accessToken: data.accessToken, expiresAt: data.expiresAt ?? Date.now() + 365 * 24 * 60 * 60 * 1000 };
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { email, password } = req.body ?? {};
  if (!email || typeof email !== 'string' || !email.includes('@')) return res.status(400).json({ error: 'Email inválido.' });
  if (!password || typeof password !== 'string') return res.status(400).json({ error: 'Contraseña requerida.' });

  const proxyUrl    = process.env.GARMIN_AUTH_PROXY_URL ?? '';
  const proxyApiKey = process.env.GARMIN_PROXY_API_KEY ?? '';

  try {
    let accessToken: string;
    let expiresAt: number;

    if (proxyUrl && proxyApiKey) {
      console.log('[connect-garmin] Conectando via proxy residencial para:', email);
      ({ accessToken, expiresAt } = await garminGetBearerTokenViaProxy(email, password, proxyUrl, proxyApiKey));
    } else {
      console.log('[connect-garmin] Conectando directo (sin proxy) para:', email);
      ({ accessToken, expiresAt } = await garminGetBearerToken(email, password));
    }

    console.log('[connect-garmin] Token obtenido OK, expira:', new Date(expiresAt).toISOString());
    return res.status(200).json({ accessToken, expiresAt });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[connect-garmin] Error:', msg);
    const is401 = msg.includes('incorrectas') || msg.includes('incorrectos');
    const is429 = msg.includes('429') || msg.includes('bloqueando') || msg.includes('RATE_LIMITED');
    return res.status(is401 ? 401 : is429 ? 429 : 502).json({ error: msg });
  }
}
