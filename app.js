(() => {
  'use strict';

  /* ---------- Dados ---------- */
  const STORE_KEY = 'vitaminas.v1';

  // Horários são sugestões e podem ser trocados em Ajustes.
  const DEFAULT_ITEMS = [
    { id: 'vit-c',    name: 'Vitamina C',  abbr: 'C',   hue: 24,  time: '08:00', active: true },
    { id: 'ferro',    name: 'Ferro',       abbr: 'Fe',  hue: 8,   time: '08:00', active: true },
    { id: 'vit-d',    name: 'Vitamina D',  abbr: 'D',   hue: 46,  time: '08:00', active: true },
    { id: 'vit-b12',  name: 'Vitamina B12',abbr: 'B12', hue: 346, time: '08:00', active: true },
    { id: 'curcuma',  name: 'Cúrcuma',     abbr: 'Cu',  hue: 36,  time: '13:00', active: true },
    { id: 'magnesio', name: 'Magnésio',    abbr: 'Mg',  hue: 212, time: '21:00', active: true },
    { id: 'anti',     name: 'Anti',        abbr: 'Rx',  hue: 172, time: '20:00', active: true }
  ];

  let state = load();

  function load() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) {
        const s = JSON.parse(raw);
        if (s && Array.isArray(s.items) && s.log) return s;
      }
    } catch (e) { /* storage indisponível */ }
    return { items: DEFAULT_ITEMS.map((i) => ({ ...i })), log: {}, hideInstall: false };
  }
  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) { /* ignora */ }
  }

  /* ---------- Datas ---------- */
  const pad = (n) => String(n).padStart(2, '0');
  const keyOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parseKey = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
  const todayKey = () => keyOf(new Date());
  const nowHM = () => { const d = new Date(); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
  const fmtLong = (d) => new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }).format(d);
  const fmtMonth = (d) => new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(d);

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* ---------- Cálculos ---------- */
  const activeItems = () => state.items.filter((i) => i.active).sort((a, b) => a.time.localeCompare(b.time));
  const taken = (key, id) => (state.log[key] || {})[id];

  function stats(key) {
    const items = activeItems();
    const done = items.filter((i) => taken(key, i.id)).length;
    return { done, total: items.length };
  }

  function streak() {
    const t = todayKey();
    const d = parseKey(t);
    const s0 = stats(t);
    if (!(s0.total > 0 && s0.done === s0.total)) d.setDate(d.getDate() - 1);
    let n = 0;
    for (let i = 0; i < 400; i++) {
      const s = stats(keyOf(d));
      if (s.total > 0 && s.done === s.total) { n++; d.setDate(d.getDate() - 1); } else break;
    }
    return n;
  }

  function toggle(key, id) {
    const day = state.log[key] || (state.log[key] = {});
    if (day[id]) {
      delete day[id];
      if (!Object.keys(day).length) delete state.log[key];
    } else {
      const item = state.items.find((i) => i.id === id);
      day[id] = key === todayKey() ? nowHM() : (item ? item.time : '00:00');
    }
    save();
  }

  /* ---------- Marcação das linhas ---------- */
  const CHECK_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5.5 12.5l4.2 4.2L18.5 7.5"/></svg>';

  function rowHTML(item, key, disabled) {
    return `<li><button class="row" data-id="${item.id}" data-day="${key}" aria-pressed="false"${disabled ? ' disabled' : ''}>
      <span class="chip" style="--h:${item.hue}" aria-hidden="true">${esc(item.abbr)}</span>
      <span class="txt"><span class="name">${esc(item.name)}</span><span class="meta"></span></span>
      <span class="check" aria-hidden="true">${CHECK_SVG}</span>
    </button></li>`;
  }

  function syncRow(btn) {
    const id = btn.dataset.id, key = btn.dataset.day;
    const item = state.items.find((i) => i.id === id);
    if (!item) return;
    const t = taken(key, id);
    btn.setAttribute('aria-pressed', t ? 'true' : 'false');
    const meta = btn.querySelector('.meta');
    if (t) {
      meta.textContent = `Tomado às ${t}`;
      meta.classList.remove('late');
    } else {
      const late = key === todayKey() && item.time < nowHM();
      meta.textContent = item.time;
      meta.classList.toggle('late', late);
    }
  }

  function syncAllRows(root) { root.querySelectorAll('.row').forEach(syncRow); }

  /* ---------- Estado de tela ---------- */
  const view = document.getElementById('view');
  let tab = 'hoje';
  let calMonth = (() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); })();
  let shownDay = todayKey();

  /* ---------- Tela: Hoje ---------- */
  function renderToday() {
    const key = todayKey();
    shownDay = key;
    const items = activeItems();
    const groups = [
      { label: 'Manhã', test: (t) => t < '12:00' },
      { label: 'Tarde', test: (t) => t >= '12:00' && t < '18:00' },
      { label: 'Noite', test: (t) => t >= '18:00' }
    ];

    let html = `<header class="top"><p class="eyebrow">${esc(fmtLong(new Date()))}</p><h1>Hoje</h1></header>`;

    if (needsInstallHint()) {
      html += `<div class="install" id="install"><p><b>Instale como app.</b> Toque em Compartilhar e depois em Adicionar à Tela de Início.</p>
        <button class="icon-btn" id="install-close" aria-label="Dispensar aviso"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/></svg></button></div>`;
    }

    if (!items.length) {
      html += `<div class="empty"><b>Nenhum item ativo</b>Ative suas vitaminas e remédios em Ajustes.<br><button class="btn" data-go="ajustes">Abrir ajustes</button></div>`;
      view.innerHTML = html;
      return;
    }

    html += `<section class="progress" id="progress" aria-live="polite">
      <div class="progress-row"><div class="count"><span id="p-count"></span><small>tomados</small></div><div class="msg" id="p-msg"></div></div>
      <div class="bar" aria-hidden="true"><i id="p-bar"></i></div>
      <div class="done-line"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7"/></svg><div><b>Tudo certo por hoje</b><span>Todos os itens foram tomados.</span></div></div>
    </section>`;

    groups.forEach((g) => {
      const list = items.filter((i) => g.test(i.time));
      if (!list.length) return;
      html += `<section class="group"><h2>${g.label}</h2><ul class="list">${list.map((i) => rowHTML(i, key, false)).join('')}</ul></section>`;
    });

    view.innerHTML = html;
    syncAllRows(view);
    updateProgress();
  }

  function updateProgress() {
    const card = document.getElementById('progress');
    if (!card) return;
    const { done, total } = stats(todayKey());
    document.getElementById('p-count').textContent = `${done} de ${total}`;
    document.getElementById('p-msg').textContent = done === 0 ? 'Nada marcado ainda' : `Faltam ${total - done}`;
    document.getElementById('p-bar').style.setProperty('--p', total ? done / total : 0);
    card.classList.toggle('is-done', total > 0 && done === total);
  }

  function needsInstallHint() {
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const standalone = window.navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches;
    return ios && !standalone && !state.hideInstall;
  }

  /* ---------- Tela: Calendário ---------- */
  const DOW = [['D', 'domingo'], ['S', 'segunda'], ['T', 'terça'], ['Q', 'quarta'], ['Q', 'quinta'], ['S', 'sexta'], ['S', 'sábado']];

  function renderCalendar() {
    const now = new Date();
    const isCurrent = calMonth.getFullYear() === now.getFullYear() && calMonth.getMonth() === now.getMonth();
    const n = streak();
    const streakText = n > 0 ? `<b>${n}</b> ${n === 1 ? 'dia completo seguido' : 'dias completos seguidos'}` : 'Complete hoje para começar uma sequência';

    view.innerHTML = `
      <div class="cal-head">
        <button class="icon-btn" id="prev" aria-label="Mês anterior"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.5 6l-6 6 6 6"/></svg></button>
        <h1 id="cal-title"></h1>
        <button class="icon-btn" id="next" aria-label="Próximo mês"${isCurrent ? ' disabled' : ''}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9.5 6l6 6-6 6"/></svg></button>
      </div>
      <p class="streak">${streakText}</p>
      <div class="cal">
        <div class="dow" aria-hidden="true">${DOW.map((d) => `<span>${d[0]}</span>`).join('')}</div>
        <div class="days" id="days"></div>
      </div>
      <div class="legend">
        <span><i class="l-full"></i>Tudo tomado</span><span><i class="l-part"></i>Parcial</span><span><i class="l-none"></i>Nenhum</span>
      </div>`;
    drawDays();
  }

  function drawDays() {
    const days = document.getElementById('days');
    if (!days) return;
    document.getElementById('cal-title').textContent = fmtMonth(calMonth);
    const y = calMonth.getFullYear(), m = calMonth.getMonth();
    const first = new Date(y, m, 1).getDay();
    const count = new Date(y, m + 1, 0).getDate();
    const t = todayKey();
    let html = '';
    for (let i = 0; i < first; i++) html += '<span></span>';
    for (let d = 1; d <= count; d++) {
      const key = `${y}-${pad(m + 1)}-${pad(d)}`;
      const future = key > t;
      const { done, total } = stats(key);
      let cls = 'none';
      if (!future && total > 0) cls = done === total ? 'full' : done > 0 ? 'part' : 'none';
      const label = `${d} de ${new Intl.DateTimeFormat('pt-BR', { month: 'long' }).format(calMonth)}, ${future ? 'ainda não chegou' : `${done} de ${total} tomados`}`;
      html += `<button class="day ${cls}${key === t ? ' today' : ''}" data-day="${key}" aria-label="${label}"${future ? ' disabled' : ''}>${d}</button>`;
    }
    days.innerHTML = html;
  }

  /* ---------- Tela: Ajustes ---------- */
  function renderSettings() {
    view.innerHTML = `
      <h1 class="set-title">Ajustes</h1>
      <p class="set-sub">Mude o nome e o horário de cada item. Itens desligados saem da lista de hoje.</p>
      <ul class="list">${state.items.map((i) => `
        <li class="set-row${i.active ? '' : ' off'}" data-id="${i.id}">
          <span class="chip" style="--h:${i.hue}" aria-hidden="true">${esc(i.abbr)}</span>
          <div class="field">
            <input type="text" value="${esc(i.name)}" maxlength="28" aria-label="Nome" data-f="name" autocomplete="off" autocapitalize="sentences">
            <input type="time" value="${i.time}" aria-label="Horário de ${esc(i.name)}" data-f="time">
            ${i.custom ? '<button class="link-del" data-del>Remover item</button>' : ''}
          </div>
          <button class="switch" role="switch" aria-checked="${i.active}" aria-label="Ativar ${esc(i.name)}" data-f="active"></button>
        </li>`).join('')}
      </ul>
      <button class="btn ghost block" id="add-item">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5.5v13M5.5 12h13"/></svg>Adicionar item
      </button>

      <h2 class="sec-title">Avisos no celular</h2>
      <p class="set-sub">Receba uma notificação na hora de cada item ativo, com o nome e o horário que estão acima.</p>
      <button class="btn block" id="push-btn" type="button">Ativar avisos</button>
      <button class="btn ghost block" id="push-test" type="button" hidden>Enviar aviso de teste</button>
      <p class="note" id="push-msg"></p>

      <p class="note">Os horários são só uma sugestão. Siga sempre a orientação do seu médico ou nutricionista. Seus dados ficam guardados neste celular.</p>`;
    pushUI();
  }

  /* ---------- Novos itens ---------- */
  const NEW_HUES = [96, 150, 200, 20, 60, 330, 120, 190];
  const abbrOf = (name) => {
    const s = (name.trim().split(/\s+/)[0] || '?').slice(0, 2);
    return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
  };

  function addItem() {
    const n = state.items.filter((i) => i.custom).length;
    const item = { id: 'x' + Date.now().toString(36), name: 'Novo item', abbr: 'No', hue: NEW_HUES[n % NEW_HUES.length], time: '08:00', active: true, custom: true };
    state.items.push(item);
    save();
    pushSyncSoon();
    renderSettings();
    const input = view.querySelector(`.set-row[data-id="${item.id}"] input[data-f="name"]`);
    if (input) { input.scrollIntoView({ block: 'center' }); input.focus(); input.select(); }
  }

  /* ---------- Avisos (notificações push) ---------- */
  const WORKER_URL = 'https://vitaminas-avisos.gabrielolwmachado.workers.dev';
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isStandalone = window.navigator.standalone === true || (window.matchMedia && matchMedia('(display-mode: standalone)').matches);
  const pushSupported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  let pushMsg = '';
  let pushBusy = false;

  const urlB64 = (b64) => {
    const p = (b64 + '='.repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
    return Uint8Array.from(atob(p), (c) => c.charCodeAt(0));
  };

  async function api(path, body) {
    const r = await fetch(WORKER_URL + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!r.ok) throw new Error(path + ' ' + r.status);
    return r.json();
  }

  let vapidKey = null;
  async function getKey() {
    if (vapidKey) return vapidKey;
    const r = await fetch(WORKER_URL + '/key');
    if (!r.ok) throw new Error('key ' + r.status);
    vapidKey = (await r.json()).key;
    return vapidKey;
  }
  const sameKey = (sub, key) => {
    const k = sub.options && sub.options.applicationServerKey;
    if (!k) return true;
    const a = new Uint8Array(k), b = urlB64(key);
    return a.length === b.length && a.every((v, i) => v === b[i]);
  };
  // Garante uma inscrição que combine com a chave atual do servidor (refaz se a chave mudou).
  async function ensureSub(create) {
    const reg = await navigator.serviceWorker.ready;
    const key = await getKey();
    let sub = await reg.pushManager.getSubscription();
    if (sub && !sameKey(sub, key)) { await sub.unsubscribe(); sub = null; }
    if (!sub && create) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64(key) });
    return sub;
  }

  async function getSub() {
    if (!pushSupported) return null;
    const reg = await navigator.serviceWorker.ready;
    return reg.pushManager.getSubscription();
  }

  const payloadItems = () => activeItems().map((i) => ({ name: i.name, time: i.time }));
  const tzName = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Sao_Paulo'; } catch (e) { return 'America/Sao_Paulo'; } };

  // Manda ao servidor a lista atual de itens e horários (só se os avisos estiverem ligados).
  async function pushSync() {
    try {
      if (!(await getSub()) || Notification.permission !== 'granted') return;
      const sub = await ensureSub(true);
      await api('/subscribe', { subscription: sub.toJSON(), items: payloadItems(), tz: tzName() });
    } catch (e) { /* tenta de novo na próxima mudança ou ao abrir o app */ }
  }
  let syncTimer = null;
  function pushSyncSoon() {
    if (!pushSupported || !/^https?:$/.test(location.protocol)) return;
    clearTimeout(syncTimer);
    syncTimer = setTimeout(pushSync, 800);
  }

  async function pushUI() {
    const btn = document.getElementById('push-btn');
    const test = document.getElementById('push-test');
    const msg = document.getElementById('push-msg');
    if (!btn) return;
    let on = false;
    if (!pushSupported) {
      btn.hidden = true;
      msg.textContent = isIOS && !isStandalone
        ? 'No iPhone, os avisos só funcionam pelo app instalado: toque em Compartilhar, depois em "Adicionar à Tela de Início", abra pelo ícone e volte aqui.'
        : 'Este navegador não permite avisos. No iPhone, instale o app na Tela de Início e abra por lá.';
      return;
    }
    try { on = !!(await getSub()) && Notification.permission === 'granted'; } catch (e) { on = false; }
    if (!btn.isConnected) return;
    btn.hidden = false;
    btn.disabled = pushBusy;
    btn.textContent = on ? 'Desativar avisos' : 'Ativar avisos';
    btn.classList.toggle('ghost', on);
    test.hidden = !on;
    if (pushMsg) msg.textContent = pushMsg;
    else if (Notification.permission === 'denied') msg.textContent = 'Os avisos estão bloqueados. Abra Ajustes do iPhone > Notificações > Minhas vitaminas e permita.';
    else if (on) msg.textContent = 'Avisos ligados. Se você mudar um nome ou horário, o aviso muda junto.';
    else msg.textContent = 'Toque em Ativar avisos e permita as notificações quando o iPhone perguntar.';
  }

  async function pushEnable() {
    if (pushBusy) return;
    pushBusy = true; pushMsg = ''; pushUI();
    try {
      if (!activeItems().length) { pushMsg = 'Ative pelo menos um item para receber avisos.'; return; }
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') { pushMsg = 'Sem permissão não dá para avisar. Libere em Ajustes do iPhone > Notificações > Minhas vitaminas.'; return; }
      const sub = await ensureSub(true);
      await api('/subscribe', { subscription: sub.toJSON(), items: payloadItems(), tz: tzName() });
      const t = await api('/test', { endpoint: sub.endpoint }).catch(() => null);
      pushMsg = t && t.ok ? 'Pronto! Enviei um aviso de teste agora.' : `Avisos ligados, mas o teste falhou${t ? ` (${t.status}${t.detail ? ': ' + t.detail : ''})` : ''}.`;
    } catch (e) {
      pushMsg = 'Não consegui ligar os avisos. Confira a internet e tente de novo.';
    } finally {
      pushBusy = false; pushUI();
    }
  }

  async function pushDisable() {
    if (pushBusy) return;
    pushBusy = true; pushMsg = ''; pushUI();
    try {
      const sub = await getSub();
      if (sub) {
        await api('/unsubscribe', { endpoint: sub.endpoint }).catch(() => {});
        await sub.unsubscribe();
      }
      pushMsg = 'Avisos desligados.';
    } catch (e) {
      pushMsg = 'Não consegui desligar agora. Tente de novo.';
    } finally {
      pushBusy = false; pushUI();
    }
  }

  async function pushTest() {
    try {
      if (!(await getSub())) return;
      pushMsg = 'Enviando aviso de teste...'; pushUI();
      const sub = await ensureSub(true);
      await api('/subscribe', { subscription: sub.toJSON(), items: payloadItems(), tz: tzName() });
      const r = await api('/test', { endpoint: sub.endpoint });
      pushMsg = r.ok ? 'Aviso de teste enviado.' : `O teste falhou (${r.status}${r.detail ? ': ' + r.detail : ''}).`;
    } catch (e) { pushMsg = 'Não consegui falar com o servidor agora (' + (e && e.message ? e.message : 'erro') + ').'; }
    pushUI();
  }

  /* ---------- Painel do dia ---------- */
  const sheetRoot = document.getElementById('sheet-root');
  const sheetList = document.getElementById('sheet-list');
  let lastFocus = null;

  function openSheet(key) {
    shownDay = key;
    lastFocus = document.activeElement;
    const future = key > todayKey();
    document.getElementById('sheet-title').textContent = fmtLong(parseKey(key));
    sheetList.innerHTML = activeItems().map((i) => rowHTML(i, key, future)).join('');
    syncAllRows(sheetList);
    updateSheetSub();
    sheetRoot.hidden = false;
    requestAnimationFrame(() => requestAnimationFrame(() => sheetRoot.classList.add('open')));
    setTimeout(() => sheetRoot.querySelector('.icon-btn').focus({ preventScroll: true }), 50);
  }

  function updateSheetSub() {
    const { done, total } = stats(shownDay);
    document.getElementById('sheet-sub').textContent = `${done} de ${total} tomados`;
  }

  function closeSheet() {
    if (sheetRoot.hidden) return;
    sheetRoot.classList.remove('open');
    setTimeout(() => { sheetRoot.hidden = true; }, 300);
    if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
  }

  /* ---------- Navegação ---------- */
  function go(next, animate = true) {
    tab = next;
    document.querySelectorAll('.tab').forEach((b) => {
      if (b.dataset.tab === tab) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    });
    renderView();
    window.scrollTo(0, 0);
    if (animate) {
      view.classList.remove('enter');
      void view.offsetWidth;
      view.classList.add('enter');
    }
  }

  function renderView() {
    if (tab === 'hoje') renderToday();
    else if (tab === 'calendario') renderCalendar();
    else renderSettings();
  }

  /* ---------- Eventos ---------- */
  document.querySelector('.tabbar').addEventListener('click', (e) => {
    const b = e.target.closest('.tab');
    if (b && b.dataset.tab !== tab) go(b.dataset.tab);
  });

  view.addEventListener('click', (e) => {
    const goBtn = e.target.closest('[data-go]');
    if (goBtn) return go(goBtn.dataset.go);

    if (e.target.closest('#install-close')) {
      state.hideInstall = true; save();
      const el = document.getElementById('install'); if (el) el.remove();
      return;
    }

    const row = e.target.closest('.row');
    if (row && view.contains(row)) {
      toggle(row.dataset.day, row.dataset.id);
      syncRow(row);
      updateProgress();
      return;
    }

    const day = e.target.closest('.day');
    if (day && !day.disabled) return openSheet(day.dataset.day);

    if (e.target.closest('#prev')) { calMonth = new Date(calMonth.getFullYear(), calMonth.getMonth() - 1, 1); renderCalendar(); return; }
    if (e.target.closest('#next')) { calMonth = new Date(calMonth.getFullYear(), calMonth.getMonth() + 1, 1); renderCalendar(); return; }

    if (e.target.closest('#add-item')) return addItem();
    if (e.target.closest('#push-btn')) {
      getSub().then((sub) => (sub && Notification.permission === 'granted' ? pushDisable() : pushEnable())).catch(pushEnable);
      return;
    }
    if (e.target.closest('#push-test')) return pushTest();

    const del = e.target.closest('[data-del]');
    if (del) {
      if (del.dataset.armed) {
        const id = del.closest('.set-row').dataset.id;
        state.items = state.items.filter((i) => i.id !== id);
        save();
        pushSyncSoon();
        return renderSettings();
      }
      del.dataset.armed = '1';
      del.textContent = 'Toque de novo para remover';
      setTimeout(() => { if (del.isConnected) { delete del.dataset.armed; del.textContent = 'Remover item'; } }, 3000);
      return;
    }

    const sw = e.target.closest('.switch');
    if (sw) {
      const li = sw.closest('.set-row');
      const item = state.items.find((i) => i.id === li.dataset.id);
      item.active = !item.active;
      sw.setAttribute('aria-checked', String(item.active));
      li.classList.toggle('off', !item.active);
      save();
      pushSyncSoon();
    }
  });

  view.addEventListener('input', (e) => {
    const f = e.target.dataset.f;
    if (!f) return;
    const item = state.items.find((i) => i.id === e.target.closest('.set-row').dataset.id);
    if (f === 'name') {
      const v = e.target.value.trim();
      if (v) {
        item.name = v;
        if (item.custom) {
          item.abbr = abbrOf(v);
          const chip = e.target.closest('.set-row').querySelector('.chip');
          if (chip) chip.textContent = item.abbr;
        }
        save();
        pushSyncSoon();
      }
    }
    if (f === 'time' && e.target.value) { item.time = e.target.value; save(); pushSyncSoon(); }
  });

  view.addEventListener('focusout', (e) => {
    if (e.target.dataset.f === 'name' && !e.target.value.trim()) {
      const item = state.items.find((i) => i.id === e.target.closest('.set-row').dataset.id);
      e.target.value = item.name;
    }
  });

  sheetRoot.addEventListener('click', (e) => {
    if (e.target.closest('[data-close]')) return closeSheet();
    const row = e.target.closest('.row');
    if (row && !row.disabled) {
      toggle(row.dataset.day, row.dataset.id);
      syncRow(row);
      updateSheetSub();
      drawDays();
    }
  });

  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSheet(); });

  // Virada do dia e atrasos: confere a cada 30s e ao voltar para o app.
  let lastDay = todayKey();
  function tick() {
    const t = todayKey();
    if (t !== lastDay) {
      lastDay = t;
      if (sheetRoot.hidden) renderView();
    } else if (tab === 'hoje') {
      view.querySelectorAll('.row').forEach(syncRow);
    }
  }
  setInterval(tick, 30000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });

  /* ---------- Início ---------- */
  go('hoje', false);
  if (/^https?:$/.test(location.protocol)) window.addEventListener('load', () => setTimeout(pushSync, 1500));

  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }
})();
