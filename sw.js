// Service worker: guarda o app no celular para abrir offline.
// Busca a versão nova na internet primeiro e só usa a guardada quando está offline.
const CACHE = 'vitaminas-v3';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-32.png',
  './lembretes.ics'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Gera o arquivo de lembretes na hora, com os itens e horários que vêm no endereço (?c=Nome|HHMM~Nome|HHMM).
function buildICS(param) {
  const pad = (n) => String(n).padStart(2, '0');
  const esc = (s) => s.replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,');
  const now = new Date();
  const stamp = `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}T${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}Z`;
  const day = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Minhas vitaminas//PT-BR//', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
  param.split('~').forEach((part, idx) => {
    const [name, hm] = part.split('|');
    const m = /^(\d{2})(\d{2})$/.exec(hm || '');
    if (!name || !m) return;
    const h = +m[1], mi = +m[2];
    const end = new Date(2000, 0, 1, h, mi + 10);
    const title = esc(`Tomar ${name}`);
    lines.push(
      'BEGIN:VEVENT', `UID:v${idx}-${now.getTime()}@minhas-vitaminas`, `DTSTAMP:${stamp}`,
      `DTSTART:${day}T${pad(h)}${pad(mi)}00`, `DTEND:${day}T${pad(end.getHours())}${pad(end.getMinutes())}00`,
      'RRULE:FREQ=DAILY', `SUMMARY:${title}`,
      'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${title}`, 'TRIGGER:PT0S', 'END:VALARM',
      'END:VEVENT'
    );
  });
  lines.push('END:VCALENDAR');
  return lines.join('\r\n') + '\r\n';
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (url.origin === location.origin && url.pathname.endsWith('/lembretes.ics') && url.searchParams.has('c')) {
    event.respondWith(new Response(buildICS(url.searchParams.get('c')), {
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': 'inline; filename="lembretes-vitaminas.ics"',
        'Cache-Control': 'no-store'
      }
    }));
    return;
  }

  event.respondWith(
    fetch(req).then((res) => {
      if (res.ok && url.origin === location.origin) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
      }
      return res;
    }).catch(() => caches.match(req).then((hit) => hit || (req.mode === 'navigate' ? caches.match('./index.html') : undefined)))
  );
});
