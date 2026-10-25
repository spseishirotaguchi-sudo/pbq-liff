/** 開催年月（JST）×朝夜の参加上限。表示状態と独立して本人の日数を数える。 */
var MONTHLY_VOTING_VERSION = 'practice-month-20261025';

function votingPracticeCatalog_() {
  var out = {};
  practiceStatusRows_().forEach(function(r) {
    var id = String(r[0]).trim();
    if (out[id]) throw new Error('練習IDが重複しています。practicesを確認してください。');
    var date = String(r[1]).trim(), time = String(r[2]).trim(), place = String(r[3]).trim();
    var cancelled = practiceIsCancelled_(r[11]);
    out[id] = {
      visible: String(r[5]).toUpperCase() !== 'FALSE' && !cancelled,
      cancelled: cancelled,
      practice: {
        id: id, date: date, time: time, place: place, label: composeLabel_(date, time, place),
        monthKey: scheduleDay_(r[1], r[10]).slice(0, 7),
        capacity: Number(r[4]) > 0 ? Number(r[4]) : DEFAULT_CAPACITY,
        capTrial: Number(r[6]) > 0 ? Number(r[6]) : DEFAULT_TRIAL_CAP,
        capSemi: Number(r[7]) > 0 ? Number(r[7]) : DEFAULT_SEMI_CAP,
        session: normalizeSession_(r[8]) || sessionOf_(time, place)
      }
    };
  });
  return out;
}

/** 確定・待機は従来どおり1日。友達・体験、取消・開催中止は消費しない。 */
function votingMonthlyEntries_(uid, catalog, entries) {
  var seen = {}, out = [];
  entries.forEach(function(en) {
    var c = catalog[en.pid];
    if (en.uid !== uid || isTrialPool_(en) || en.status === 'cancelled' || !c || c.cancelled || seen[en.pid]) return;
    seen[en.pid] = true;
    out.push({practiceId: en.pid, monthKey: c.practice.monthKey, session: c.practice.session, visible: c.visible});
  });
  return out;
}

function validateMonthlyVoting_(uid, tier, selected, catalog, entries) {
  if (isAdmin_(uid)) return;
  var existing = {}, final = {}, added = {};
  votingMonthlyEntries_(uid, catalog, entries).forEach(function(en) {
    existing[en.practiceId] = true;
    // 非表示の申込は今回の最終状態送信の取消対象外なので引き続き数える。
    if (!catalog[en.practiceId].visible) final[en.practiceId] = catalog[en.practiceId].practice;
  });
  selected.forEach(function(pid) {
    final[pid] = catalog[pid].practice;
    if (!existing[pid]) added[pid] = true;
  });
  // 既存の上限超過者も、変更なしの再送・取消だけなら受け付ける。
  if (!Object.keys(added).length) return;
  var counts = {}, increases = {}, limit = monthlyLimitOf_(tier);
  Object.keys(final).forEach(function(pid) {
    var p = final[pid];
    if (!p.monthKey) throw new Error('練習の開催年月を確認できません。practicesの開催日・開催年を運営にご確認ください。');
    var key = p.monthKey + '|' + p.session;
    counts[key] = (counts[key] || 0) + 1;
    if (added[pid]) increases[key] = true;
  });
  Object.keys(counts).forEach(function(key) {
    if (counts[key] <= limit || !increases[key]) return;
    var parts = key.split('|');
    throw new Error(parts[0] + 'の' + (SESSION_LABEL[parts[1]] || parts[1]) + 'に参加できるのは月に' + limit + '回までです。' +
      counts[key] + '日が選ばれています。減らしてから送信してください。');
  });
}

/** 運営専用の非送信検証。実票・会員区分・日程・通知には書き込まない。 */
function verifyMonthlyVotingReadOnly() {
  assertBroadcastOperator_();
  var catalog = votingPracticeCatalog_(), months = {};
  Object.keys(catalog).forEach(function(id) {
    var c = catalog[id], month = c.practice.monthKey;
    if (!month) throw new Error('開催年月未確定: ' + id);
    months[month] = (months[month] || 0) + 1;
  });
  var sample = {}, uid = '__pbq_monthly_readonly_check__';
  ['2026-10','2026-11','2026-12','2027-01'].forEach(function(month) {
    for (var i = 0; i < 5; i++) {
      var id = month + '-' + i;
      sample[id] = {visible:true,cancelled:false,practice:{id:id,monthKey:month,session:'pm'}};
    }
  });
  function ids(month, count) { var a = []; for (var i = 0; i < count; i++) a.push(month + '-' + i); return a; }
  function accepts(selected, entries) { validateMonthlyVoting_(uid, TIER.MEMBER, selected, sample, entries || []); }
  function rejects(selected, entries) {
    try { accepts(selected, entries); } catch (err) {
      if (String(err).indexOf('月に4回') >= 0) return;
      throw err;
    }
    throw new Error('月上限の拒否検証に失敗しました。');
  }
  accepts(ids('2026-10',1).concat(ids('2026-11',4)));
  rejects(ids('2026-11',5));
  var hidden = ids('2026-11',4).map(function(id) { sample[id].visible=false; return {uid:uid,pid:id,etype:'self',status:'confirmed'}; });
  rejects(['2026-11-4'],hidden);
  accepts(ids('2026-12',4).concat(ids('2027-01',4)));
  var result = {readOnly:true,monthlyVotingVersion:MONTHLY_VOTING_VERSION,practiceCount:Object.keys(catalog).length,monthCounts:months,syntheticChecks:4};
  Logger.log(JSON.stringify(result));
  return result;
}
