(function () {
  'use strict';
  const core = window.PBQScheduleCore, root = document.getElementById('schedule');
  if (!core || !root) return;
  const byId = id => document.getElementById(id), esc = core.escapeHtml;
  const state = { month: core.tokyoMonth(), items: [], expanded: new Set(), selectedDate: '', request: 0, loading: false, lastLoaded: 0 };
  const monthCache = core.createMonthCache();
  const days = ['日', '月', '火', '水', '木', '金', '土'];
  const version = 'schedule-square-20261018';
  const snapshot = core.createSnapshotStore(() => window.localStorage, 'schedule-fast-open-20261018');
  function setNotice(text, error) { byId('notice').textContent = text; byId('notice').classList.toggle('error', !!error); }
  function clearData() { state.items = []; state.expanded.clear(); state.selectedDate = ''; byId('month-grid').replaceChildren(); byId('event-list').replaceChildren(); byId('calendar-section').hidden = true; }
  function recovery(kind) { byId('recovery').innerHTML = kind === 'retry' ? '<button type="button" data-retry>もう一度読み込む</button>' : ''; }
  async function init() {
    ++state.request; monthCache.clear(); clearData(); recovery('');
    const saved = snapshot.read();
    if (saved) {
      monthCache.put(saved); const cached = monthCache.get(state.month);
      if (cached) { root.dataset.loadSource = 'saved'; showMonth(cached); setBusy(false); state.lastLoaded = Date.now(); await loadMonth(true, true); return; }
    }
    await loadMonth();
  }
  function setBusy(busy) { state.loading = busy; byId('prev').disabled = busy || state.month <= '2020-01'; byId('next').disabled = busy || state.month >= '2099-12'; }
  function showMonth(data) {
    state.items = data.items.map(item => core.liveItem(item)); render(); setNotice('');
    byId('warning').hidden = !data.warningCount;
    byId('warning').textContent = data.warningCount ? '一部の予定を表示できませんでした。お手数ですが運営にお知らせください。' : '';
    byId('updated').textContent = '更新確認 ' + new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit' }).format(new Date(data.updatedAt));
    byId('calendar-section').hidden = false;
  }
  async function loadMonth(force = false, background = false) {
    const request = ++state.request, cached = !force && monthCache.get(state.month);
    if (cached) {
      clearData(); recovery(''); root.dataset.loadSource = 'memory'; showMonth(cached); setBusy(false); return;
    }
    if (!background) { clearData(); setBusy(true); recovery(''); setNotice('スケジュールを読み込んでいます…'); }
    else byId('updated').textContent += ' ・最新情報を確認中';
    const started = performance.now();
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), 25000) : null;
    try {
      const url = new URL(root.dataset.api); url.searchParams.set('action', 'schedule'); url.searchParams.set('month', state.month); url.searchParams.set('prefetch', '1');
      const response = await fetch(url.href, { credentials: 'omit', redirect: 'follow', ...(controller ? { signal: controller.signal } : {}) });
      if (!response.ok) throw new Error('接続が混み合っています。もう一度お試しください。');
      const data = await response.json();
      if (request !== state.request) return;
      if (!data.ok) throw new Error('読み込めませんでした。もう一度お試しください。');
      if (data.version !== version || data.month !== state.month || !Array.isArray(data.items)) throw new Error('表示の更新を確認しています。ページを開き直してお試しください。');
      root.dataset.loadSource = 'network'; root.dataset.requestMs = String(Math.round(performance.now() - started));
      if (data.timing) { root.dataset.serverMs = String(data.timing.totalMs); root.dataset.sourceCacheHit = String(data.timing.cacheHit); }
      snapshot.write(data); monthCache.put(data); state.lastLoaded = Date.now(); showMonth(data);
    } catch (err) {
      if (request !== state.request) return;
      if (background) { byId('updated').textContent = '最新情報を確認できませんでした。少し待って開き直してください。'; return; }
      monthCache.clear(); clearData(); setNotice(err.name === 'AbortError' ? '読み込みに時間がかかっています。もう一度お試しください。' : 'スケジュールを読み込めませんでした。通信環境を確認してお試しください。', true); recovery('retry');
    } finally { if (timer) clearTimeout(timer); if (request === state.request) setBusy(false); }
  }
  function entryOpen(source) { const item = core.liveItem(source); return item.canApply && item.status === '申込受付中' && !item.cancelled && (!item.entryOpensAt || Date.parse(item.entryOpensAt) <= Date.now()) && (!item.entryClosesAt || Date.parse(item.entryClosesAt) >= Date.now()) && Date.parse(item.endAt) > Date.now(); }
  function render() {
    state.items = state.items.map(item => core.liveItem(item));
    const [year, month] = state.month.split('-').map(Number);
    byId('month-label').textContent = `${year}年${month}月`;
    byId('month-grid').setAttribute('aria-label', `${year}年${month}月の予定`);
    const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(new Date());
    byId('month-grid').innerHTML = core.monthCells(state.month, state.items).map(cell => {
      if (!cell) return '<div class="day empty" aria-hidden="true"></div>';
      const tag = cell.items.length ? 'button' : 'div', count = cell.items.length;
      const content = count > 2 ? '<span class="cell-event"><span class="cell-title">予定' + count + '件</span></span>' : cell.items.map(item => `<span class="cell-event ${item.kind === 'event' ? 'event' : ''}${item.cancelled ? ' cancelled' : ''}"><span class="cell-title">${esc(item.shortTitle || item.title)}</span><span class="cell-time">${esc(item.start)}</span><span class="cell-place">${esc(item.place)}</span></span>`).join('');
      const label = `${month}月${cell.day}日 ${cell.items.map(item => item.title + ' ' + item.start + '〜' + item.end + ' ' + item.place).join('、')}`;
      return `<${tag} ${count ? `type="button" data-day="${cell.date}" aria-label="${esc(label)}" aria-expanded="${state.selectedDate === cell.date}" aria-controls="event-list"` : ''} class="day${cell.date === today ? ' today' : ''}${cell.date === state.selectedDate ? ' selected' : ''}" data-date="${cell.date}" data-count="${count}" data-many="${count > 2}"><span class="day-number">${cell.day}</span><span class="day-events">${content}</span></${tag}>`;
    }).join('');
    byId('event-list').innerHTML = state.items.length ? state.items.map((item, index) => {
      const open = state.expanded.has(item.id), weekday = days[new Date(item.date + 'T00:00:00Z').getUTCDay()];
      const day = item.date.startsWith(state.month) ? Number(item.date.slice(8)) : `${Number(item.date.slice(5, 7))}/${Number(item.date.slice(8))}`;
      const apply = item.kind !== 'event' ? '' : entryOpen(item) && core.httpsUrl(item.applyUrl) ? `<a class="action primary" href="${esc(core.httpsUrl(item.applyUrl))}" target="_blank" rel="noopener noreferrer" data-apply="${index}">申込フォームを開く</a>` : `<p class="unavailable">${esc(item.status === '申込受付中' && !core.httpsUrl(item.applyUrl) ? '申込先を準備中です。' : item.status)}</p>`;
      const map = core.httpsUrl(item.mapUrl) ? `<a class="action" href="${esc(core.httpsUrl(item.mapUrl))}" target="_blank" rel="noopener noreferrer">地図を開く</a>` : '';
      const saves = item.cancelled ? '' : `<details class="save-options"><summary>自分のカレンダーに保存</summary><div class="event-actions"><a class="action" href="${esc(core.googleUrl(item))}" target="_blank" rel="noopener noreferrer">Googleカレンダー</a><button class="action" type="button" data-save="${index}">iPhone・その他（.ics）</button></div><p class="save-note">この予定1件だけを保存します。開催日時の変更は自動反映されません。<br>保存しても、参加申込は完了しません。</p><p class="save-note">LINE内で保存できない場合は、画面のメニューからSafariなどで開いて保存してください。</p><p class="save-error" id="save-error-${index}" role="status"></p></details>`;
      return `<article class="event-row" id="event-${index}"><button class="event-summary" type="button" data-open="${index}" aria-expanded="${open}" aria-controls="detail-${index}"><span class="event-day">${day}<small>${weekday}</small></span><span><span class="event-title">${esc(item.title)}</span><span class="event-meta">${esc(item.start)}–${esc(item.end)}${item.date !== item.endDate ? '（' + esc(core.dateLabel(item)) + '）' : ''}</span><span class="event-meta">${esc(item.place)}</span>${item.kind === 'event' ? `<span class="event-status">${esc(item.status)}</span>` : ''}</span><span class="event-toggle">${open ? '閉じる' : '詳細 ›'}</span></button><div class="event-details" id="detail-${index}" ${open ? '' : 'hidden'}><p class="event-description">${esc(core.dateLabel(item))} ${esc(item.start)}–${esc(item.end)}${item.description ? '\n\n' + esc(item.description) : ''}</p>${item.address ? `<p class="event-address">${esc(item.address)}</p>` : ''}${item.entryClosesAt ? `<p class="save-note">募集締切：${esc(new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(item.entryClosesAt)))}</p>` : ''}<div class="event-actions">${apply}${map}</div>${saves}</div></article>`;
    }).join('') : '<p class="empty-month">この月の予定は、まだ掲載されていません。</p>';
  }
  root.addEventListener('click', event => {
    if (event.target.closest('[data-retry]')) { init(); return; }
    const nav = event.target.closest('#prev, #next');
    if (nav && !state.loading) { state.month = core.shiftMonth(state.month, nav.id === 'prev' ? -1 : 1); loadMonth(); return; }
    const day = event.target.closest('[data-day]');
    if (day) {
      const date = day.dataset.day, close = date === state.selectedDate;
      state.selectedDate = close ? '' : date; state.expanded.clear();
      if (!close) state.items.filter(item => core.coversDay(item, date)).forEach(item => state.expanded.add(item.id));
      render();
      if (!close) { const first = state.items.findIndex(item => core.coversDay(item, date)); byId('event-' + first)?.scrollIntoView({ block: 'nearest', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' }); }
      return;
    }
    const toggle = event.target.closest('[data-open]');
    if (toggle) { const item = state.items[+toggle.dataset.open]; if (!item) return; state.expanded.has(item.id) ? state.expanded.delete(item.id) : state.expanded.add(item.id); render(); return; }
    const apply = event.target.closest('[data-apply]');
    if (apply && !entryOpen(state.items[+apply.dataset.apply])) { event.preventDefault(); loadMonth(true); return; }
    const save = event.target.closest('[data-save]');
    if (save) {
      const item = state.items[+save.dataset.save];
      try { const url = URL.createObjectURL(new Blob([core.ics(item)], { type: 'text/calendar;charset=utf-8' })), link = document.createElement('a'); link.href = url; link.download = 'pbq-' + item.date + '.ics'; document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 300000); }
      catch (_) { byId('save-error-' + save.dataset.save).textContent = '保存できませんでした。Safariなどで開き直してお試しください。'; }
      return;
    }
  });
  document.addEventListener('visibilitychange', () => { if (!document.hidden && !state.loading && Date.now() - state.lastLoaded > 300000) { monthCache.clear(); loadMonth(true); } });
  init();
})();
