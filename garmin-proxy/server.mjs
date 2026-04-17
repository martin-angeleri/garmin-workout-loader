import http from 'http';
import { createHmac, randomBytes } from 'crypto';

// ─── Config ───────────────────────────────────────────────────────────────────
const PORT       = parseInt(process.env.PORT ?? '3001', 10);
const API_KEY    = process.env.GARMIN_PROXY_API_KEY ?? '';

if (!API_KEY) {
  console.error('ERROR: Falta la variable de entorno GARMIN_PROXY_API_KEY');
  process.exit(1);
}

// ─── Cookie jar ───────────────────────────────────────────────────────────────
function makeCookieJar() {
  const jar = new Map();
  function updateJar(headers) {
    const cookies = headers.getSetCookie?.() ?? (headers.get('set-cookie') ? [headers.get('set-cookie')] : []);
    for (const c of cookies) {
      const nv = c.split(';')[0].trim();
      const eq = nv.indexOf('=');
      if (eq > 0) jar.set(nv.slice(0, eq), nv.slice(eq + 1));
    }
  }
  function jarStr() { return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; '); }
  return { updateJar, jarStr };
}

// ─── OAuth 1.0a helpers ───────────────────────────────────────────────────────
function pct(s) {
  return encodeURIComponent(s)
    .replace(/!/g, '%21').replace(/'/g, '%27')
    .replace(/\(/g, '%28').replace(/\)/g, '%29').replace(/\*/g, '%2A');
}
function oauthBase(consumerKey, tokenKey) {
  const p = {
    oauth_consumer_key: consumerKey,
    oauth_nonce: randomBytes(16).toString('hex'),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: String(Math.floor(Date.now() / 1000)),
    oauth_version: '1.0',
  };
  if (tokenKey) p.oauth_token = tokenKey;
  return p;
}
function oauthSign(method, baseUrl, allParams, consumerSecret, tokenSecret = '') {
  const sorted = Object.keys(allParams).sort().map(k => `${pct(k)}=${pct(allParams[k])}`).join('&');
  const sigBase = [method.toUpperCase(), pct(baseUrl), pct(sorted)].join('&');
  const sigKey = `${pct(consumerSecret)}&${pct(tokenSecret)}`;
  return createHmac('sha1', sigKey).update(sigBase).digest('base64');
}
function toAuthHeader(params) {
  return 'OAuth ' + Object.entries(params).map(([k, v]) => `${pct(k)}="${pct(v)}"`).join(', ');
}

// ─── Garmin auth flow ─────────────────────────────────────────────────────────
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
  'Origin': SSO_ORIGIN,
};

async function getGarminToken(email, password) {
  const consumerRes = await fetch('https://thegarth.s3.amazonaws.com/oauth_consumer.json');
  if (!consumerRes.ok) throw new Error('No se pudieron obtener las claves OAuth');
  const { consumer_key, consumer_secret } = await consumerRes.json();

  const { updateJar, jarStr } = makeCookieJar();

  const r1 = await fetch(`${SSO_ORIGIN}/mobile/sso/en/sign-in?clientId=${CLIENT_ID}`, {
    headers: { ...SSO_HEADERS, 'Sec-Fetch-Site': 'none', 'Sec-Fetch-Mode': 'navigate', 'Sec-Fetch-Dest': 'document' },
    redirect: 'follow',
  });
  updateJar(r1.headers);

  const loginParams = new URLSearchParams({ clientId: CLIENT_ID, locale: 'en-US', service: SERVICE_URL });
  const r2 = await fetch(`${SSO_ORIGIN}/mobile/api/login?${loginParams}`, {
    method: 'POST',
    headers: {
      ...SSO_HEADERS,
      'Content-Type': 'application/json',
      'Cookie': jarStr(),
      'Referer': `${SSO_ORIGIN}/mobile/sso/en/sign-in?clientId=${CLIENT_ID}`,
    },
    body: JSON.stringify({ username: email, password, rememberMe: false, captchaToken: '' }),
    redirect: 'follow',
  });
  updateJar(r2.headers);

  if (r2.status === 429) throw new Error('RATE_LIMITED');

  const r2Text = await r2.text();
  let loginJson;
  try { loginJson = JSON.parse(r2Text); }
  catch { throw new Error(`Garmin devolvio HTML (posible bloqueo). Status: ${r2.status}`); }

  const respType = loginJson?.responseStatus?.type ?? '';
  if (respType === 'MFA_REQUIRED') throw new Error('MFA requerido. Desactivalo en connect.garmin.com.');
  if (respType !== 'SUCCESSFUL' || !loginJson.serviceTicketId) {
    throw new Error(`Credenciales incorrectas: ${loginJson?.responseStatus?.message ?? respType}`);
  }

  const ticket = loginJson.serviceTicketId;

  const preauthBase = `${GC_API}/oauth-service/oauth/preauthorized`;
  const preauthQp = { ticket, 'login-url': SERVICE_URL, 'accepts-mfa-tokens': 'true' };
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
  if (!oauth_token) throw new Error(`OAuth1 fallo (${r3.status}): ${oauth1Text.slice(0, 200)}`);

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
  let oauth2;
  try { oauth2 = JSON.parse(r4Text); }
  catch { throw new Error(`OAuth2 exchange fallo (${r4.status}): ${r4Text.slice(0, 300)}`); }
  if (!oauth2.access_token) throw new Error(`Bearer token no recibido (${r4.status}): ${r4Text.slice(0, 200)}`);

  const expiresAt = Date.now() + (oauth2.expires_in ? oauth2.expires_in * 1000 : 365 * 24 * 60 * 60 * 1000);
  return { accessToken: oauth2.access_token, expiresAt };
}

// ─── HTTP Server ──────────────────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  res.setHeader('Content-Type', 'application/json');

  // CORS para Vercel
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Api-Key');

  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
  if (req.method !== 'POST' || req.url !== '/connect-garmin') {
    res.writeHead(404);
    res.end(JSON.stringify({ error: 'Not found' }));
    return;
  }

  // Verificar API key
  const apiKey = req.headers['x-api-key'];
  if (!apiKey || apiKey !== API_KEY) {
    res.writeHead(401);
    res.end(JSON.stringify({ error: 'Unauthorized' }));
    return;
  }

  // Leer body
  let body = '';
  for await (const chunk of req) body += chunk;
  let parsed;
  try { parsed = JSON.parse(body); }
  catch { res.writeHead(400); res.end(JSON.stringify({ error: 'Invalid JSON' })); return; }

  const { email, password } = parsed;
  if (!email || !password) {
    res.writeHead(400);
    res.end(JSON.stringify({ error: 'email y password requeridos' }));
    return;
  }

  console.log(`[${new Date().toISOString()}] Conectando: ${email}`);

  try {
    const { accessToken, expiresAt } = await getGarminToken(email, password);
    console.log(`[${new Date().toISOString()}] Token OK para: ${email}`);
    res.writeHead(200);
    res.end(JSON.stringify({ accessToken, expiresAt }));
  } catch (err) {
    const msg = err.message;
    console.error(`[${new Date().toISOString()}] Error: ${msg}`);
    const status = msg === 'RATE_LIMITED' ? 429 : msg.includes('incorrectas') ? 401 : 502;
    const userMsg = msg === 'RATE_LIMITED'
      ? 'Garmin esta bloqueando temporalmente. Espera unos minutos.'
      : msg;
    res.writeHead(status);
    res.end(JSON.stringify({ error: userMsg }));
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`
Garmin Auth Proxy corriendo en http://0.0.0.0:${PORT}`);
  console.log('Endpoint: POST /connect-garmin');
  console.log('Listo para recibir pedidos de Vercel.
');
});
