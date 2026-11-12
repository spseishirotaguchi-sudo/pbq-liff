const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const schedule = fs.readFileSync(__dirname + '/../gas/ActivitySchedule.gs', 'utf8');
const source = fs.readFileSync(__dirname + '/../gas/PracticeVisibility.gs', 'utf8');
const header = ['practice_id','date','time','place','capacity','表示（T/F）',
  'cap_trial','cap_semi','session','スケジュール掲載','開催年'];
function row(id, day, visible, year) {
  return [id,day,'20:00-22:00','検証体育館',22,visible,2,2,'夜の部',true,year];
}

function harness(input, today = '2026-11-12') {
  const rows = [header.slice(), ...input.map(value => value.slice())];
  const writes = [], cleared = [], triggers = [];
  let locked = false, available = true;
  const sheet = {
    getLastRow: () => rows.length,
    getRange: (r,c,h,w) => ({getValues: () =>
      rows.slice(r-1,r-1+h).map(row => Array.from({length:w},(_,i) => row[c-1+i] ?? ''))}),
    getRangeList: cells => ({setValue: value => {
      cells.forEach(cell => {
        const index = Number(cell.slice(1)) - 1;
        writes.push(cell);
        rows[index][5] = value;
      });
    }}),
  };
  const context = vm.createContext({
    console:{log(){}}, Date,
    SHEET_PRACTICES:'practices',
    ss_:() => ({getSheetByName:name => name === 'practices' ? sheet : null}),
    Utilities:{formatDate:() => today},
    LockService:{getScriptLock:() => ({
      tryLock:() => { locked = available; return available; },
      releaseLock:() => { locked = false; },
    })},
    SpreadsheetApp:{flush(){}},
    CacheService:{getScriptCache:() => ({removeAll:keys => cleared.push(...keys)})},
    ScriptApp:{
      getProjectTriggers:() => triggers,
      newTrigger:handler => {
        const builder = {
          timeBased:() => builder,
          everyMinutes:minutes => { assert.equal(minutes,5); return builder; },
          create:() => triggers.push({getHandlerFunction:() => handler}),
        };
        return builder;
      },
    },
  });
  vm.runInContext(schedule,context);
  vm.runInContext(source,context);
  return {context,rows,writes,cleared,triggers,isLocked:() => locked,
    unavailable:() => { available = false; }};
}

test('過去日のTRUEだけを閉じ、当日・将来・既存FALSEと他列を保持する', () => {
  const input = [
    row('1110pm','11/10(火)',true,2026),
    row('1111pm','11/11(水)','TRUE',2026),
    row('1112pm','11/12(木)',true,2026),
    row('1119pm','11/19(木)',true,2026),
    row('1111am','11/11(水)',false,2026),
    row('0108am','1/8(金)',true,2027),
  ];
  const h = harness(input), result = h.context.hidePastPractices();
  assert.equal(result.hiddenCount,2);
  assert.deepEqual(h.writes,['F2','F3']);
  for (let i=0;i<input.length;i++) {
    assert.deepEqual(h.rows[i+1].filter((_,c) => c!==5),input[i].filter((_,c) => c!==5));
  }
  assert.equal(h.rows[3][5],true);
  assert.equal(h.rows[6][5],true);
  assert.equal(h.context.hidePastPractices().hiddenCount,0);
  assert.equal(h.writes.length,2);
  assert.ok(h.cleared.includes('roster_json'));
  assert.equal(h.isLocked(),false);
});

test('日本時間で日付が変わったら前日を閉じ、年越しも開催年で判定する', () => {
  const h = harness([row('1231pm','12/31(木)',true,2026),row('0101pm','1/1(金)',true,2027)],'2027-01-01');
  assert.equal(h.context.hidePastPractices().hiddenCount,1);
  assert.deepEqual(h.writes,['F2']);
  assert.equal(h.rows[2][5],true);
});

test('不正な開催日は報告し、同時実行中は次回へ回す', () => {
  const h = harness([row('bad','2/30',true,2026)]);
  assert.equal(h.context.hidePastPractices().invalidDateIds[0],'bad');
  assert.deepEqual(h.writes,[]);
  h.unavailable();
  assert.equal(h.context.hidePastPractices().status,'busy');
  assert.equal(h.isLocked(),false);
});

test('同じ設定処理を繰り返しても定期処理を重複登録しない', () => {
  const h = harness([]);
  h.triggers.push({getHandlerFunction:() => 'existing'});
  h.context.installPastPracticeVisibility();
  h.context.installPastPracticeVisibility();
  assert.deepEqual(h.triggers.map(trigger => trigger.getHandlerFunction()),['existing','hidePastPractices']);
});
