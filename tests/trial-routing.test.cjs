const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const html=fs.readFileSync(process.env.PBQ_TEST_HTML||path.join(__dirname,'../index.html'),'utf8');
const script=html.match(/<script>([\s\S]*?)<\/script>/)[1].replace(/\nboot\(\);/,'');
function harness(search=''){
  const elements={};
  const el=id=>elements[id]??={innerHTML:'',textContent:'',value:'',hidden:false,style:{},classList:{add(){},remove(){}},addEventListener(){},focus(){}};
  const location={search};
  const c=vm.createContext({document:{getElementById:el,querySelectorAll(){return[];},addEventListener(){}},window:{scrollTo(){}},location,URLSearchParams,console,localStorage:{getItem(){return null;},setItem(){}},setTimeout(){return 0;},clearTimeout(){},setInterval(){return 0;},clearInterval(){}});
  vm.runInContext(script,c);
  const practices=[{id:'1009am',date:'10/9(金)',time:'9:00-12:00',place:'検証用体育館',session:'am',capacity:22,capTrial:10},{id:'1009pm',date:'10/9(金)',time:'20:00-22:00',place:'検証用体育館',session:'pm',capacity:22,capTrial:8},{id:'1016am',date:'10/16(金)',time:'9:00-12:00',place:'検証用体育館',session:'am',capacity:22,capTrial:10}];
  const payload={ok:true,practices,roster:practices.map(p=>({id:p.id,members:[],membersWait:[],trials:Array(p.id==='1009am'?2:p.id==='1009pm'?8:0).fill('テスト参加者')})),hasProfile:true,canVote:false,mine:[],myTrials:[],myGuests:[],wards:['博多区']};
  Object.assign(c.state,{userId:'TEST',lineName:'テスト',session:'am',fresh:true,hasProfile:true});
  c.apiGet=()=>Promise.resolve(payload);
  return {c,el,location,payload};
}
const settle=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};
test('URLに体験指定がなくても体験アカウントを体験フォームへ案内する',async()=>{
  const {c,el}=harness();c.loadAll();await settle();
  assert.equal(c.state.mode,'trial');assert.match(el('root').innerHTML,/体験に申し込む/);
});
test('アンケート未回答の体験ユーザーは回答後に体験へ戻る',async()=>{
  const {c,payload}=harness('?mode=trial');c.state.mode='trial';payload.hasProfile=false;c.loadAll();await settle();assert.equal(c.state.mode,'profile');
  payload.hasProfile=true;c.loadAll();await settle();assert.equal(c.state.mode,'trial');
});
test('アンケート入口から回答してもメンバー申込に迷い込まない',async()=>{
  const {c,el}=harness('?mode=profile');c.state.mode='profile';c.state.hasProfile=false;
  Object.entries({'pf-name':'テスト','pf-y':'2002','pf-m':'1','pf-d':'1','pf-ward':'博多区','pf-gender':'男性'}).forEach(([k,v])=>el(k).value=v);
  c.apiPost=()=>Promise.resolve({ok:true,tier:'trial'});c.submitProfile();await settle();assert.equal(c.state.mode,'trial');
});
test('LINEの初期化後に復元された体験URLを読む',async()=>{
  const {c,location}=harness('?liff.state=%3Fmode%3Dtrial');
  c.apiGet=()=>new Promise(()=>{});
  c.liff={init(){location.search='?mode=trial&day=1009am';return Promise.resolve();},isLoggedIn(){return true;},getDecodedIDToken(){return {sub:'TEST',name:'テスト'};},getIDToken(){return 'test-token';}};
  c.boot();await settle();assert.equal(c.state.mode,'trial');assert.equal(c.state.trialDay,'1009am');
});
test('朝の残り8枠は選択可能、満員の夜は選択不可、別日も選択可能',async()=>{
  const {c,el}=harness();c.loadAll();await settle();
  assert.equal(c.trialLeft('1009am'),8);assert.equal(c.trialLeft('1016am'),10);
  assert.match(el('root').innerHTML,/<option value="1009am"(?! disabled)/);
  assert.match(el('root').innerHTML,/<option value="1016am"(?! disabled)/);
  c.state.session='pm';c.render();assert.match(el('root').innerHTML,/<option value="1009pm" disabled/);
});
test('体験フォームからの送信はsubmit_trialを使う',async()=>{
  const {c,el}=harness();c.loadAll();await settle();let body;
  Object.entries({'tr-day':'1009am','tr-name':'テスト','tr-age':'24','tr-gender':'男性'}).forEach(([k,v])=>el(k).value=v);
  c.apiPost=b=>{body=b;return Promise.resolve({ok:true});};c.submitTrial();await settle();assert.equal(body.action,'submit_trial');assert.equal(body.practiceId,'1009am');
});
test('メンバーと準メンバーは従来の投票画面を使う',async()=>{
  for(const tier of ['member','semi']){const {c,payload}=harness();payload.accountTier=tier;payload.canVote=true;payload.isMember=tier==='member';c.loadAll();await settle();assert.equal(c.state.mode,'');}
});
test('辞退・退会アカウントを体験やメンバー申込へ案内しない',async()=>{
  for(const tier of ['declined','expelled']){const {c,payload,el}=harness('?mode=trial');payload.accountTier=tier;c.loadAll();await settle();assert.equal(c.state.mode,'unavailable');assert.doesNotMatch(el('root').innerHTML,/onclick="submitTrial\(\)"/);}
});
test('体験と初回アンケートの画面にも読み込みをやり直せる更新ボタンがある',()=>{
  const {c,el}=harness();c.state.mode='trial';c.renderHead_();assert.match(el('head').innerHTML,/onclick="retryLoadAll\(\)"/);
  c.state.hasProfile=false;c.renderHead_();assert.match(el('head').innerHTML,/onclick="retryLoadAll\(\)"/);
});
test('体験の入力中に更新しても入力内容を保持する',async()=>{
  const {c,el}=harness();c.loadAll();await settle();
  Object.entries({'tr-day':'1016am','tr-name':'入力した名前','tr-age':'25','tr-gender':'女性','tr-ref':'紹介者'}).forEach(([k,v])=>el(k).value=v);
  c.retryLoadAll();await settle();assert.match(el('root').innerHTML,/value="入力した名前"/);assert.match(el('root').innerHTML,/value="25"/);assert.match(el('root').innerHTML,/value="1016am" selected/);
});
