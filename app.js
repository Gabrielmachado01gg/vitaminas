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

      <h2 class="sec-title">Lembretes no iPhone</h2>
      <p class="set-sub">Cria um lembrete diário "Tomar ..." no Calendário para cada item ativo, com aviso na tela de bloqueio na hora marcada.</p>
      <button class="btn block" id="export-ics">Criar lembretes no Calendário</button>
      <p class="note" id="ics-msg">Depois de tocar, escolha Calendário (ou Salvar em Arquivos e abra o arquivo) e toque em Adicionar tudo. Mudou um horário? Apague os lembretes "Tomar ..." antigos no Calendário e crie de novo.</p>

      <p class="note">Os horários são só uma sugestão. Siga sempre a orientação do seu médico ou nutricionista. Seus dados ficam guardados neste celular.</p>`;
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
    renderSettings();
    const input = view.querySelector(`.set-row[data-id="${item.id}"] input[data-f="name"]`);
    if (input) { input.scrollIntoView({ block: 'center' }); input.focus(); input.select(); }
  }

  /* ---------- Lembretes no Calendário (.ics) ---------- */
  const icsText = (s) => String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');

  function buildICS() {
    const now = new Date();
    const stamp = `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}T${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}Z`;
    const day = todayKey().replace(/-/g, '');
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Minhas vitaminas//PT-BR//', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
    activeItems().forEach((i) => {
      const [h, m] = i.time.split(':').map(Number);
      const end = new Date(2000, 0, 1, h, m + 10);
      const title = `Tomar ${i.name}`;
      lines.push(
        'BEGIN:VEVENT',
        `UID:${i.id}-${now.getTime()}@minhas-vitaminas`,
        `DTSTAMP:${stamp}`,
        `DTSTART:${day}T${pad(h)}${pad(m)}00`,
        `DTEND:${day}T${pad(end.getHours())}${pad(end.getMinutes())}00`,
        'RRULE:FREQ=DAILY',
        `SUMMARY:${icsText(title)}`,
        'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsText(title)}`, 'TRIGGER:PT0S', 'END:VALARM',
        'END:VEVENT'
      );
    });
    lines.push('END:VCALENDAR');
    return lines.join('\r\n') + '\r\n';
  }

  async function exportICS() {
    const msg = document.getElementById('ics-msg');
    if (!activeItems().length) { if (msg) msg.textContent = 'Ative pelo menos um item para criar lembretes.'; return; }
    const blob = new Blob([buildICS()], { type: 'text/calendar' });
    const file = new File([blob], 'lembretes-vitaminas.ics', { type: 'text/calendar' });
    try {
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: 'Lembretes de vitaminas' });
        return;
      }
    } catch (e) {
      if (e && e.name === 'AbortError') return;
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'lembretes-vitaminas.ics';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
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
    if (e.target.closest('#export-ics')) return exportICS();

    const del = e.target.closest('[data-del]');
    if (del) {
      if (del.dataset.armed) {
        const id = del.closest('.set-row').dataset.id;
        state.items = state.items.filter((i) => i.id !== id);
        save();
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
      }
    }
    if (f === 'time' && e.target.value) { item.time = e.target.value; save(); }
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

  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }
})();
