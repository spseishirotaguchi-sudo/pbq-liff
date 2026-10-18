/* ログイン不要・活動スケジュール。予約・会員区分・LINE配信は変更しない。 */
var ACTIVITY_SCHEDULE_VERSION = 'schedule-square-20261018';
var ACTIVITY_SCHEDULE_PERFORMANCE = 'schedule-fast-open-20261018';
var ACTIVITY_SCHEDULE_TTL = 600;
var ACTIVITY_EVENT_HEADERS = ['掲載','イベント名','種別','開催日','開始時刻','終了時刻','会場','受付状態','申込URL','募集締切日時','受付開始日時','紹介・詳細','住所','地図URL','終了日（複数日）','イベントID'];

function scheduleError_(code, message) { var e = new Error(message); e.scheduleCode = code; return e; }
function scheduleText_(v) { return String(v == null ? '' : v).trim(); }
function scheduleTrue_(v) { return v === true || scheduleText_(v).toUpperCase() === 'TRUE'; }
function scheduleHttps_(v) { var s=scheduleText_(v); return /^https:\/\/[a-z0-9][^\s<>"\\]*$/i.test(s) ? s : ''; }

function scheduleDay_(value,year) {
  if(Object.prototype.toString.call(value)==='[object Date]' && !isNaN(value.getTime())) return Utilities.formatDate(value,'Asia/Tokyo','yyyy-MM-dd');
  var s=scheduleText_(value).replace(/[０-９]/g,function(c){return String.fromCharCode(c.charCodeAt(0)-65248);}),m;
  m=s.match(/^(\d{4})[\/年.-](\d{1,2})[\/月.-](\d{1,2})/);
  if(!m) { m=s.match(/^(\d{1,2})[\/月.-](\d{1,2})/); if(!m || !/^\d{4}$/.test(scheduleText_(year))) return ''; m=[m[0],Number(year),m[1],m[2]]; }
  var y=Number(m[1]),mo=Number(m[2]),d=Number(m[3]),dt=new Date(Date.UTC(y,mo-1,d));
  if(y<2020 || y>2100 || dt.getUTCFullYear()!==y || dt.getUTCMonth()!==mo-1 || dt.getUTCDate()!==d) return '';
  return y+'-'+('0'+mo).slice(-2)+'-'+('0'+d).slice(-2);
}
function scheduleClock_(v) {
  if(Object.prototype.toString.call(v)==='[object Date]' && !isNaN(v.getTime())) return Utilities.formatDate(v,'Asia/Tokyo','HH:mm');
  if(typeof v==='number' && isFinite(v) && v>=0 && v<1) { var mins=Math.round(v*1440)%1440; return ('0'+Math.floor(mins/60)).slice(-2)+':'+('0'+mins%60).slice(-2); }
  var m=scheduleText_(v).replace(/：/g,':').match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  return m && Number(m[1])<24 && Number(m[2])<60 ? ('0'+Number(m[1])).slice(-2)+':'+m[2] : '';
}
function scheduleNextDay_(day) { var d=new Date(day+'T00:00:00+09:00'); d.setTime(d.getTime()+86400000); return Utilities.formatDate(d,'Asia/Tokyo','yyyy-MM-dd'); }
function scheduleRange_(day,start,end,endDay) {
  start=scheduleClock_(start);end=scheduleClock_(end);
  if(!day || !start || !end) return null;
  var last=endDay || day;
  if(!endDay && end<start) last=scheduleNextDay_(day);
  var from=day+'T'+start+':00+09:00',to=last+'T'+end+':00+09:00';
  if(!(new Date(to).getTime()>new Date(from).getTime())) return null;
  return {date:day,endDate:last,start:start,end:end,startAt:from,endAt:to};
}
function scheduleDeadline_(v) {
  if(v==='' || v==null) return '';
  if(Object.prototype.toString.call(v)==='[object Date]' && !isNaN(v.getTime())) return Utilities.formatDate(v,'Asia/Tokyo',"yyyy-MM-dd'T'HH:mm:ssXXX");
  var s=scheduleText_(v),m=s.match(/^(\d{4}[\/-]\d{1,2}[\/-]\d{1,2})[T ](\d{1,2}:\d{2})(?::\d{2})?(?:\+09:00)?$/);
  if(!m)return null;
  var day=scheduleDay_(m[1]),clock=scheduleClock_(m[2]); return day&&clock?day+'T'+clock+':00+09:00':null;
}
function scheduleInMonth_(range,month) {
  var first=month+'-01',dt=new Date(first+'T00:00:00Z');dt.setUTCMonth(dt.getUTCMonth()+1);
  var next=dt.toISOString().slice(0,10);
  return new Date(range.startAt).getTime()<new Date(next+'T00:00:00+09:00').getTime() && new Date(range.endAt).getTime()>new Date(first+'T00:00:00+09:00').getTime();
}
function scheduleSheet_(name,book) {var sh=(book||ss_()).getSheetByName(name);if(!sh)throw scheduleError_('CONFIGURATION','スケジュールの設定を確認しています。時間をおいてお試しください。');return sh;}

/* イベントの固定IDだけを補完。並べ替え後も同一IDを保持する。 */
function scheduleEventRows_(sh) {
  var last=Math.max(1,sh.getLastRow()), all=sh.getRange(1,1,last,16).getValues(), header=all.shift();
  if(ACTIVITY_EVENT_HEADERS.some(function(h,i){return header[i]!==h;})) throw scheduleError_('CONFIGURATION','イベント表の設定を確認しています。');
  var count=last-1, rows=all;
  if(!rows.some(function(r){return scheduleText_(r[1]) && !scheduleText_(r[15]);}))return rows;
  var lock=LockService.getScriptLock();if(!lock.tryLock(3000))throw scheduleError_('TEMPORARY','更新中です。少し待って、もう一度お試しください。');
  try {
    count=sh.getLastRow()-1;rows=count>0?sh.getRange(2,1,count,16).getValues():[];
    rows.forEach(function(r,i){if(scheduleText_(r[1]) && !scheduleText_(r[15])){r[15]='evt-'+Utilities.getUuid();sh.getRange(i+2,16).setValue(r[15]);}});
  } finally { lock.releaseLock(); }
  return rows;
}

function scheduleBuild_(month,book) {
  book=book||ss_();
  var items=[],issues=[],pSheet=scheduleSheet_(SHEET_PRACTICES,book), eSheet=scheduleSheet_('イベント',book),venues={};
  var pr=pSheet.getRange(1,1,Math.max(1,pSheet.getLastRow()),11).getValues(), ph=pr.shift();
  if(ph[9]!=='スケジュール掲載' || ph[10]!=='開催年') throw scheduleError_('CONFIGURATION','スケジュール掲載の設定を確認しています。');
  var vSheet=book.getSheetByName(SHEET_VENUES), vLast=vSheet?vSheet.getLastRow():0;
  if(vLast>1) vSheet.getRange(2,1,vLast-1,3).getValues().forEach(function(r){venues[scheduleText_(r[0])]={address:scheduleText_(r[1]),mapUrl:scheduleHttps_(r[2])};});
  var seen={};
  pr.forEach(function(r,i){
    if(!scheduleTrue_(r[9]) || !scheduleText_(r[0]))return;
    var date=scheduleDay_(r[1],r[10]),t=scheduleText_(r[2]).replace(/：/g,':').match(/^(\d{1,2}:\d{2})\s*[-–—〜～~]\s*(\d{1,2}:\d{2})$/),range=t&&scheduleRange_(date,t[1],t[2]),place=scheduleText_(r[3]),id='practice-'+scheduleText_(r[0]);
    if(!range || !place || seen[id]){issues.push({sheet:'practices',row:i+2,reason:'invalid_or_duplicate'});return;}seen[id]=true;
    if(month && !scheduleInMonth_(range,month))return;
    var session=normalizeSession_(r[8]) || sessionOf_(r[2],r[3]),venue=venues[place]||{};
    items.push(Object.assign({id:id,kind:'practice',title:SESSION_LABEL[session],shortTitle:SESSION_LABEL[session],place:place,address:venue.address||'',mapUrl:venue.mapUrl||'',description:'',status:'',applyUrl:'',canApply:false,cancelled:false},range));
  });
  scheduleEventRows_(eSheet).forEach(function(r,i){
    if(!scheduleTrue_(r[0]))return;
    var date=scheduleDay_(r[3]),endDay=r[14]?scheduleDay_(r[14]):'',range=scheduleRange_(date,r[4],r[5],endDay),status=scheduleText_(r[7]),title=scheduleText_(r[1]),place=scheduleText_(r[6]),id=scheduleText_(r[15]);
    var closes=scheduleDeadline_(r[9]),opens=scheduleDeadline_(r[10]);
    if(!range || (r[14]&&!endDay) || !title || !place || !id || seen[id] || ['申込受付前','申込受付中','募集締切済','満員','開催中止'].indexOf(status)<0 || closes===null || opens===null || (opens&&closes&&opens>closes)) {issues.push({sheet:'イベント',row:i+2,reason:'invalid_or_duplicate'});return;}seen[id]=true;
    if(month && !scheduleInMonth_(range,month))return;
    var manualStatus=status,now=Date.now(),url=scheduleHttps_(r[8]);
    if(status==='申込受付中') {
      if(new Date(range.endAt).getTime()<now || (closes&&new Date(closes).getTime()<now))status='募集締切済';
      else if(opens&&new Date(opens).getTime()>now)status='申込受付前';
    }
    items.push(Object.assign({id:id,kind:'event',title:title,shortTitle:title.indexOf('親睦')>=0?'親睦会':title.indexOf('懇親')>=0?'懇親会':title,place:place,address:scheduleText_(r[12]),mapUrl:scheduleHttps_(r[13]),description:scheduleText_(r[11]),status:status,manualStatus:manualStatus,applyUrl:url,canApply:status==='申込受付中'&&!!url,cancelled:status==='開催中止',entryOpensAt:opens||'',entryClosesAt:closes||''},range));
  });
  items.sort(function(a,b){return a.startAt.localeCompare(b.startAt)||a.id.localeCompare(b.id);});
  return {items:items,issues:issues};
}
/* 掲載チェックのある予定だけを共有。個人情報・投票情報・会員情報は返さない。 */
function invalidateActivityScheduleCache() {
  var cache=CacheService.getScriptCache();
  cache.put('schedule_data_epoch',Utilities.getUuid(),3600);
  cache.remove('schedule_data_v1');
}
function activityScheduleOnEdit(e) {
  if(e && e.range && [SHEET_PRACTICES,SHEET_VENUES,'イベント'].indexOf(e.range.getSheet().getName())>=0) { invalidateActivityScheduleCache();warmActivityScheduleCache(); }
}
function activityScheduleOnChange(e) {
  if(!e || e.changeType!=='EDIT') { invalidateActivityScheduleCache();warmActivityScheduleCache(); }
}
/* 手動編集の即時失効用。既存のトリガーには触れず、重複も作らない。 */
function installActivityScheduleCacheTriggers() {
  var book=ss_(),id=book.getId(),triggers=ScriptApp.getProjectTriggers();
  [['activityScheduleOnEdit','onEdit'],['activityScheduleOnChange','onChange']].forEach(function(pair){
    if(!triggers.some(function(t){return t.getHandlerFunction()===pair[0] && t.getTriggerSourceId()===id;})) {
      var builder=ScriptApp.newTrigger(pair[0]).forSpreadsheet(id);builder[pair[1]]().create();
    }
  });
  if(!triggers.some(function(t){return t.getHandlerFunction()==='keepWarm';}))ScriptApp.newTrigger('keepWarm').timeBased().everyMinutes(5).create();
  invalidateActivityScheduleCache();
  var data=scheduleDataset_(book);
  console.log(JSON.stringify({event:'schedule_cache_ready',version:ACTIVITY_SCHEDULE_PERFORMANCE,count:data.items.length,issues:data.issues.length}));
}
function scheduleLiveItem_(item,now) {
  if(item.kind!=='event')return item;
  var copy=Object.assign({},item),status=copy.manualStatus||copy.status;
  if(status==='申込受付中') {
    if(Date.parse(copy.endAt)<=now || (copy.entryClosesAt && Date.parse(copy.entryClosesAt)<now))status='募集締切済';
    else if(copy.entryOpensAt && Date.parse(copy.entryOpensAt)>now)status='申込受付前';
  }
  copy.status=status;copy.canApply=status==='申込受付中'&&!!copy.applyUrl;return copy;
}
function warmActivityScheduleCache() {
  try { scheduleDataset_(null,true); }
  catch(err) { console.warn(JSON.stringify({event:'schedule_warm_failed',code:err.scheduleCode||'TEMPORARY'})); }
}
function scheduleDataset_(book,warm) {
  var cache=CacheService.getScriptCache(),epoch=cache.get('schedule_data_epoch')||'0',data=null,now=Date.now();
  try { data=JSON.parse(cache.get('schedule_data_v1')||'null'); } catch(ignored) {}
  if(data && data.version===ACTIVITY_SCHEDULE_PERFORMANCE && data.epoch===epoch && now>=data.builtAt && now-data.builtAt<ACTIVITY_SCHEDULE_TTL*1000 && (!warm || now-data.builtAt<240000) && Array.isArray(data.items)) {
    data.cacheHit=true;return data;
  }
  data=scheduleBuild_('',book);data.builtAt=Date.now();data.epoch=epoch;data.version=ACTIVITY_SCHEDULE_PERFORMANCE;
  var encoded=JSON.stringify(data);
  // CacheServiceの100KB制限を超える大きな予定表も、キャッシュなしで表示する。
  if(encoded.length*3<90000 && (cache.get('schedule_data_epoch')||'0')===epoch) {
    try { cache.put('schedule_data_v1',encoded,ACTIVITY_SCHEDULE_TTL); } catch(ignored) {}
  }
  data.cacheHit=false;return data;
}
function scheduleShiftMonth_(month,step) {
  var d=new Date(month+'-01T00:00:00Z');d.setUTCMonth(d.getUTCMonth()+step);return d.toISOString().slice(0,7);
}
function activityScheduleResponse_(body) {
  try {
    var started=Date.now(),month=scheduleText_(body.month);
    if(!/^20\d{2}-(0[1-9]|1[0-2])$/.test(month))throw scheduleError_('INVALID_MONTH','表示する月を確認してください。');
    var data=scheduleDataset_(),now=Date.now(),items=data.items.map(function(item){return scheduleLiveItem_(item,now);}),months={};
    var current=items.filter(function(item){return scheduleInMonth_(item,month);});
    if(body.prefetch===true)for(var step=-2;step<=2;step++) {
      var m=scheduleShiftMonth_(month,step);
      if(/^20\d{2}-/.test(m))months[m]=items.filter(function(item){return scheduleInMonth_(item,m);});
    }
    return {ok:true,version:ACTIVITY_SCHEDULE_VERSION,performanceVersion:ACTIVITY_SCHEDULE_PERFORMANCE,month:month,timeZone:'Asia/Tokyo',updatedAt:new Date(data.builtAt).toISOString(),expiresAt:data.builtAt+ACTIVITY_SCHEDULE_TTL*1000,items:current,months:months,warningCount:data.issues.length,timing:{totalMs:Date.now()-started,cacheHit:data.cacheHit}};
  } catch(err) {
    var code=err.scheduleCode||'TEMPORARY';
    console.warn(JSON.stringify({event:'activity_schedule_failed',code:code,version:ACTIVITY_SCHEDULE_VERSION}));
    return {ok:false,version:ACTIVITY_SCHEDULE_VERSION,code:code,relogin:code==='LOGIN_REQUIRED',error:err.scheduleCode?err.message:'スケジュールを読み込めませんでした。もう一度お試しください。'};
  }
}
/* 運営者が実行する読取診断。メッセージ送信や会員変更を行わない。 */
function previewActivitySchedule() {
  var months=['2026-10','2026-11'],summary=months.map(function(month){var d=scheduleBuild_(month);return {month:month,count:d.items.length,practices:d.items.filter(function(e){return e.kind==='practice';}).length,events:d.items.filter(function(e){return e.kind==='event';}).length,issues:d.issues};});
  console.log(JSON.stringify({version:ACTIVITY_SCHEDULE_VERSION,months:summary}));return summary;
}
