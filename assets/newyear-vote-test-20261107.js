(function () {
  'use strict';
  const byId = id => document.getElementById(id);
  const form = byId('vote'), confirmation = byId('confirmation'), none = byId('none');
  const inputs = [...form.querySelectorAll('input[name="day"]')];
  const key = 'pbq.newyear-202701.preview-20261107';
  const labels = new Map(inputs.map(input => [input.value, input.getAttribute('aria-label') || 'どの日も参加できない']));
  const sanitize = values => {
    if (!Array.isArray(values)) return [];
    const unique = [...new Set(values)].filter(v => labels.has(v));
    return unique.includes('none') ? ['none'] : inputs.map(i => i.value).filter(v => unique.includes(v));
  };
  const chosen = () => sanitize(inputs.filter(i => i.checked).map(i => i.value));

  function update() {
    const values = chosen();
    byId('selection').textContent = values[0] === 'none' ? labels.get('none') : `${values.length}日選択中`;
    byId('submit').disabled = values.length === 0;
  }

  function completed(values, focus) {
    const list = byId('selected-days');
    list.replaceChildren(...values.map(value => {
      const li = document.createElement('li');
      li.textContent = labels.get(value);
      return li;
    }));
    form.hidden = true;
    confirmation.hidden = false;
    if (focus) byId('complete-heading').focus();
  }

  form.addEventListener('change', event => {
    if (!inputs.includes(event.target)) return;
    if (event.target === none && none.checked) inputs.forEach(i => { if (i !== none) i.checked = false; });
    else if (event.target !== none && event.target.checked) none.checked = false;
    update();
  });
  form.addEventListener('submit', event => {
    event.preventDefault();
    const values = chosen();
    if (!values.length) return;
    try { localStorage.setItem(key, JSON.stringify(values)); } catch (_) { /* WebView may deny storage. */ }
    completed(values, true);
  });
  byId('change').addEventListener('click', () => {
    confirmation.hidden = true;
    form.hidden = false;
    update();
    (inputs.find(i => i.checked) || inputs[0]).focus();
  });
  byId('reset').addEventListener('click', () => {
    try { localStorage.removeItem(key); } catch (_) { /* Nothing to clear. */ }
    inputs.forEach(i => { i.checked = false; });
    confirmation.hidden = true;
    form.hidden = false;
    update();
    inputs[0].focus();
  });

  let saved = [];
  try { saved = sanitize(JSON.parse(localStorage.getItem(key) || '[]')); } catch (_) { /* Start empty. */ }
  inputs.forEach(input => { input.checked = saved.includes(input.value); });
  update();
  if (saved.length) completed(saved, false);
})();
