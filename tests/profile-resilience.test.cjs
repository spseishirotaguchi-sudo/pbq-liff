const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const html=fs.readFileSync(process.env.PBQ_TEST_HTML||path.join(__dirname,'../index.html'),'utf8');
function harness(){
 const elements={},timers=[],calls=[];const el=id=>elements[id]??={innerHTML:'',textContent:'',value:'',style:{},classList:{add(){},remove(){}},addEventListener(){},focus(){}};
 const c=vm.createContext({document:{getElementById:el,querySelectorAll:()=>[],addEventListener(){}},window:{scrollTo(){}},location:{search:'?mode=profile'},URLSearchParams,console,localStorage:{getItem:()=>null,setItem(){}},setTimeout:f=>{timers.push(f);return timers.length;},clearTimeout(){},setInterval:()=>0,clearInterval(){}});
 vm.runInContext(html.match(/<script>([\s\S]*?)<\/script>/)[1].replace('\nboot();',''),c);
 Object.assign(c.state,{userId:'synthetic',lineName:'検証',idToken:'synthetic-token',entryMode:'profile',mode:'profile',hasProfile:false,fresh:true});
 const p={id:'1016am',date:'10/16(金)',time:'9:00-12:00',place:'検証用体育館',session:'am',capTrial:10,capacity:20};
 const profile={ok:true,hasProfile:false,accountTier:'trial',canVote:false,myProfile:null,wards:['博多区']},booking={...profile,hasProfile:true,practices:[p],roster:[{id:p.id,members:[],membersWait:[],trials:[]}],mine:[],myTrials:[],myGuests:[]};
 c.apiGet=body=>{calls.push(body.api);return Promise.resolve(body.api==='profile_bootstrap'?profile:booking);};
 return {c,el,timers,calls,profile,booking};
}
const settle=async()=>{for(let i=0;i<16;i++)await Promise.resolve();};
function fill(h){for(const [k,v]of Object.entries({'pf-name':'入力した検証名','pf-y':'2001','pf-m':'10','pf-d':'1','pf-ward':'博多区','pf-gender':'女性'}))h.el(k).value=v;}
test('あいさつリンクからの初回アンケートは専用APIで読み込む',async()=>{const h=harness();await h.c.loadAll();assert.deepEqual(h.calls,['profile_bootstrap']);assert.match(h.el('root').innerHTML,/アンケート（4項目）/);assert.equal(h.c.state.fresh,true);});
test('25秒の自動更新で入力中のアンケートを描き直さない',async()=>{const h=harness();fill(h);h.el('root').innerHTML='input in progress';h.c.silentRefresh(false);await settle();assert.equal(h.calls.length,0);assert.equal(h.el('root').innerHTML,'input in progress');});
test('アンケート画面では自動更新タイマーを作らない',()=>{const h=harness();h.c.scheduleRefresh();assert.equal(h.timers.length,0);});
test('手動更新しても名前・生年月日・区・性別を保持する',async()=>{const h=harness();fill(h);await h.c.retryLoadAll();for(const s of ['入力した検証名','value="2001"','value="10"','value="1"','value="博多区" selected','<option selected>女性'])assert.ok(h.el('root').innerHTML.includes(s),s);});
test('通信エラーでも入力内容を保持して再送できる',async()=>{const h=harness();fill(h);h.c.apiPost=()=>Promise.reject(Error('network'));h.c.submitProfile();await settle();assert.equal(h.c.state.profileBusy,false);assert.match(h.el('root').innerHTML,/入力した検証名/);assert.match(h.el('root').innerHTML,/value="2001"/);assert.match(h.el('msg').innerHTML,/入力内容は保持/);});
test('サーバーが保存を拒否しても入力内容を保持する',async()=>{const h=harness();fill(h);h.c.apiPost=()=>Promise.resolve({ok:false,error:'検証エラー'});h.c.submitProfile();await settle();assert.match(h.el('root').innerHTML,/入力した検証名/);assert.equal(h.c.state.profileBusy,false);});
test('回答済みの人が参加申込みへ進むと日程を新たに読み込む',async()=>{const h=harness();h.profile.hasProfile=true;await h.c.loadAll();assert.equal(h.c.state.practices.length,0);await h.c.goToBooking();assert.deepEqual(h.calls,['profile_bootstrap','bootstrap']);assert.equal(h.c.state.practices.length,1);assert.equal(h.c.state.mode,'trial');});
test('アンケート保存後は体験日程を読み込んで選べる',async()=>{const h=harness();fill(h);h.c.apiPost=()=>Promise.resolve({ok:true,tier:'trial'});h.c.submitProfile();await settle();assert.equal(h.c.state.mode,'trial');assert.deepEqual(h.calls,['bootstrap']);h.c.pickSession('am');assert.match(h.el('root').innerHTML,/value="1016am"/);assert.equal(h.c.state.profileDraft,null);});
test('全角数字の生年月日も半角にそろえて保存する',async()=>{const h=harness();fill(h);h.el('pf-y').value='２００１';h.el('pf-m').value='１０';h.el('pf-d').value='１';let sent;h.c.apiPost=b=>{sent=b;return Promise.resolve({ok:true,tier:'trial'});};h.c.submitProfile();await settle();assert.equal(sent.birthday,'2001-10-01');});
test('存在しない日付・小数・未来の日付は保存しない',()=>{for(const vals of [['2001','2','31'],['2001','1.5','1'],['2026','12','31']]){const h=harness();fill(h);['pf-y','pf-m','pf-d'].forEach((k,i)=>h.el(k).value=vals[i]);h.c.apiPost=()=>{throw Error('must not save');};h.c.submitProfile();assert.equal(h.c.state.profileBusy,false);assert.match(h.el('msg').innerHTML,/生年月日/);}});
test('通常のメンバー投票は従来のAPIを使う',async()=>{const h=harness();Object.assign(h.c.state,{entryMode:'',mode:'',hasProfile:true});h.booking.accountTier='member';h.booking.canVote=true;await h.c.loadAll();assert.deepEqual(h.calls,['bootstrap']);assert.equal(h.c.state.mode,'');});
test('LINEアカウント切替では入力途中の個人情報を引き継がない',()=>{const h=harness();fill(h);h.c.captureProfileDraft_();h.c.resetForOtherUser_();assert.equal(h.c.state.profileDraft,null);});
