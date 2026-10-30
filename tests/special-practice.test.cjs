const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const monthly=fs.readFileSync(__dirname+'/../gas/MonthlyVoting.gs','utf8');
const schedule=fs.readFileSync(__dirname+'/../gas/ActivitySchedule.gs','utf8');
const target=(extra={})=>Object.assign(['1119pm','11/19(木)','20:00-22:00','東体育館',40,true,20,5,'夜の部',true,2026,''],extra);
const normal=(i,ses='pm')=>['n'+i,'11/'+(i+1),ses==='am'?'9:00-12:00':'20:00-22:00','通常体育館',22,true,3,3,ses,true,2026,''];
function server(rows,{admin=false}={}){
  const c=vm.createContext({console,Date,Math,JSON,Object,String,Number,Array,RegExp,Error,Intl,
    SESSION_LABEL:{am:'朝の部',pm:'夜の部'},TIER:{MEMBER:'member',SEMI:'semi'},MONTHLY_LIMIT:{member:4,semi:2},
    monthlyLimitOf_:tier=>tier==='semi'?2:4,isAdmin_:()=>admin,
    practiceStatusRows_:()=>rows,practiceIsCancelled_:v=>/中止|cancel/i.test(v||''),
    composeLabel_:(d,t,p)=>[d,t,p].join(' '),normalizeSession_:s=>/朝|am/.test(s)?'am':'pm',sessionOf_:t=>+t.slice(0,2)<12?'am':'pm',
    isTrialPool_:e=>['guest','trial'].includes(e.etype),assertBroadcastOperator_(){},Logger:{log(){}},
    Utilities:{formatDate:(d,tz)=>new Intl.DateTimeFormat('sv-SE',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit'}).format(d)}
  });
  vm.runInContext(schedule+'\n'+monthly,c);const catalog=c.votingPracticeCatalog_();
  return {c,catalog,validate:(selected,entries=[],tier='member')=>c.validateMonthlyVoting_('test',tier,selected,catalog,entries)};
}
const own=(pid,extra={})=>({uid:'test',pid,status:'confirmed',etype:'self',...extra});
const rows=()=>[...Array.from({length:5},(_,i)=>normal(i)),target()];

test('特例は指定したID・年月日・時間・会場・夜の部だけ、定員は維持',()=>{
  const h=server(rows());assert.equal(h.catalog['1119pm'].practice.monthlyLimitExempt,true);
  assert.equal(h.catalog.n0.practice.monthlyLimitExempt,false);
  const p=h.catalog['1119pm'].practice;assert.deepEqual([p.capacity,p.capTrial,p.capSemi],[40,20,5]);
  for(const patch of [{0:'other'},{1:'11/20(木)'},{2:'19:00-22:00'},{3:'西体育館'},{8:'朝の部'},{10:2027}]){
    const x=target(patch),c=server([x]).catalog;assert.equal(c[x[0]].practice.monthlyLimitExempt,false,JSON.stringify(patch));
  }
});
test('JSTの日付セルと年付き日付でも対象を一意に判定',()=>{
  for(const date of [new Date('2026-11-18T15:00:00Z'),'2026/11/19'])assert.equal(server([target({1:date})]).catalog['1119pm'].practice.monthlyLimitExempt,true);
  assert.equal(server([target({1:new Date('2026-11-19T15:00:00Z')})]).catalog['1119pm'].practice.monthlyLimitExempt,false);
});
test('通常4回に特例を追加でき、特例を先に選んでも通常4回を維持',()=>{
  const h=server(rows());for(const ids of [['n0','n1','n2','n3','1119pm'],['1119pm','n0','n1','n2','n3']])assert.doesNotThrow(()=>h.validate(ids));
});
test('特例を加えても通常の夜5回目は拒否',()=>{
  const h=server(rows());assert.throws(()=>h.validate(['1119pm','n0','n1','n2','n3','n4']),/月に4回/);
});
test('準メンバーは通常2回＋特例、通常3回目は従来どおり拒否',()=>{
  const h=server(rows());h.validate(['n0','n1','1119pm'],[],'semi');assert.throws(()=>h.validate(['n0','n1','n2','1119pm'],[],'semi'),/月に2回/);
});
test('非表示の特例の確定・待機も月集計から除外しAPI情報へ明示',()=>{
  for(const status of ['confirmed','waitlist']){
    const h=server([...Array.from({length:5},(_,i)=>normal(i)),target({5:false})]);const entries=[own('1119pm',{status})];
    h.validate(['n0','n1','n2','n3'],entries);
    const info=h.c.votingMonthlyEntries_('test',h.catalog,entries);assert.equal(info[0].monthlyLimitExempt,true);assert.equal(info[0].visible,false);
  }
});
test('通常4回が既存票でも特例を追加・再送でき、通常の追加枠は増えない',()=>{
  const h=server(rows()),existing=['n0','n1','n2','n3'].map(id=>own(id));
  h.validate(['n0','n1','n2','n3','1119pm'],existing);
  h.validate(['1119pm','n0','n1','n2','n3'],[...existing,own('1119pm')]);
  assert.throws(()=>h.validate(['n0','n1','n2','n3','n4','1119pm'],existing),/月に4回/);
});
test('開催中止・本人取消の特例は本人の有効申込へ残さない',()=>{
  let h=server([target({11:'開催中止'})]);assert.equal(h.c.votingMonthlyEntries_('test',h.catalog,[own('1119pm')]).length,0);
  h=server([target()]);assert.equal(h.c.votingMonthlyEntries_('test',h.catalog,[own('1119pm',{status:'cancelled'})]).length,0);
});
test('朝・運営の無制限は特例と独立して維持',()=>{
  const morning=Array.from({length:8},(_,i)=>normal(i,'am'));for(const tier of ['member','semi'])server(morning).validate(morning.map(r=>r[0]),[],tier);
  const h=server(rows(),{admin:true});h.validate(rows().map(r=>r[0]));
});
function front(limit=4){
  const elements={},el=id=>elements[id]??={innerHTML:'',textContent:'',style:{},classList:{add(){},remove(){}},addEventListener(){}};
  const c=vm.createContext({document:{getElementById:el,querySelectorAll:()=>[]},window:{scrollTo(){}},location:{search:''},URLSearchParams,console,setTimeout(){},clearTimeout(){}});
  const html=fs.readFileSync(__dirname+'/../index.html','utf8');vm.runInContext(html.match(/<script>([\s\S]*?)<\/script>/)[1].replace('\nboot();',''),c);
  Object.assign(c.state,{hasProfile:true,fresh:true,session:'pm',monthlyLimit:limit,monthlySessionLimits:{am:null,pm:limit},accountTier:limit===2?'semi':'member'});
  c.state.practices=Object.values(server(rows()).catalog).map(x=>x.practice);return {c,el};
}
test('画面で通常4回＋特例は両順序で選択でき、通常5回目は拒否',()=>{
  for(const ids of [['n0','n1','n2','n3','1119pm'],['1119pm','n0','n1','n2','n3']]){
    const {c}=front();ids.forEach(id=>c.toggle(id));assert.equal(c.state.selected['1119pm'],true);assert.equal(c.monthlySelectedCount('2026-11','pm'),4);c.toggle('n4');assert.equal(c.state.selected.n4,undefined);
  }
});
test('画面でも非表示・待機の特例は消費せず、非表示の通常票は数える',()=>{
  const {c}=front();c.state.myMonthlyEntries=[{practiceId:'hidden-special',monthKey:'2026-11',session:'pm',visible:false,monthlyLimitExempt:true},...Array.from({length:4},(_,i)=>({practiceId:'hidden'+i,monthKey:'2026-11',session:'pm',visible:false}))];
  c.toggle('1119pm');assert.equal(c.state.selected['1119pm'],true);assert.equal(c.monthlySelectedCount('2026-11','pm'),4);c.toggle('n0');assert.equal(c.state.selected.n0,undefined);
});
test('対象カードにだけ特例を明記し、選択解除・再選択でも通常回数を維持',()=>{
  const {c,el}=front();['n0','n1','n2','n3','1119pm'].forEach(id=>c.toggle(id));
  assert.equal((el('root').innerHTML.match(/特例：この日は月の回数制限に含みません/g)||[]).length,1);
  c.toggle('1119pm');assert.equal(c.monthlySelectedCount('2026-11','pm'),4);c.toggle('1119pm');assert.equal(c.monthlySelectedCount('2026-11','pm'),4);
});
test('画面の準メンバー2回と運営・朝の無制限も維持',()=>{
  const {c}=front(2);['1119pm','n0','n1','n2'].forEach(id=>c.toggle(id));assert.equal(c.monthlySelectedCount('2026-11','pm'),2);assert.equal(c.state.selected.n2,undefined);
  c.state.unlimited=true;c.state.isAdmin=true;c.state.practices.forEach(p=>c.state.selected[p.id]=false);c.state.practices.forEach(p=>c.toggle(p.id));assert.equal(c.selectedCount(),6);
});
