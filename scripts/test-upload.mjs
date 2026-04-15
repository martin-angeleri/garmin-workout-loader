/**
 * Test directo del upload a Garmin Connect sin servidor web.
 * Uso: node scripts/test-upload.mjs tu@email.com tupassword
 */
import { createHmac, randomBytes } from 'crypto';

const [,, EMAIL, PASSWORD] = process.argv;
if (!EMAIL || !PASSWORD) {
  console.error('Uso: node scripts/test-upload.mjs EMAIL PASSWORD');
  process.exit(1);
}

// ─── OAuth helpers ────────────────────────────────────────────────────────────
function pct(s) {
  return encodeURIComponent(s)
    .replace(/!/g,'%21').replace(/'/g,'%27')
    .replace(/\(/g,'%28').replace(/\)/g,'%29').replace(/\*/g,'%2A');
}
function oauthBase(consumerKey, tokenKey) {
  const p = {
    oauth_consumer_key: consumerKey,
    oauth_nonce: randomBytes(16).toString('hex'),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: String(Math.floor(Date.now()/1000)),
    oauth_version: '1.0',
  };
  if (tokenKey) p.oauth_token = tokenKey;
  return p;
}
function oauthSign(method, baseUrl, allParams, consumerSecret, tokenSecret='') {
  const sorted = Object.keys(allParams).sort().map(k=>`${pct(k)}=${pct(allParams[k])}`).join('&');
  const sigBase = [method.toUpperCase(), pct(baseUrl), pct(sorted)].join('&');
  const sigKey = `${pct(consumerSecret)}&${pct(tokenSecret)}`;
  return createHmac('sha1', sigKey).update(sigBase).digest('base64');
}
function toAuthHeader(params) {
  return 'OAuth ' + Object.entries(params).map(([k,v])=>`${pct(k)}="${pct(v)}"`).join(', ');
}

const SSO_EMBED  = 'https://sso.garmin.com/sso/embed';
const SSO_SIGNIN = 'https://sso.garmin.com/sso/signin';
const GC_MODERN  = 'https://connect.garmin.com/modern';
const GC_API     = 'https://connectapi.garmin.com';
const UA_MOBILE  = 'com.garmin.android.apps.connectmobile';
const UA_BROWSER = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

// ─── Cookie jar ───────────────────────────────────────────────────────────────
const jar = new Map();
function updateJar(headers) {
  const cookies = headers.getSetCookie?.() ?? (headers.get('set-cookie') ? [headers.get('set-cookie')] : []);
  for (const c of cookies) {
    const nv = c.split(';')[0].trim();
    const eq = nv.indexOf('=');
    if (eq>0) jar.set(nv.slice(0,eq), nv.slice(eq+1));
  }
}
function jarStr() { return [...jar.entries()].map(([k,v])=>`${k}=${v}`).join('; '); }

async function login() {
  console.log('Step 1: OAuth consumer keys...');
  const cr = await fetch('https://thegarth.s3.amazonaws.com/oauth_consumer.json');
  const { consumer_key, consumer_secret } = await cr.json();
  console.log('  consumer_key:', consumer_key.slice(0,8)+'...');

  console.log('Step 2: SSO session...');
  const r1 = await fetch(`${SSO_EMBED}?clientId=GarminConnect&locale=en&service=${encodeURIComponent(GC_MODERN)}`);
  updateJar(r1.headers);
  console.log('  status:', r1.status, '| cookies:', jar.size);

  console.log('Step 3: Login page + CSRF...');
  const step2Qs = `id=gauth-widget&embedWidget=true&locale=en&gauthHost=${encodeURIComponent(SSO_EMBED)}`;
  const r2 = await fetch(`${SSO_SIGNIN}?${step2Qs}`, { headers: { Cookie: jarStr() } });
  updateJar(r2.headers);
  const html2 = await r2.text();
  const csrf = (/name="_csrf"\s+value="([^"]+)"/.exec(html2) ?? /value="([^"]+)"\s+name="_csrf"/.exec(html2))?.[1];
  console.log('  status:', r2.status, '| CSRF found:', !!csrf);
  if (!csrf) { console.error('  HTML snippet:', html2.slice(0,500)); process.exit(1); }

  console.log('Step 4: Submitting credentials...');
  const signinQsp = new URLSearchParams({ id:'gauth-widget', embedWidget:'true', clientId:'GarminConnect',
    locale:'en', gauthHost: SSO_EMBED, service: SSO_EMBED, source: SSO_EMBED,
    redirectAfterAccountLoginUrl: SSO_EMBED, redirectAfterAccountCreationUrl: SSO_EMBED });
  const loginBody = new URLSearchParams({ username: EMAIL, password: PASSWORD, embed:'true', _csrf: csrf });
  const r3 = await fetch(`${SSO_SIGNIN}?${signinQsp}`, {
    method:'POST',
    headers:{ 'Content-Type':'application/x-www-form-urlencoded', Cookie: jarStr(),
      Origin:'https://sso.garmin.com', Referer:`${SSO_SIGNIN}?${step2Qs}`, 'User-Agent': UA_BROWSER },
    body: loginBody.toString(), redirect:'follow',
  });
  updateJar(r3.headers);
  const html3 = await r3.text();
  console.log('  status:', r3.status);
  if (/AccountLocked/i.test(html3)) { console.error('  CUENTA BLOQUEADA'); process.exit(1); }
  if (/MFACode|verificationCode|two.factor/i.test(html3)) { console.error('  MFA REQUERIDO'); process.exit(1); }
  const ticketMatch = /ticket=([^"&\s]+)/.exec(html3);
  console.log('  ticket found:', !!ticketMatch);
  if (!ticketMatch) {
    console.error('  HTML snippet:', html3.slice(0,800));
    process.exit(1);
  }
  const ticket = ticketMatch[1];

  console.log('Step 5: OAuth1 token...');
  const preauthBase = `${GC_API}/oauth-service/oauth/preauthorized`;
  const preauthQp = { ticket, 'login-url': SSO_EMBED, 'accepts-mfa-tokens': 'true' };
  const preauthOauth = oauthBase(consumer_key);
  preauthOauth.oauth_signature = oauthSign('GET', preauthBase, {...preauthQp,...preauthOauth}, consumer_secret);
  const r4 = await fetch(`${preauthBase}?${new URLSearchParams(preauthQp)}`, {
    headers:{ Authorization: toAuthHeader(preauthOauth), 'User-Agent': UA_MOBILE }
  });
  const oauth1Text = await r4.text();
  const oauth1Qs = new URLSearchParams(oauth1Text);
  const oauth_token = oauth1Qs.get('oauth_token') ?? '';
  const oauth_token_secret = oauth1Qs.get('oauth_token_secret') ?? '';
  console.log('  status:', r4.status, '| oauth_token found:', !!oauth_token);
  if (!oauth_token) { console.error('  Response:', oauth1Text.slice(0,300)); process.exit(1); }

  console.log('Step 6: Exchange OAuth1 → OAuth2 bearer...');
  const exchangeBase = `${GC_API}/oauth-service/oauth/exchange/user/2.0`;
  const exchOauth = oauthBase(consumer_key, oauth_token);
  exchOauth.oauth_signature = oauthSign('POST', exchangeBase, exchOauth, consumer_secret, oauth_token_secret);
  const r5 = await fetch(`${exchangeBase}?${new URLSearchParams(exchOauth)}`, {
    method:'POST', headers:{ 'User-Agent': UA_MOBILE, 'Content-Type':'application/x-www-form-urlencoded' }
  });
  const oauth2 = await r5.json();
  console.log('  status:', r5.status, '| access_token found:', !!oauth2.access_token);
  if (!oauth2.access_token) { console.error('  Response:', JSON.stringify(oauth2).slice(0,300)); process.exit(1); }
  return oauth2.access_token;
}

// ─── Test workout ─────────────────────────────────────────────────────────────
const TEST_WORKOUT = {
  workoutId: null,
  workoutName: 'TEST 5x1km al 85% - Borrar',
  description: 'Workout de prueba - Garmin Workout Loader',
  sportType: { sportTypeId: 1, sportTypeKey: 'running' },
  workoutSegments: [{
    segmentOrder: 1,
    sportType: { sportTypeId: 1, sportTypeKey: 'running' },
    workoutSteps: [
      { type:'ExecutableStepDTO', stepId:null, stepOrder:1, childStepId:null, description:'Calentamiento',
        stepType:{stepTypeId:1,stepTypeKey:'warmup'}, endCondition:{conditionTypeId:2,conditionTypeKey:'time'},
        preferredEndConditionUnit:{unitKey:'second'}, endConditionValue:600, endConditionCompare:null,
        endConditionZone:null, targetType:{workoutTargetTypeId:1,workoutTargetTypeKey:'no.target'},
        targetValueOne:null, targetValueTwo:null, zoneNumber:null },
      { type:'RepeatGroupDTO', stepId:null, stepOrder:2, childStepId:1, numberOfIterations:5, smartRepeat:false,
        workoutSteps:[
          { type:'ExecutableStepDTO', stepId:null, stepOrder:3, childStepId:null, description:'1km al 85%',
            stepType:{stepTypeId:3,stepTypeKey:'interval'}, endCondition:{conditionTypeId:3,conditionTypeKey:'distance'},
            preferredEndConditionUnit:{unitKey:'meter'}, endConditionValue:1000, endConditionCompare:null,
            endConditionZone:null, targetType:{workoutTargetTypeId:4,workoutTargetTypeKey:'heart.rate.zone'},
            targetValueOne:157, targetValueTwo:162, zoneNumber:null },
          { type:'ExecutableStepDTO', stepId:null, stepOrder:4, childStepId:null, description:'Recuperación',
            stepType:{stepTypeId:4,stepTypeKey:'recovery'}, endCondition:{conditionTypeId:2,conditionTypeKey:'time'},
            preferredEndConditionUnit:{unitKey:'second'}, endConditionValue:90, endConditionCompare:null,
            endConditionZone:null, targetType:{workoutTargetTypeId:1,workoutTargetTypeKey:'no.target'},
            targetValueOne:null, targetValueTwo:null, zoneNumber:null },
        ]},
      { type:'ExecutableStepDTO', stepId:null, stepOrder:5, childStepId:null, description:'Vuelta a la calma',
        stepType:{stepTypeId:2,stepTypeKey:'cooldown'}, endCondition:{conditionTypeId:2,conditionTypeKey:'time'},
        preferredEndConditionUnit:{unitKey:'second'}, endConditionValue:600, endConditionCompare:null,
        endConditionZone:null, targetType:{workoutTargetTypeId:1,workoutTargetTypeKey:'no.target'},
        targetValueOne:null, targetValueTwo:null, zoneNumber:null },
    ]
  }]
};

// ─── Main ─────────────────────────────────────────────────────────────────────
console.log('\n=== TEST UPLOAD A GARMIN CONNECT ===\n');
try {
  const token = await login();
  console.log('\nStep 7: Subiendo workout...');
  const r = await fetch(`${GC_API}/workout-service/workout`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'NK': 'NT',
      'di-backend': 'connectapi.garmin.com',
    },
    body: JSON.stringify(TEST_WORKOUT),
  });
  const body = await r.text();
  console.log('  status:', r.status);
  console.log('  response:', body.slice(0, 500));
  if (r.ok) console.log('\n✅ ÉXITO! El workout se subió a Garmin Connect.');
  else console.log('\n❌ FALLÓ. Revisar respuesta arriba.');
} catch(e) {
  console.error('\n❌ ERROR:', e.message);
}
