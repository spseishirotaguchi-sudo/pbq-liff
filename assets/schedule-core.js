(function (root, factory) {
  'use strict';
  const core = factory();
  if (typeof module === 'object' && module.exports) module.exports = core;
  else root.PBQScheduleCore = core;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const pad = n => String(n).padStart(2, '0');
  function monthParts(month) { const m = /^(20\d{2})-(0[1-9]|1[0-2])$/.exec(month); if (!m) throw new Error('月が不正です'); return [+m[1], +m[2]]; }
  function shiftMonth(month, step) { const [y, m] = monthParts(month), d = new Date(Date.UTC(y, m - 1 + step, 1)); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`; }
  function tokyoMonth(now = new Date()) { return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit' }).format(now).slice(0, 7); }
  function nextDay(day) { const d = new Date(day + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10); }
  function coversDay(item, day) { return new Date(item.startAt).getTime() < new Date(nextDay(day) + 'T00:00:00+09:00').getTime() && new Date(item.endAt).getTime() > new Date(day + 'T00:00:00+09:00').getTime(); }
  function monthCells(month, items) {
    const [year, m] = monthParts(month), offset = new Date(Date.UTC(year, m - 1, 1)).getUTCDay(), count = new Date(Date.UTC(year, m, 0)).getUTCDate();
    return Array.from({ length: Math.ceil((offset + count) / 7) * 7 }, (_, index) => { const day = index - offset + 1; if (day < 1 || day > count) return null; const date = `${month}-${pad(day)}`; return { day, date, items: items.filter(item => coversDay(item, date)) }; });
  }
  function escapeHtml(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
  function httpsUrl(s) { try { const url = new URL(String(s)); return url.protocol === 'https:' && !url.username && !url.password ? url.href : ''; } catch (_) { return ''; } }
  function dateLabel(item) { const text = `${+item.date.slice(5, 7)}月${+item.date.slice(8)}日`; return item.date === item.endDate ? text : `${text}〜${+item.endDate.slice(5, 7)}月${+item.endDate.slice(8)}日`; }
  function stamp(iso) { const d = new Date(iso); if (!Number.isFinite(d.getTime())) throw new Error('日時が不正です'); return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z'); }
  function eventDetails(item) { return [item.description, item.address, httpsUrl(item.mapUrl), item.kind === 'event' ? httpsUrl(item.applyUrl) : '', '予定の保存と参加申込は別です。開催情報はp.b.qの活動スケジュールをご確認ください。'].filter(Boolean).join('\n'); }
  function googleUrl(item) {
    if (item.cancelled) return '';
    const params = new URLSearchParams({ action: 'TEMPLATE', text: `p.b.q ${item.title}`, dates: `${stamp(item.startAt)}/${stamp(item.endAt)}`, ctz: 'Asia/Tokyo', location: [item.place, item.address].filter(Boolean).join(' '), details: eventDetails(item) });
    return 'https://calendar.google.com/calendar/render?' + params.toString();
  }
  function icsEscape(value) { return String(value || '').replace(/\\/g, '\\\\').replace(/\r\n|\r|\n/g, '\\n').replace(/;/g, '\\;').replace(/,/g, '\\,'); }
  function foldLine(line) {
    const encoder = new TextEncoder(); let out = '', bytes = 0;
    for (const char of line) { const size = encoder.encode(char).length; if (bytes + size > 75) { out += '\r\n '; bytes = 1; } out += char; bytes += size; }
    return out;
  }
  function ics(item, now = new Date()) {
    if (item.cancelled) throw new Error('開催中止の予定は保存できません');
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//p.b.q//Activity Schedule//JA', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'BEGIN:VEVENT', 'UID:' + icsEscape(item.id) + '@schedule.pbq', 'DTSTAMP:' + stamp(now), 'DTSTART:' + stamp(item.startAt), 'DTEND:' + stamp(item.endAt), 'SUMMARY:' + icsEscape('p.b.q ' + item.title), 'LOCATION:' + icsEscape([item.place, item.address].filter(Boolean).join(' ')), 'DESCRIPTION:' + icsEscape(eventDetails(item)), 'STATUS:CONFIRMED', 'TRANSP:OPAQUE', 'END:VEVENT', 'END:VCALENDAR'];
    return lines.map(foldLine).join('\r\n') + '\r\n';
  }
  return { shiftMonth, tokyoMonth, coversDay, monthCells, escapeHtml, httpsUrl, dateLabel, googleUrl, ics };
});
