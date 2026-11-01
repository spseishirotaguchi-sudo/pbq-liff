const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../assets/schedule-core.js');

function practice(id, title, start, end = '22:00') {
  return { id, kind: 'practice', title, start, end, date: '2026-11-05', endDate: '2026-11-05',
    startAt: `2026-11-05T${start}:00+09:00`, endAt: `2026-11-05T${end}:00+09:00`, place: '博多体育館' };
}

test('朝夜は時間で推測せず、元の部名で分け、同日も両方残す', () => {
  const morning = practice('m', '朝の部', '09:00', '12:00');
  const night = practice('n', '夜の部', '20:00');
  const groups = core.calendarGroups([morning, night]);
  assert.deepEqual(groups.map(g => g.title), ['朝の部', '夜の部']);
  assert.deepEqual(groups[0].items, [morning]);
  assert.deepEqual(groups[1].items, [night]);
  assert.equal(core.monthCells('2026-11', groups[0].items).find(x => x?.day === 5).items.length, 1);
  assert.equal(core.monthCells('2026-11', groups[1].items).find(x => x?.day === 5).items.length, 1);
});

test('イベント・中止表示・未知の部も削除せず、元のオブジェクトを保持する', () => {
  const other = practice('other', '特別練習', '13:00');
  const event = { ...practice('event', '親睦会', '19:30'), kind: 'event', cancelled: true };
  const groups = core.calendarGroups([other, event]);
  assert.deepEqual(groups.map(g => g.title), ['朝の部', '夜の部', 'その他の練習', 'イベント']);
  assert.equal(groups[2].items[0], other);
  assert.equal(groups[3].items[0], event);
  assert.deepEqual(core.calendarGroups([]).map(g => g.items.length), [0, 0]);
});

test('時間帯は開始と終了を両方表示し、00分だけ省略する', () => {
  assert.equal(core.calendarTime({ start: '09:00', end: '12:00' }), '9-12時');
  assert.equal(core.calendarTime({ start: '20:00', end: '22:00' }), '20-22時');
  assert.equal(core.calendarTime({ start: '09:30', end: '12:15' }), '9:30-12:15時');
});

test('4週・5週・6週、うるう年と年越しでも7列の均等な月表を作る', () => {
  for (const [month, count] of [['2026-02', 28], ['2026-11', 35], ['2026-08', 42], ['2028-02', 35]]) {
    const cells = core.monthCells(month, []);
    assert.equal(cells.length, count);
    assert.equal(cells.length % 7, 0);
    assert.equal(cells.filter(Boolean).at(-1).day, month === '2028-02' ? 29 : month === '2026-02' ? 28 : month === '2026-11' ? 30 : 31);
  }
  assert.equal(core.shiftMonth('2026-12', 1), '2027-01');
});
