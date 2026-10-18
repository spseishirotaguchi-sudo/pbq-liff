const {test}=require('node:test'), assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto');
const core=require('../assets/schedule-core.js');
const source=fs.readFileSync(__dirname+'/../gas/ActivitySchedule.gs','utf8');
const e={id:'one',kind:'event',title:'親睦会,テスト;改行\nあり',date:'2026-11-15',endDate:'2026-11-15',start:'19:30',end:'21:30',startAt:'2026-11-15T19:30:00+09:00',endAt:'2026-11-15T21:30:00+09:00',place:'福岡',address:'大名',description:'日本語'.repeat(90),applyUrl:'https://example.com/form'};
function harness(){
 const cache=new Map(),p=[['Ugood','','','','',false,'semi']],props={LINE_LOGIN_CHANNEL_ID:'123',REQUIRE_LOGIN:'false'};
 const rows={practices:[['practice_id','date','time','place','capacity','表示（T/F）','cap_trial','cap_semi','session','スケジュール掲載','開催年'],['1105am','11/5(木)','9:00-12:00','検証体育館',22,false,2,3,'朝の部',true,2026],['1105pm','11/5(木)','20:00-22:00','検証体育館',22,false,2,3,'夜の部',true,2026]],イベント:[['掲載','イベント名','種別','開催日','開始時刻','終了時刻','会場','受付状態','申込URL','募集締切日時','受付開始日時','紹介・詳細','住所','地図URL','終了日（複数日）','イベントID']],people:[['uid'],...p],venues:[['venue_name','address','map_url'],['検証体育館','検証住所','https://example.com/map']]};
 const reads={};
 const sheets={};for(const [name,data] of Object.entries(rows))sheets[name]={getLastRow:()=>data.length,getRange:(r,c,h=1,w=1)=>({getValues:()=>{reads[name]=(reads[name]||0)+1;return data.slice(r-1,r-1+h).map(row=>Array.from({length:w},(_,i)=>row[c-1+i]??''));},getDisplayValues:()=>data.slice(r-1,r-1+h).map(row=>Array.from({length:w},(_,i)=>String(row[c-1+i]??''))),setValue:v=>{data[r-1][c-1]=v;}})};
 let response={iss:'https://access.line.me',sub:'Ugood',aud:'123',exp:Math.floor(Date.now()/1000)+1000},http=200,calls=0;
 const ctx=vm.createContext({console:{warn(){},log(){}},Date,Math,JSON,Object,String,Number,isFinite,Session:{getScriptTimeZone:()=> 'Asia/Tokyo'},props_:()=>({getProperty:k=>props[k]}),ss_:()=>({getSheetByName:n=>sheets[n]}),SHEET_PEOPLE:'people',SHEET_PRACTICES:'practices',SHEET_VENUES:'venues',SESSION_LABEL:{am:'朝の部',pm:'夜の部'},normalizeSession_:s=>/朝|am/.test(s)?'am':/夜|pm/.test(s)?'pm':null,sessionOf_:s=>+s.split(':')[0]<12?'am':'pm',CacheService:{getScriptCache:()=>({get:k=>cache.get(k),put:(k,v)=>cache.set(k,v),remove:k=>cache.delete(k)})},Utilities:{getUuid:()=> 'stable-uuid',computeDigest:(_,s)=>crypto.createHash('sha256').update(s).digest(),DigestAlgorithm:{SHA_256:'sha256'},base64EncodeWebSafe:b=>Buffer.from(b).toString('base64url'),formatDate:(d,tz,fmt)=>{const f=new Intl.DateTimeFormat('sv-SE',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).format(d).replace(' ','T');return fmt==='yyyy-MM-dd'?f.slice(0,10):fmt==='HH:mm'?f.slice(11,16):f+'+09:00';}},LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock(){}})},UrlFetchApp:{fetch:()=>{calls++;return{getResponseCode:()=>http,getContentText:()=>JSON.stringify(response)};}}});
 vm.runInContext(source,ctx);return{ctx,rows,props,cache,reads,edit:name=>ctx.activityScheduleOnEdit({range:{getSheet:()=>({getName:()=>name})}}),setResponse:x=>{response={...response,...x};},setHttp:x=>http=x,calls:()=>calls,request:body=>ctx.activityScheduleResponse_({idToken:'token',month:'2026-11',...body})};
}
test('年越しの月送りと5週・6週の月表',()=>{assert.equal(core.shiftMonth('2026-12',1),'2027-01');assert.equal(core.monthCells('2026-11',[]).length,35);assert.equal(core.monthCells('2026-08',[]).length,42);});
test('同日の2件を省略せず保持',()=>{const cells=core.monthCells('2026-11',[e,{...e,id:'two'}]);assert.equal(cells.find(d=>d?.date===e.date).items.length,2);});
test('日付またぎを各日に表示し、終了0時の次の日には表示しない',()=>{const overnight={...e,endDate:'2026-11-16',endAt:'2026-11-16T01:00:00+09:00'};assert.ok(core.coversDay(overnight,'2026-11-16'));assert.ok(!core.coversDay({...overnight,endAt:'2026-11-16T00:00:00+09:00'},'2026-11-16'));});
test('保存ICSは選択した1件だけ・UTC日時・改行と特殊文字を正しく処理',()=>{const s=core.ics(e,new Date('2026-10-18T00:00Z'));assert.equal((s.match(/BEGIN:VEVENT/g)||[]).length,1);assert.match(s,/DTSTART:20261115T103000Z/);assert.match(s,/SUMMARY:p.b.q 親睦会\\,テスト\\;改行\\nあり/);assert.ok(s.endsWith('\r\n'));for(const line of s.split('\r\n'))assert.ok(Buffer.byteLength(line)<=75);});
test('Google保存は選択した1件の予定作成画面を開く',()=>{const u=new URL(core.googleUrl(e));assert.equal(u.hostname,'calendar.google.com');assert.equal(u.searchParams.get('dates'),'20261115T103000Z/20261115T123000Z');assert.equal(u.searchParams.get('ctz'),'Asia/Tokyo');});
test('中止予定はカレンダー保存不可',()=>{assert.equal(core.googleUrl({...e,cancelled:true}),'');assert.throws(()=>core.ics({...e,cancelled:true}));});
test('危険なリンクとHTMLを無効化',()=>{assert.equal(core.httpsUrl('javascript:alert(1)'),'');assert.equal(core.httpsUrl('https://user:pass@example.com'),'');assert.match(core.escapeHtml('<img onerror="x">'),/^&lt;/);});
test('投票表示falseでも、掲載チェックのある予定はカレンダー表示',()=>{const h=harness();assert.equal(h.request().items.length,2);h.rows.practices[1][9]=false;h.edit('practices');assert.equal(h.request().items.length,1);});
test('翌年に古い年なし日程を再利用しない・明記年を優先・不正日を拒否',()=>{const h=harness();assert.equal(h.ctx.scheduleDay_('11/5(木)',2026),'2026-11-05');assert.equal(h.ctx.scheduleDay_('11/5(木)',''),'');assert.equal(h.ctx.scheduleDay_('2027/1/5',2026),'2027-01-05');assert.equal(h.ctx.scheduleDay_('2026/2/30'),'');});
test('日付またぎ・時刻型・不正時刻を扱う',()=>{const h=harness();assert.equal(h.ctx.scheduleRange_('2026-11-05','23:00','01:00').endDate,'2026-11-06');assert.equal(h.ctx.scheduleClock_(.375),'09:00');assert.equal(h.ctx.scheduleClock_('25:00'),'');assert.equal(h.ctx.scheduleRange_('2026-11-05','09:00','09:00'),null);});
test('公開イベントだけ表示・固定IDを自動設定し再読込後も保持',()=>{const h=harness();h.rows.イベント.push([true,'企画','親睦会','2026/11/28','19:30','21:30','検証会場','申込受付中','https://example.com','','','','','','','']);const a=h.request();assert.equal(a.items.length,3);assert.equal(a.items[2].id,'evt-stable-uuid');assert.equal(h.request().items[2].id,'evt-stable-uuid');h.rows.イベント[1][0]=false;h.edit('イベント');assert.equal(h.request().items.length,2);});
test('締切後・受付開始前の申込を抑止、不正URLでも表示は残す',()=>{const h=harness();h.rows.イベント.push([true,'企画','親睦会','2026/11/28','19:30','21:30','会場','申込受付中','javascript:alert(1)','2020/01/01 00:00','','','','','','fixed']);let a=h.request().items[2];assert.equal(a.status,'募集締切済');assert.equal(a.canApply,false);h.rows.イベント[1][9]='';h.rows.イベント[1][10]='2099/01/01 00:00';h.edit('イベント');assert.equal(h.request().items[2].status,'申込受付前');});
test('表の列変更・不正な月を明確なエラーで返す',()=>{const h=harness();assert.equal(h.request({month:'2026-99'}).code,'INVALID_MONTH');h.rows.practices[0][9]='別の列';assert.equal(h.request().code,'CONFIGURATION');});

test('近い5か月を1回の表読取で返し、次回はスプレッドシートの読取を省く',()=>{
 const h=harness(),a=h.request({prefetch:true});assert.equal(a.ok,true);assert.equal(Object.keys(a.months).length,5);assert.equal(a.months['2026-11'].length,2);assert.equal(a.timing.cacheHit,false);
 const before={...h.reads},b=h.request({month:'2026-12',prefetch:true});assert.equal(b.timing.cacheHit,true);assert.equal(b.items.length,0);
 for(const name of ['practices','イベント','venues'])assert.equal(h.reads[name],before[name]);assert.equal(h.reads.people,undefined);
});
test('関係ない表の編集では予定を失効せず、会場・予定・表構造の編集で破棄',()=>{
 const h=harness();h.request();h.edit('people');assert.equal(h.request().timing.cacheHit,true);h.edit('venues');assert.equal(h.request().timing.cacheHit,false);
 h.rows.practices[0][9]='変更';h.edit('practices');assert.equal(h.request().code,'CONFIGURATION');
 const b=harness();b.request();b.ctx.activityScheduleOnChange({changeType:'INSERT_ROW'});assert.equal(b.request().timing.cacheHit,false);
});
test('キャッシュが物理的に残っても10分以上古い予定は再取得',()=>{
 const h=harness();h.request();let saved=JSON.parse(h.cache.get('schedule_data_v1'));saved.builtAt=Date.now()-601000;h.cache.set('schedule_data_v1',JSON.stringify(saved));
 assert.equal(h.request().timing.cacheHit,false);
});
test('キャッシュ中でも締切・受付開始時刻による状態を再計算',()=>{
 const h=harness();const item={...e,status:'申込受付中',manualStatus:'申込受付中',entryOpensAt:'2026-11-15T18:00:00+09:00',entryClosesAt:'2026-11-15T19:00:00+09:00'};
 for(const fn of [core.liveItem,h.ctx.scheduleLiveItem_]) {
  assert.equal(fn(item,Date.parse('2026-11-15T17:00:00+09:00')).status,'申込受付前');assert.equal(fn(item,Date.parse('2026-11-15T18:30:00+09:00')).canApply,true);assert.equal(fn(item,Date.parse('2026-11-15T19:00:01+09:00')).canApply,false);
  assert.equal(fn({...item,manualStatus:'開催中止'},Date.parse('2026-11-15T18:30:00+09:00')).status,'開催中止');
 }
});
test('月のメモリ保持は45秒・サーバー期限・ログイン期限の短い方まで、明示消去可',()=>{
 let now=1000;const cache=core.createMonthCache(45000,()=>now),data={month:'2026-11',items:[e],months:{'2026-12':[]},updatedAt:'2026-10-18T00:00:00Z',expiresAt:61000};
 cache.put(data);assert.equal(cache.get('2026-11').items.length,1);assert.equal(cache.get('2026-12').items.length,0);now=46000;assert.equal(cache.get('2026-11'),null);
 now=1000;cache.put({...data,expiresAt:2000});now=2000;assert.equal(cache.get('2026-11'),null);
 now=1000;cache.put(data,1500);now=1500;assert.equal(cache.get('2026-11'),null);
 now=1000;cache.put(data);cache.clear();assert.equal(cache.get('2026-11'),null);
});
test('二重起動でも予定キャッシュ用トリガーを追加しすぎず、他のトリガーを保持',()=>{
 const h=harness(),triggers=[{getHandlerFunction:()=> 'keepWarm'}];let installs=0;
 h.ctx.ss_=()=>({getId:()=> 'synthetic-book',getSheetByName:()=>null});h.ctx.scheduleDataset_=()=>({items:[],issues:[]});
 h.ctx.ScriptApp={getProjectTriggers:()=>triggers,newTrigger:name=>{const builder={forSpreadsheet:id=>builder,onEdit:()=>builder,onChange:()=>builder,create:()=>{installs++;triggers.push({getHandlerFunction:()=>name,getTriggerSourceId:()=> 'synthetic-book'});}};return builder;}};
 h.ctx.installActivityScheduleCacheTriggers();h.ctx.installActivityScheduleCacheTriggers();assert.equal(installs,2);assert.equal(triggers.length,3);
});

test('ログイン・トークン・会員名簿なしで掲載済み予定を返し、LINE検証APIを呼ばない',()=>{
 const h=harness();h.rows.people.length=0;h.setHttp(503);const d=h.request({idToken:''});assert.equal(d.ok,true);assert.equal(d.items.length,2);assert.equal(h.calls(),0);assert.equal(h.reads.people,undefined);
 assert.ok(!JSON.stringify(d).includes('Ugood'));assert.ok(!JSON.stringify(d).includes('token'));assert.equal(d.performanceVersion,'schedule-fast-open-20261018');
});
test('予定の匿名閲覧を許可しても、非掲載行や投票・会員のデータは返さない',()=>{
 const h=harness();h.rows.practices[1][9]=false;const d=h.request();assert.equal(d.items.length,1);assert.equal(d.items[0].id,'practice-1105pm');assert.ok(!('capacity' in d.items[0]));assert.ok(!('tier' in d.items[0]));
});
