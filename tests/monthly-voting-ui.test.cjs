const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
function frontend(){
  const elements={};const el=id=>elements[id]??={innerHTML:'',textContent:'',style:{},classList:{add(){},remove(){}},addEventListener(){}};
  const c=vm.createContext({document:{getElementById:el,querySelectorAll:()=>[]},window:{scrollTo(){}},location:{search:''},URLSearchParams,console,setTimeout,clearTimeout,setInterval,clearInterval});
  const html=fs.readFileSync(__dirname+'/../index.html','utf8');
  vm.runInContext(html.match(/<script>([\s\S]*?)<\/script>/)[1].replace('\nboot();',''),c);
  Object.assign(c.state,{hasProfile:true,fresh:true,session:'pm',monthlyLimit:4});
  c.state.practices=['2026-10','2026-11'].flatMap(month=>Array.from({length:5},(_,i)=>({id:month+'-'+i,monthKey:month,session:'pm',date:month+'-'+(i+1),capacity:22})));
  return {c,el};
}
test('画面：前月1回＋翌月4回を選択、月別の残り回数を表示',()=>{
  const {c,el}=frontend();c.toggle('2026-10-0');for(let i=0;i<4;i++)c.toggle('2026-11-'+i);
  assert.equal(c.monthlySelectedCount('2026-11','pm'),4);assert.match(el('limit-lead').innerHTML,/2026年11月.*4回（残り 0回）/);
  c.toggle('2026-11-4');assert.equal(c.state.selected['2026-11-4'],undefined);assert.match(el('msg').innerHTML,/2026-11.*月に4回/);
  c.toggle('2026-11-0');c.toggle('2026-11-4');assert.equal(c.state.selected['2026-11-4'],true);assert.equal(el('msg').innerHTML,'');
});
test('画面：朝夜を切り替えても同じ月の部別上限が独立',()=>{
  const {c}=frontend();for(let i=0;i<4;i++)c.toggle('2026-11-'+i);
  c.state.practices.push({id:'am',monthKey:'2026-11',session:'am',capacity:22});c.pickSession('am');c.toggle('am');
  assert.equal(c.monthlySelectedCount('2026-11','am'),1);assert.equal(c.monthlySelectedCount('2026-11','pm'),4);
});
test('画面：非表示票・待機票を含め、表示を絞り込んでも月枠を維持',()=>{
  const {c}=frontend();c.state.myMonthlyEntries=Array.from({length:4},(_,i)=>({practiceId:'hidden'+i,monthKey:'2026-11',session:'pm'}));
  c.state.practices=c.state.practices.filter(p=>p.id==='2026-11-4');c.toggle('2026-11-4');
  assert.equal(c.monthlySelectedCount('2026-11','pm'),4);assert.equal(c.state.selected['2026-11-4'],undefined);
});
test('画面：可視票は二重計上せず、未送信取消・再選択も反映',()=>{
  const {c}=frontend();c.state.myMonthlyEntries=[{practiceId:'2026-11-0',monthKey:'2026-11',session:'pm'}];c.state.mine=[{practiceId:'2026-11-0',status:'waitlist'}];c.seedFromServer();
  assert.equal(c.monthlySelectedCount('2026-11','pm'),1);c.toggle('2026-11-0');assert.equal(c.monthlySelectedCount('2026-11','pm'),0);
  c.toggle('2026-11-0');assert.equal(c.monthlySelectedCount('2026-11','pm'),1);
});
test('画面：年を含むキーで同名月を分ける',()=>{
  const {c}=frontend();c.state.practices=[{id:'a',monthKey:'2026-01',session:'pm'},{id:'b',monthKey:'2027-01',session:'pm'}];c.state.monthlyLimit=1;
  c.toggle('a');c.toggle('b');assert.equal(c.state.selected.a,true);assert.equal(c.state.selected.b,true);
});
test('画面：旧GASの開催月欠落時は誤った枠で追加せず、既存の取消は可能',()=>{
  const {c,el}=frontend();c.state.practices=[{id:'old',session:'pm'}];c.toggle('old');assert.match(el('msg').innerHTML,/開催年月/);assert.equal(c.state.selected.old,undefined);
  c.state.selected.old=true;c.toggle('old');assert.equal(c.state.selected.old,false);
});
test('画面：アカウント切替と保存復元で本人の月集計を混ぜない',()=>{
  const {c}=frontend();const sample={practiceId:'hidden',monthKey:'2026-11',session:'pm'};c.applySnapshot_({practices:[],myMonthlyEntries:[sample]});assert.equal(c.state.myMonthlyEntries.length,1);
  c.resetForOtherUser_();assert.equal(c.state.myMonthlyEntries.length,0);
});
test('画面：運営は月上限を超えて追加できる',()=>{const {c}=frontend();c.state.unlimited=true;for(let i=0;i<5;i++)c.toggle('2026-11-'+i);assert.equal(c.monthlySelectedCount('2026-11','pm'),5);});
test('画面：取消編集中に日程が非表示になっても、残存申込の月枠を消さない',()=>{
  const {c}=frontend();c.state.myMonthlyEntries=[{practiceId:'hidden',monthKey:'2026-11',session:'pm',visible:false}];c.state.selected.hidden=false;
  assert.equal(c.monthlySelectedCount('2026-11','pm'),1);
});
test('画面：不正な開催年の可視票を取り消して、有効な日へ変更できる',()=>{
  const {c}=frontend();c.state.myMonthlyEntries=[{practiceId:'invalid',monthKey:'',session:'pm',visible:true}];c.state.selected.invalid=false;
  c.toggle('2026-11-0');assert.equal(c.state.selected['2026-11-0'],true);
});
