import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createHmac, randomBytes } from 'crypto';

// ─── Types & constants (inlined to avoid cross-bundle import issues in Vercel) ─

type StepTypeKey = 'warmup' | 'cooldown' | 'interval' | 'recovery' | 'rest' | 'other';
type EndConditionKey = 'lap.button' | 'time' | 'distance';
type TargetTypeKey = 'no.target' | 'heart.rate.zone' | 'speed.zone';

const STEP_TYPE_IDS: Record<StepTypeKey, number> = {
  warmup: 1, cooldown: 2, interval: 3, recovery: 4, rest: 5, other: 7,
};
const END_CONDITION_IDS: Record<EndConditionKey, number> = {
  'lap.button': 1, time: 2, distance: 3,
};
const TARGET_TYPE_IDS: Record<TargetTypeKey, number> = {
  'no.target': 1, 'heart.rate.zone': 4, 'speed.zone': 6,
};

interface ParsedStep {
  type: 'step';
  stepType: StepTypeKey;
  description: string;
  endCondition: EndConditionKey;
  endConditionValue: number | null;
  targetType: TargetTypeKey;
  targetValueOne: number | null;
  targetValueTwo: number | null;
}
interface ParsedRepeatGroup {
  type: 'repeat';
  numberOfIterations: number;
  steps: ParsedStep[];
}
interface ParsedWorkout {
  name: string;
  steps: (ParsedStep | ParsedRepeatGroup)[];
}
interface GarminExecutableStep {
  type: 'ExecutableStepDTO';
  stepId: null; stepOrder: number; childStepId: null;
  description: string;
  stepType: { stepTypeId: number; stepTypeKey: StepTypeKey };
  endCondition: { conditionTypeId: number; conditionTypeKey: EndConditionKey };
  preferredEndConditionUnit: { unitKey: 'second' | 'meter' };
  endConditionValue: number | null;
  endConditionCompare: null; endConditionZone: null;
  targetType: { workoutTargetTypeId: number; workoutTargetTypeKey: TargetTypeKey };
  targetValueOne: number | null; targetValueTwo: number | null; zoneNumber: null;
}
interface GarminRepeatGroup {
  type: 'RepeatGroupDTO';
  stepId: null; stepOrder: number; childStepId: number;
  numberOfIterations: number; smartRepeat: false;
  workoutSteps: GarminExecutableStep[];
}
type GarminWorkoutStep = GarminExecutableStep | GarminRepeatGroup;
interface GarminWorkout {
  workoutId: null; workoutName: string; description: string;
  sportType: { sportTypeId: 1; sportTypeKey: 'running' };
  workoutSegments: [{ segmentOrder: 1; sportType: { sportTypeId: 1; sportTypeKey: 'running' }; workoutSteps: GarminWorkoutStep[] }];
}

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

// ─── Garmin Connect SSO + OAuth flow ─────────────────────────────────────────

const GC_API      = 'https://connectapi.garmin.com';
const SSO_ORIGIN  = 'https://sso.garmin.com';
// iOS client — matches the actual Garmin Connect iOS app (reverse-engineered, Apr 2026)
const SERVICE_URL = 'https://mobile.integration.garmin.com/gcm/ios';
const CLIENT_ID   = 'GCM_IOS_DARK';
const IOS_APP_VER = '5.23.1';
const UA_IOS_APP  = `GCM-iOS-${IOS_APP_VER}.1`;
const UA_IOS_FULL = `com.garmin.connect.mobile/${IOS_APP_VER}.1;;Apple/iPhone14,7/;iOS/18.4.1;CFNetwork/1.0(Darwin/25.3.0)`;

// Browser WebView headers for the SSO login page (Cloudflare-friendly)
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

async function garminGetBearerToken(email: string, password: string): Promise<string> {
  // Step 1: OAuth consumer keys (public S3 endpoint)
  const consumerRes = await fetch('https://thegarth.s3.amazonaws.com/oauth_consumer.json');
  if (!consumerRes.ok) throw new Error('No se pudieron obtener las claves OAuth de Garmin');
  const { consumer_key, consumer_secret } = await consumerRes.json() as { consumer_key: string; consumer_secret: string };

  // Reintentar el login hasta 3 veces si Cloudflare devuelve 429 (bloqueo intermitente)
  const MAX_ATTEMPTS = 3;
  const RETRY_DELAY_MS = 2000;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    // Step 2: Init SSO session (sets Cloudflare cookies)
    const jar: CookieJar = new Map();
    const r1 = await fetch(
      `${SSO_ORIGIN}/mobile/sso/en/sign-in?clientId=${CLIENT_ID}`,
      {
        headers: { ...SSO_HEADERS, 'Sec-Fetch-Site': 'none', 'Sec-Fetch-Mode': 'navigate', 'Sec-Fetch-Dest': 'document' },
        redirect: 'follow',
      }
    );
    updateJar(jar, extractSetCookies(r1.headers));

    // Step 3: Login via JSON mobile API
    const loginParams = new URLSearchParams({
      clientId: CLIENT_ID,
      locale: 'en-US',
      service: SERVICE_URL,
    });
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

    // Si 429, reintentar (Cloudflare bloqueo intermitente desde datacenter IPs)
    if (r2.status === 429 || r2Text.toLowerCase().includes('too many requests')) {
      console.log(`[upload-workout] Login intento ${attempt}/${MAX_ATTEMPTS} → 429, ${attempt < MAX_ATTEMPTS ? `reintentando en ${RETRY_DELAY_MS}ms...` : 'sin más intentos.'}`);
      if (attempt < MAX_ATTEMPTS) {
        await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
        continue;
      }
      throw new Error(`Garmin está bloqueando temporalmente los accesos programáticos (error 429 tras ${MAX_ATTEMPTS} intentos). Esto es una restricción de Cloudflare sobre servidores en la nube, no un problema de credenciales. Intentá de nuevo en unos minutos.`);
    }

    if (!r2.ok && r2.status !== 200) {
      throw new Error(`Error al conectar con Garmin SSO (${r2.status}): ${r2Text.slice(0, 300)}`);
    }

    let loginJson: { responseStatus?: { type?: string; message?: string }; serviceTicketId?: string };
    try {
      loginJson = JSON.parse(r2Text);
    } catch {
      const preview = r2Text.slice(0, 300).replace(/\s+/g, ' ');
      throw new Error(`Garmin SSO devolvió HTML en lugar de JSON (status ${r2.status}). Posible bloqueo de Cloudflare. Detalle: ${preview}`);
    }

    const respType = loginJson?.responseStatus?.type ?? '';
    if (respType === 'MFA_REQUIRED') {
      throw new Error('Garmin requiere verificación en dos pasos (MFA). Desactivala en connect.garmin.com para poder usar esta app.');
    }
    if (respType !== 'SUCCESSFUL' || !loginJson.serviceTicketId) {
      const msg = loginJson?.responseStatus?.message ?? respType ?? 'sin detalle';
      throw new Error(`Credenciales de Garmin incorrectas o error de autenticación: ${msg}`);
    }

    const ticket = loginJson.serviceTicketId;

    // Step 4: Exchange ticket for OAuth 1.0a token
    const preauthBase = `${GC_API}/oauth-service/oauth/preauthorized`;
    const preauthQp: Record<string, string> = {
      ticket,
      'login-url': SERVICE_URL,
      'accepts-mfa-tokens': 'true',
    };
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

    // Step 5: Exchange OAuth 1.0a for OAuth 2.0 bearer token
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
    let oauth2: { access_token?: string };
    try {
      oauth2 = JSON.parse(r4Text);
    } catch {
      throw new Error(`OAuth2 exchange devolvió respuesta inválida (${r4.status}): ${r4Text.slice(0, 300)}`);
    }
    if (!oauth2.access_token) throw new Error(`Bearer token no recibido (${r4.status}): ${r4Text.slice(0, 200)}`);

    return oauth2.access_token;
  }

  // Nunca debería llegar acá
  throw new Error('Error inesperado en el flujo de autenticación de Garmin.');

// ─── Conversión ParsedWorkout → GarminWorkout ─────────────────────────────────

let stepOrderCounter = 0;

function buildExecutableStep(step: ParsedStep): GarminExecutableStep {
  stepOrderCounter++;
  const unitKey = step.endCondition === 'distance' ? 'meter' : 'second';
  return {
    type: 'ExecutableStepDTO',
    stepId: null,
    stepOrder: stepOrderCounter,
    childStepId: null,
    description: step.description,
    stepType: { stepTypeId: STEP_TYPE_IDS[step.stepType], stepTypeKey: step.stepType },
    endCondition: { conditionTypeId: END_CONDITION_IDS[step.endCondition], conditionTypeKey: step.endCondition },
    preferredEndConditionUnit: { unitKey },
    endConditionValue: step.endConditionValue,
    endConditionCompare: null,
    endConditionZone: null,
    targetType: { workoutTargetTypeId: TARGET_TYPE_IDS[step.targetType], workoutTargetTypeKey: step.targetType },
    targetValueOne: step.targetValueOne,
    targetValueTwo: step.targetValueTwo,
    zoneNumber: null,
  };
}

function buildRepeatGroup(group: ParsedRepeatGroup, childStepId: number): GarminRepeatGroup {
  stepOrderCounter++;
  const groupOrder = stepOrderCounter;
  return {
    type: 'RepeatGroupDTO',
    stepId: null,
    stepOrder: groupOrder,
    childStepId,
    numberOfIterations: group.numberOfIterations,
    smartRepeat: false,
    workoutSteps: group.steps.map(s => buildExecutableStep(s)),
  };
}

function parsedToGarmin(parsed: ParsedWorkout): GarminWorkout {
  stepOrderCounter = 0;
  let childCounter = 1;
  const steps: GarminWorkoutStep[] = [];
  for (const s of parsed.steps) {
    if (s.type === 'step') steps.push(buildExecutableStep(s as ParsedStep));
    else steps.push(buildRepeatGroup(s as ParsedRepeatGroup, childCounter++));
  }
  return {
    workoutId: null,
    workoutName: parsed.name,
    description: 'Creado con Garmin Workout Loader – © Martín Angeleri',
    sportType: { sportTypeId: 1, sportTypeKey: 'running' },
    workoutSegments: [{
      segmentOrder: 1,
      sportType: { sportTypeId: 1, sportTypeKey: 'running' },
      workoutSteps: steps,
    }],
  };
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { workout, email, password } = req.body ?? {};
  if (!workout || typeof workout !== 'object') return res.status(400).json({ error: 'El campo "workout" es requerido.' });
  if (!email || typeof email !== 'string' || !email.includes('@')) return res.status(400).json({ error: 'Email inválido.' });
  if (!password || typeof password !== 'string') return res.status(400).json({ error: 'Contraseña requerida.' });

  let bearerToken: string;
  try {
    console.log('[upload-workout] Autenticando en Garmin Connect...');
    bearerToken = await garminGetBearerToken(email, password);
    console.log('[upload-workout] Login OK');
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[upload-workout] Auth error:', msg);
    const is401 = msg.includes('Credenciales') || msg.includes('incorrectas') || msg.includes('incorrectos');
    const is429 = msg.includes('429') || msg.includes('bloqueando');
    const status = is401 ? 401 : is429 ? 429 : 502;
    return res.status(status).json({ error: msg });
  }

  try {
    const garminWorkout = parsedToGarmin(workout as ParsedWorkout);
    console.log('[upload-workout] Subiendo workout:', garminWorkout.workoutName);

    const uploadRes = await fetch(`${GC_API}/workout-service/workout`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${bearerToken}`,
        'Content-Type': 'application/json',
        'NK': 'NT',
        'di-backend': 'connectapi.garmin.com',
      },
      body: JSON.stringify(garminWorkout),
    });

    const uploadText = await uploadRes.text();
    console.log('[upload-workout] Garmin response', uploadRes.status, uploadText.slice(0, 300));

    if (!uploadRes.ok) {
      return res.status(502).json({ error: `Garmin rechazó el workout (${uploadRes.status}): ${uploadText.slice(0, 200)}` });
    }

    const result = JSON.parse(uploadText) as Record<string, unknown>;
    const workoutId = (result.workoutId ?? result.id ?? 0) as number;
    return res.status(200).json({ workoutId, workoutName: garminWorkout.workoutName });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[upload-workout] Upload error:', msg);
    return res.status(500).json({ error: 'Error al subir el workout: ' + msg });
  }
}
