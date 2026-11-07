(function () {
  'use strict';
  const byId = id => document.getElementById(id);
  const form = byId('vote'), confirmation = byId('confirmation'), none = byId('none'), status = byId('status');
  const submit = byId('submit'), retry = byId('retry'), change = byId('change');
  const inputs = [...form.querySelectorAll('input[name="day"]')];
  const labels = new Map(inputs.map(input => [input.value, input.getAttribute('aria-label') || 'どの日も参加できない']));
  const api = 'https://script.google.com/macros/s/AKfycbwFleZTrYMBT1ih-WcEpUvVc59dq8e2Bz5M1iLdVBoBB84FP_P--JQm55u2wytCww5-Kg/exec';
  let busy = false, closed = false, initialized = false;
  const chosen = () => inputs.filter(i => i.checked).map(i => i.value);
  async function request(action, extra = {}) {
    const ctrl = new AbortController(), timer = setTimeout(() => ctrl.abort(), 25000);
    try {
      const response = await fetch(api, {method:'POST', headers:{'Content-Type':'text/plain;charset=UTF-8'},
        body:JSON.stringify({action,idToken:liff.getIDToken(),...extra}), signal:ctrl.signal});
      if (!response.ok) throw new Error('通信に失敗しました。もう一度お試しください。');
      const data = await response.json();
      if (!data.ok) throw new Error(data.error || '読み込めませんでした。');
      return data;
    } finally { clearTimeout(timer); }
  }
  function update() {
    const values = chosen();
    byId('selection').textContent = values[0] === 'none' ? labels.get('none') : values.length+'日選択中';
    submit.disabled = busy || closed || !values.length;
    inputs.forEach(i => { i.disabled = busy || closed; });
  }
  function apply(data, focus) {
    closed = data.closed;
    const values = Array.isArray(data.selected) ? data.selected.filter(v => labels.has(v)) : [];
    inputs.forEach(i => { i.checked = values.includes(i.value); });
    byId('selected-days').replaceChildren(...values.map(v => {
      const li = document.createElement('li');
      li.textContent = labels.get(v);
      return li;
    }));
    form.hidden = !!values.length || closed;
    confirmation.hidden = !values.length;
    change.hidden = closed;
    status.textContent = closed ? '回答受付は終了しました。' : '';
    retry.hidden = true;
    update();
    if (focus && values.length) byId('complete-heading').focus();
  }
  async function load() {
    if (busy) return;
    busy = true; retry.hidden = true;
    status.textContent = '投票を読み込んでいます…';
    try {
      if (!initialized) { await liff.init({liffId:'2011314745-16BXRKX0'}); initialized = true; }
      if (!liff.isLoggedIn()) { liff.login({redirectUri:location.origin+location.pathname}); return; }
      apply(await request('newyear_final_read'),false);
    } catch (e) {
      status.textContent = e.name==='AbortError' ? '読み込みに時間がかかっています。' : (e.message || '読み込めませんでした。');
      retry.hidden = false;
    } finally { busy = false; update(); }
  }
  form.addEventListener('change', event => {
    if (!inputs.includes(event.target)) return;
    if (event.target===none && none.checked) inputs.forEach(i => { if(i!==none)i.checked=false; });
    else if (event.target!==none && event.target.checked) none.checked=false;
    update();
  });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const selected = chosen();
    if (busy || closed || !selected.length) return;
    busy = true; update(); status.textContent = '回答を保存しています…';
    try { apply(await request('newyear_final_save',{selected}),true); }
    catch (e) { status.textContent = e.name==='AbortError' ? '応答に時間がかかっています。再度送信しても回答は重複しません。' : e.message; }
    finally { busy = false; update(); }
  });
  change.addEventListener('click', () => { confirmation.hidden=true; form.hidden=false; (inputs.find(i=>i.checked)||inputs[0]).focus(); });
  retry.addEventListener('click', load);
  load();
})();
