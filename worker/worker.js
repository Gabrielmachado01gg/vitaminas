// Servidor de avisos do app "Minhas vitaminas" (Cloudflare Worker).
// - O app manda a inscrição de notificação + itens/horários para /subscribe.
// - Um agendador (cron, a cada minuto) confere quem tem item no minuto atual e envia o aviso (Web Push).
// Variáveis necessárias: KV (namespace "KV"), VAPID_PRIVATE (segredo, base64url).

const APP_ORIGIN = 'https://gabrielmachado01gg.github.io';
const SUBJECT = 'https://gabrielmachado01gg.github.io/vitaminas/';
const VAPID_PUBLIC = 'BCAt5lMp6E4sZU_9VBkNE3HrUzmWWItIk-zGH4WCbpReS2RFI530Qmb4tp8PCfkmVJjuxQ1ntRmQNcQfv6Dtd9U';
const MAX_SUBS = 20;

const enc = new TextEncoder();
const b64u = {
  enc: (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''),
  dec: (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '=')), (c) => c.charCodeAt(0))
};
const concat = (...a) => { const o = new Uint8Array(a.reduce((n, x) => n + x.length, 0)); let p = 0; a.forEach((x) => { o.set(x, p); p += x.length; }); return o; };

async function hkdf(salt, ikm, info, len) {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, len * 8));
}

// Criptografia da mensagem (RFC 8291, aes128gcm)
export async function encryptPayload(sub, text) {
  const uaPublic = b64u.dec(sub.keys.p256dh);
  const authSecret = b64u.dec(sub.keys.auth);
  const eph = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', eph.publicKey));
  const uaKey = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, eph.privateKey, 256));
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const ikm = await hkdf(authSecret, ecdh, concat(enc.encode('WebPush: info\0'), uaPublic, asPublic), 32);
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12);
  const aes = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const plain = concat(enc.encode(text), new Uint8Array([2]));
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aes, plain));
  const rs = new Uint8Array([0, 0, 0x10, 0]); // 4096
  return concat(salt, rs, new Uint8Array([asPublic.length]), asPublic, cipher);
}

// Assinatura VAPID (JWT ES256)
export async function vapidHeader(endpoint, privateB64u, publicB64u, now = Date.now()) {
  const pub = b64u.dec(publicB64u);
  const key = await crypto.subtle.importKey(
    'jwk',
    { kty: 'EC', crv: 'P-256', x: b64u.enc(pub.slice(1, 33)), y: b64u.enc(pub.slice(33, 65)), d: privateB64u },
    { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']
  );
  const head = b64u.enc(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const body = b64u.enc(enc.encode(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(now / 1000) + 12 * 3600, sub: SUBJECT })));
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(`${head}.${body}`)));
  return `vapid t=${head}.${body}.${b64u.enc(sig)}, k=${publicB64u}`;
}

async function sendPush(env, sub, message) {
  const body = await encryptPayload(sub, JSON.stringify(message));
  return fetch(sub.endpoint, {
    method: 'POST',
    headers: {
      Authorization: await vapidHeader(sub.endpoint, env.VAPID_PRIVATE, VAPID_PUBLIC),
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: '1800',
      Urgency: 'high'
    },
    body
  });
}

const idOf = async (endpoint) => b64u.enc(await crypto.subtle.digest('SHA-256', enc.encode(endpoint))).slice(0, 22);
const loadSubs = async (env) => JSON.parse((await env.KV.get('subs')) || '{}');
const cors = { 'Access-Control-Allow-Origin': APP_ORIGIN, 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '86400' };
const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const validTime = (t) => typeof t === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(t);
function validTz(tz) { try { new Intl.DateTimeFormat('en-GB', { timeZone: tz }); return typeof tz === 'string'; } catch (e) { return false; } }

export function localHM(ms, tz) {
  return new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(ms));
}

export async function runDue(env, scheduledMs = Date.now(), send = sendPush) {
  const subs = await loadSubs(env);
  const minute = Math.floor(scheduledMs / 60000) * 60000;
  let changed = false, sent = 0;
  for (const [id, s] of Object.entries(subs)) {
    const hm = localHM(minute, s.tz);
    const due = s.items.filter((i) => i.time === hm).map((i) => i.name);
    if (!due.length) continue;
    const res = await send(env, s.sub, { title: 'Hora de tomar', body: due.join(', '), tag: `vit-${hm}`, url: './' });
    sent++;
    if (res.status === 404 || res.status === 410) { delete subs[id]; changed = true; }
  }
  if (changed) await env.KV.put('subs', JSON.stringify(subs));
  return sent;
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (req.method !== 'POST') return new Response('Minhas vitaminas: servidor de avisos no ar.', { status: 200 });

    let data;
    try { data = await req.json(); } catch (e) { return json({ error: 'json' }, 400); }

    if (url.pathname === '/subscribe') {
      const { subscription: sub, items, tz } = data;
      if (!sub || typeof sub.endpoint !== 'string' || !sub.endpoint.startsWith('https://') || !sub.keys || !sub.keys.p256dh || !sub.keys.auth) return json({ error: 'subscription' }, 400);
      if (!Array.isArray(items) || items.length > 40 || !validTz(tz)) return json({ error: 'items' }, 400);
      const clean = items.filter((i) => i && typeof i.name === 'string' && validTime(i.time)).map((i) => ({ name: i.name.slice(0, 40), time: i.time }));
      const subs = await loadSubs(env);
      const id = await idOf(sub.endpoint);
      if (!subs[id] && Object.keys(subs).length >= MAX_SUBS) return json({ error: 'limit' }, 429);
      subs[id] = { sub: { endpoint: sub.endpoint, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth } }, items: clean, tz };
      await env.KV.put('subs', JSON.stringify(subs));
      return json({ ok: true, items: clean.length });
    }

    if (url.pathname === '/unsubscribe') {
      const subs = await loadSubs(env);
      delete subs[await idOf(String(data.endpoint || ''))];
      await env.KV.put('subs', JSON.stringify(subs));
      return json({ ok: true });
    }

    if (url.pathname === '/test') {
      const subs = await loadSubs(env);
      const s = subs[await idOf(String(data.endpoint || ''))];
      if (!s) return json({ error: 'not-found' }, 404);
      const res = await sendPush(env, s.sub, { title: 'Avisos ativados', body: 'Pronto! Você vai receber um aviso na hora de cada item.', tag: 'vit-test', url: './' });
      return json({ ok: res.ok, status: res.status });
    }

    return json({ error: 'not-found' }, 404);
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(runDue(env, event.scheduledTime));
  }
};
