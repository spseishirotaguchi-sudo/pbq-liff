/** 過去日の投票表示を毎日0時台に閉じる。日付の判定は日本時間。 */
function installPastPracticeVisibility() {
  var handler = 'hidePastPractices';
  var triggers = ScriptApp.getProjectTriggers().filter(function(trigger) {
    return trigger.getHandlerFunction() === handler;
  });
  ScriptApp.newTrigger(handler).timeBased().atHour(0).everyDays(1).inTimezone('Asia/Tokyo').create();
  triggers.forEach(function(trigger) { ScriptApp.deleteTrigger(trigger); });
  var result = hidePastPractices();
  console.log(JSON.stringify({event:'past_practice_visibility_installed',intervalDays:1,hour:0,timeZone:'Asia/Tokyo',result:result}));
  return result;
}

function hidePastPractices() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) throw new Error('他の更新処理が続いているため、過去日の表示切替を完了できませんでした。');
  try {
    var sheet = ss_().getSheetByName(SHEET_PRACTICES);
    if (!sheet) throw new Error('practicesタブが見つかりません。');
    var rows = sheet.getRange(1,1,Math.max(1,sheet.getLastRow()),11).getValues();
    var header = rows.shift();
    if (header[0] !== 'practice_id' || header[1] !== 'date' ||
        ['表示（T/F）','visible'].indexOf(header[5]) < 0 || header[10] !== '開催年') {
      throw new Error('practicesの列構成を確認してください。');
    }
    var today = Utilities.formatDate(new Date(),'Asia/Tokyo','yyyy-MM-dd');
    var targets = [], invalid = [];
    rows.forEach(function(row,index) {
      var id = String(row[0] || '').trim();
      if (!id || !scheduleTrue_(row[5])) return;
      var day = scheduleDay_(row[1],row[10]);
      if (!day) { invalid.push(id); return; }
      if (day < today) targets.push({cell:'F'+(index+2),index:index,id:id});
    });
    if (targets.length) {
      sheet.getRangeList(targets.map(function(target) { return target.cell; })).setValue(false);
      SpreadsheetApp.flush();
      CacheService.getScriptCache().removeAll(['practices_json','roster_json']);
      var visibility = sheet.getRange(2,6,rows.length,1).getValues();
      if (targets.some(function(target) { return visibility[target.index][0] !== false; })) {
        throw new Error('過去日の表示切替を確認できませんでした。');
      }
    }
    var result = {status:'ok',today:today,hiddenCount:targets.length,
      practiceIds:targets.map(function(target) { return target.id; }),invalidDateIds:invalid};
    console.log(JSON.stringify({event:'past_practice_visibility',result:result}));
    return result;
  } finally {
    lock.releaseLock();
  }
}
