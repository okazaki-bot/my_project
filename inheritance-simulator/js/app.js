"use strict";
/* ============================================================
   メインUI（案件・ステップ・シナリオ・計算画面）
============================================================ */

const STEPS = [
  {key:'basic',   label:'基本情報'},
  {key:'family',  label:'親族構成'},
  {key:'deposits',label:'預金'},
  {key:'securities',label:'有価証券'},
  {key:'insurance',label:'保険／年金'},
  {key:'minashi', label:'みなし相続財産'},
  {key:'realestate',label:'不動産'},
  {key:'division',label:'遺産分割対象'},
  {key:'others',  label:'その他'},
  {key:'debts',   label:'債務・葬式費用'},
  {key:'calc',    label:'分割と税額計算'},
  {key:'done',    label:'完了・レポート'},
];
const REL_OPTIONS = ['配偶者','子','孫（代襲）','父','母','祖父母','兄弟姉妹','甥姪（代襲）','その他（受遺者等）'];
const ASSET_CATS = {
  deposits:{ label:'金融資産（預金）', unitQty:true,
    kinds:['普通預金','定期預金','定額貯金','定期積金','積立貯金','貯蓄預金','総合口座','通常貯金','当座預金','現金','その他'],
    fields:['name:品名（金融機関名等）*','branch:支店名等','kind:種類','number:番号等','unit:単価*','qty:口数*','memo:メモ'] },
  securities:{ label:'金融資産（有価証券）', unitQty:true,
    kinds:['株式','非上場株式','投資信託','債券','社債','出資金','MRF','その他'],
    fields:['name:品名（金融機関名等）*','branch:支店名等','kind:種類','number:番号等','unit:単価*','qty:口数・株数*','memo:メモ'] },
  insurance:{ label:'保険／年金（解約返戻金等）', unitQty:false,
    kinds:['終身保険','定期保険','養老保険','個人年金','医療保険','がん保険','介護保険','共済','その他'],
    fields:['name:品名（保険会社名等）*','kind:種類','number:証券番号等','contractor:契約者','insured:被保険者','value:解約返戻金等（評価額）*','memo:メモ'] },
  minashi:{ label:'みなし相続財産', unitQty:false,
    kinds:['死亡保険金','死亡退職金','信託財産','その他'],
    fields:['name:品名（保険会社名等）*','kind:種類','receiver:受取人','value:評価額*','memo:メモ'] },
  realestate:{ label:'不動産', unitQty:false, kinds:[], fields:[] },
  division:{ label:'遺産分割対象', unitQty:false, kinds:[],
    fields:['name:名称*','value:評価額*','memo:メモ'] },
  others:{ label:'その他の財産', unitQty:false, kinds:['自動車','貴金属','書画骨董','ゴルフ会員権','貸付金','その他'],
    fields:['name:名称*','kind:種類','value:評価額*','memo:メモ'] },
  debts:{ label:'債務・葬式費用', unitQty:false,
    kinds:['借入金','未払金','未払税金','葬儀費用','法要費用','お布施','火葬費用','納骨費用','その他'],
    fields:['name:品名（債権者名等）*','kind:種類','value:金額*','memo:メモ'] },
};

/* ---------- 状態 ---------- */
const LS_KEY='inheritance-sim-v1';
let db=loadDB();
let ui={step:-1};
function loadDB(){
  try{ const d=JSON.parse(localStorage.getItem(LS_KEY)); if(d&&d.cases){ d.cases.forEach(migrateCase); return d; } }catch(e){}
  // 初回アクセス時はサンプル案件を1件入れておく
  const d={cases:[], activeId:null, office:''};
  try{ d.cases.push(buildSampleCase()); }catch(e){}
  return d;
}
function saveDB(){ localStorage.setItem(LS_KEY, JSON.stringify(db)); }
function activeCase(){ return db.cases.find(c=>c.id===db.activeId)||null; }
function newCase(){
  const c={
    id:uid(), createdAt:new Date().toISOString(),
    baseDate:new Date().toISOString().slice(0,10), caseName:'',
    decedent:{name:'',kana:'',birth:'',address:''},
    client:{name:'',kana:'',tel:'',email:''},
    prev:{date:'',taxA:'',assetB:''},
    heirs:[], fixed:false,
    scenarios:[{id:uid(),name:'現状',type:'現状',
      assets:{deposits:[],securities:[],insurance:[],minashi:[],realestate:[],division:[],others:[],debts:[]},
      alloc:{}}],
  };
  c.activeScn=c.scenarios[0].id;
  return c;
}

/* ---------- 描画ディスパッチ ---------- */
const view=document.getElementById('view');
function render(){
  renderStepper();
  const c=activeCase();
  document.getElementById('hd-case').textContent=c?(c.caseName||'（無題の案件）'):'案件未選択';
  if(!c||ui.step<0){ renderCaseList(); return; }
  migrateCase(c);
  const key=STEPS[ui.step].key;
  if(key==='basic') renderBasic(c);
  else if(key==='family') renderFamily(c);
  else if(key==='realestate') renderREList(c);
  else if(key==='calc') renderCalc(c);
  else if(key==='done') renderDone(c);
  else renderAssets(c,key);
  window.scrollTo(0,0);
}
function renderStepper(){
  const el=document.getElementById('stepper');
  if(ui.step<0||!activeCase()){ el.innerHTML=''; return; }
  el.innerHTML=STEPS.map((s,i)=>
    `<div class="step ${i===ui.step?'active':''} ${i<ui.step?'done':''}" onclick="goStep(${i})">
      <span class="no">${i<ui.step?'✓':i+1}</span><small>${s.label}</small></div>`).join('');
}
function goStep(i){ ui.step=i; saveDB(); render(); }
function navButtons(){
  const prev=ui.step>0?`<button class="btn" onclick="goStep(${ui.step-1})">← ${STEPS[ui.step-1].label}へ</button>`:`<button class="btn" onclick="ui.step=-1;render()">← 案件一覧へ</button>`;
  const next=ui.step<STEPS.length-1?`<button class="btn primary" onclick="goStep(${ui.step+1})">${STEPS[ui.step+1].label}へ →</button>`:'';
  return `<div class="nav-btns">${prev}${next}</div>`;
}

/* ---------- シナリオタブ ---------- */
function scnTabs(c){
  migrateCase(c);
  return `<div class="scn-tabs">
    ${c.scenarios.map(s=>`<div class="scn-tab ${s.id===(c.activeScn||c.scenarios[0].id)?'active':''} t-${s.type}" onclick="switchScn('${s.id}')">
      ${esc(s.name)}${s.type!=='現状'?`<span class="x" onclick="event.stopPropagation();delScn('${s.id}')">✕</span>`:''}</div>`).join('')}
    <button class="btn sm ghost" onclick="addScnModal()">＋ 対策ケース追加</button>
  </div>`;
}
function switchScn(id){ const c=activeCase(); c.activeScn=id; saveDB(); render(); }
function addScnModal(){
  openModal('対策ケースの追加',`
    <p class="desc" style="margin-bottom:10px">「現状」をコピーして対策後のケースを作ります。生前贈与や信託などの対策を反映して税額を比較できます。</p>
    <div class="frow"><label>ケース名</label><input type="text" id="scn-name" value="対策案${activeCase().scenarios.length}"></div>
    <div class="frow"><label>タイプ</label><select id="scn-type"><option>対策</option><option>贈与</option></select></div>
    <div class="frow"><label>コピー元</label><select id="scn-src">${activeCase().scenarios.map(s=>`<option value="${s.id}">${esc(s.name)}</option>`).join('')}</select></div>`,
    `<button class="btn" onclick="closeModal()">キャンセル</button>
     <button class="btn primary" onclick="addScn()">作成</button>`);
}
function addScn(){
  const c=activeCase();
  const src=c.scenarios.find(s=>s.id===gv('scn-src'))||c.scenarios[0];
  const s=JSON.parse(JSON.stringify(src));
  s.id=uid(); s.name=gv('scn-name')||'対策案'; s.type=gv('scn-type')||'対策';
  // 行idは維持（差分比較のため）
  c.scenarios.push(s); c.activeScn=s.id;
  saveDB(); closeModal(); render();
}
function delScn(id){
  const c=activeCase();
  if(c.scenarios.length<=1) return;
  if(!confirm('このケースを削除しますか？')) return;
  c.scenarios=c.scenarios.filter(s=>s.id!==id);
  if(c.activeScn===id) c.activeScn=c.scenarios[0].id;
  saveDB(); render();
}
/* 現状との差分判定 */
function rowDiff(c,cat,row){
  const S=activeScenario(c);
  if(S.type==='現状') return '';
  const base=c.scenarios.find(s=>s.type==='現状');
  if(!base) return '';
  const orig=base.assets[cat].find(r=>r.id===row.id);
  if(!orig) return 'added';
  if(JSON.stringify(orig)!==JSON.stringify(row)) return 'changed';
  return '';
}
function diffBadge(d,row){
  let b='';
  if(d==='added') b+='<span class="badge diff-add">追加</span> ';
  if(d==='changed') b+='<span class="badge diff-chg">変更</span> ';
  if(row.gift) b+=`<span class="badge diff-gift">贈与${row.giftAdd?'（加算対象）':'済'}</span> `;
  if(row.trust) b+='<span class="badge diff-trust">信託</span> ';
  return b;
}

/* ---------- 案件一覧 ---------- */
function renderCaseList(){
  const rows=db.cases.map(c=>{
    migrateCase(c);
    const t=calcTax(c, c.scenarios[0]);
    return `<tr>
      <td>${esc(c.caseName)||'（無題）'}${c.fixed?' <span class="badge warn">確定済</span>':''}</td>
      <td>${esc(c.decedent.name)}</td>
      <td>${esc(c.baseDate)}</td>
      <td class="num">${yen(t.taxBaseTotal)} 円</td>
      <td class="num">${yen(t.totalPay)} 円</td>
      <td>${c.scenarios.length>1?`<span class="badge heir">${c.scenarios.length}ケース</span>`:''}</td>
      <td>
        <button class="btn sm primary" onclick="openCase('${c.id}')">開く</button>
        <button class="btn sm" onclick="dupCase('${c.id}')">複製</button>
        <button class="btn sm danger" onclick="delCase('${c.id}')">削除</button>
      </td></tr>`;
  }).join('');
  view.innerHTML=`
    <h2 class="page">相続シミュレーション 案件一覧</h2>
    <p class="desc">案件を作成して、被相続人の情報・親族構成・財産目録を入力すると相続税の概算を計算できます。</p>
    <div class="toolbar">
      <button class="btn primary" onclick="createCase()">＋ 新規シミュレーション開始</button>
      <button class="btn gold" onclick="createSample()">サンプルデータで作成</button>
      <button class="btn ghost" onclick="officeModal()">⚙ 事務所名設定（レポート用）</button>
    </div>
    <div class="card">
      <table class="list">
        <tr><th>案件名</th><th>被相続人</th><th>計算基準日</th><th class="num">課税価格合計（現状）</th><th class="num">納税額合計（現状）</th><th>対策</th><th>操作</th></tr>
        ${rows||'<tr><td colspan="7" class="empty">案件がありません。「新規シミュレーション開始」から作成してください。</td></tr>'}
      </table>
    </div>`;
}
function officeModal(){
  openModal('事務所名の設定',`
    <div class="frow"><label>事務所名・担当者名</label><input type="text" id="of-name" value="${esc(db.office||'')}" placeholder="レポート表紙に印字されます"></div>`,
    `<button class="btn" onclick="closeModal()">キャンセル</button>
     <button class="btn primary" onclick="db.office=gv('of-name');saveDB();closeModal()">保存</button>`);
}
function createCase(){ const c=newCase(); db.cases.push(c); db.activeId=c.id; ui.step=0; saveDB(); render(); }
function openCase(id){ db.activeId=id; ui.step=0; saveDB(); render(); }
function dupCase(id){
  const src=db.cases.find(c=>c.id===id); if(!src) return;
  const c=JSON.parse(JSON.stringify(src)); c.id=uid(); c.caseName=(c.caseName||'無題')+'（複製）'; c.fixed=false;
  db.cases.push(c); saveDB(); render();
}
function delCase(id){
  if(!confirm('この案件を削除します。よろしいですか？')) return;
  db.cases=db.cases.filter(c=>c.id!==id);
  if(db.activeId===id) db.activeId=null;
  saveDB(); render();
}
function createSample(){
  const c=buildSampleCase();
  db.cases.push(c); db.activeId=c.id; ui.step=0; saveDB(); render();
}
function buildSampleCase(){
  const c=newCase();
  c.caseName='サンプル相続'; c.decedent={name:'山田 太郎',kana:'やまだ たろう',birth:'1950-05-10',address:'東京都杉並区○○1-2-3'};
  c.client={name:'山田 花子',kana:'やまだ はなこ',tel:'',email:''};
  const sp={id:uid(),rel:'配偶者',name:'山田 花子',kana:'やまだ はなこ',birth:'1955-08-01',dead:false,daishuFrom:''};
  const s1={id:uid(),rel:'子',name:'山田 一郎',kana:'やまだ いちろう',birth:'1980-04-15',dead:false,daishuFrom:''};
  const s2={id:uid(),rel:'子',name:'山田 二美',kana:'やまだ ふみ',birth:'1983-11-03',dead:false,daishuFrom:''};
  c.heirs=[sp,s1,s2];
  const S=c.scenarios[0];
  S.assets.deposits=[
    {id:uid(),name:'みらい銀行',branch:'本店',kind:'普通預金',number:'1234567',unit:25000000,qty:1,memo:''},
    {id:uid(),name:'ゆうびん貯金',branch:'',kind:'定期預金',number:'',unit:15000000,qty:1,memo:''}];
  S.assets.securities=[{id:uid(),name:'つばさ証券',branch:'',kind:'投資信託',number:'',unit:10000,qty:1000,memo:''}];
  S.assets.minashi=[{id:uid(),name:'あんしん生命',kind:'死亡保険金',receiver:sp.id,value:30000000,memo:''}];
  const land=newRERow();
  Object.assign(land,{name:'自宅の土地（杉並区）',kind:'land',method:'rosenka',district:4,
    rosenka:300000,kariwariMark:'D',kariwari:0.6,area:150,maguchi:10,okuyuki:15,
    rights:'自用地',tokureiCat:'kyoju',tokureiArea:150,market:60000000});
  const bld=newRERow();
  Object.assign(bld,{name:'自宅の建物',kind:'building',koteiHyoka:8000000,rights:'自用',area:100});
  S.assets.realestate=[land,bld];
  S.assets.debts=[{id:uid(),name:'葬儀一式',kind:'葬儀費用',value:2000000,memo:''}];
  // 法定相続分で配分済みの状態にしておく（開いてすぐ税額が見える）
  const LH=legalHeirs(c); const pcts={};
  c.heirs.forEach(h=>pcts[h.id]=(LH.shares[h.id]||0)*100);
  applyPctsToScenario(c,S,pcts);
  return c;
}

/* ---------- 基本情報 ---------- */
function renderBasic(c){
  view.innerHTML=`
   <h2 class="page">基本情報入力</h2>
   <p class="desc">シミュレーションの基本情報を入力してください。</p>
   <div class="card"><h3>基本情報</h3>
     <div class="frow"><label>計算基準日<span class="req">必須</span></label><input type="date" value="${esc(c.baseDate)}" onchange="upd('baseDate',this.value)"></div>
     <div class="frow"><label>案件名<span class="req">必須</span></label><input type="text" placeholder="例: 山田家相続2026" value="${esc(c.caseName)}" onchange="upd('caseName',this.value)"></div>
   </div>
   <div class="card"><h3>被相続人（亡くなられた方・対策を検討する方）</h3>
     <div class="frow"><label>氏名<span class="req">必須</span></label><input type="text" value="${esc(c.decedent.name)}" onchange="upd('decedent.name',this.value)"></div>
     <div class="frow"><label>ふりがな</label><input type="text" value="${esc(c.decedent.kana)}" onchange="upd('decedent.kana',this.value)"></div>
     <div class="frow"><label>生年月日</label><input type="date" value="${esc(c.decedent.birth)}" onchange="upd('decedent.birth',this.value)"></div>
     <div class="frow"><label>満年齢</label><input type="text" value="${age(c.decedent.birth,c.baseDate)}" disabled></div>
     <div class="frow"><label>住所</label><input type="text" value="${esc(c.decedent.address)}" onchange="upd('decedent.address',this.value)"></div>
   </div>
   <div class="card"><h3>前回相続の情報（任意・相次相続控除）</h3>
     <p class="desc" style="margin-bottom:8px">10年以内に前回の相続で相続税を納めている場合、控除が受けられます。</p>
     <div class="frow"><label>前回相続の開始日</label><input type="date" value="${esc(c.prev.date)}" onchange="upd('prev.date',this.value)"></div>
     <div class="frow"><label>前回相続の相続税額（A）</label><input type="number" value="${esc(c.prev.taxA)}" onchange="upd('prev.taxA',this.value)" placeholder="円"></div>
     <div class="frow"><label>前回相続の取得財産価額（B）</label><input type="number" value="${esc(c.prev.assetB)}" onchange="upd('prev.assetB',this.value)" placeholder="円"></div>
   </div>
   <div class="card"><h3>依頼人</h3>
     <div class="frow"><label>氏名</label><input type="text" value="${esc(c.client.name)}" onchange="upd('client.name',this.value)"></div>
     <div class="frow"><label>ふりがな</label><input type="text" value="${esc(c.client.kana)}" onchange="upd('client.kana',this.value)"></div>
     <div class="frow"><label>電話番号</label><input type="text" value="${esc(c.client.tel)}" onchange="upd('client.tel',this.value)"></div>
     <div class="frow"><label>メールアドレス</label><input type="text" value="${esc(c.client.email)}" onchange="upd('client.email',this.value)"></div>
   </div>
   ${navButtons()}`;
}
function upd(path,val){
  const c=activeCase(); if(!c) return;
  const ks=path.split('.'); let o=c;
  while(ks.length>1) o=o[ks.shift()];
  o[ks[0]]=val; saveDB();
  document.getElementById('hd-case').textContent=c.caseName||'（無題の案件）';
}

/* ---------- 親族構成 ---------- */
function renderFamily(c){
  const LH=legalHeirs(c);
  const rows=c.heirs.map(h=>{
    const isL=LH.heirs.some(x=>x.id===h.id);
    const badge=h.dead?'<span class="badge no-heir">死亡</span>'
      :isL?(h.rel==='配偶者'?'<span class="badge spouse">法定相続人（配偶者）</span>':`<span class="badge heir">法定相続人（${((LH.shares[h.id]||0)*100).toFixed(1)}%）</span>`)
      :'<span class="badge no-heir">相続権なし</span>';
    return `<tr>
      <td>${esc(h.rel)}</td><td>${esc(h.name)}</td><td>${esc(h.kana)}</td>
      <td>${esc(h.birth)}</td><td class="num">${age(h.birth,c.baseDate)}</td>
      <td>${esc(h.daishuFrom||'')}</td><td>${badge}</td>
      <td><button class="btn sm" onclick="heirModal('${h.id}')">編集</button>
          <button class="btn sm danger" onclick="delHeir('${h.id}')">削除</button></td></tr>`;
  }).join('');
  view.innerHTML=`
   <h2 class="page">親族構成一覧</h2>
   <p class="desc">被相続人の親族情報を入力してください（法定相続人を自動判定します）。</p>
   <div class="notice">配偶者は常に相続人。第1順位: 子・孫（代襲）／ 第2順位: 父母・祖父母 ／ 第3順位: 兄弟姉妹・甥姪（代襲）</div>
   <div class="card">
     <table class="list">
       <tr><th>続柄</th><th>氏名</th><th>ふりがな</th><th>生年月日</th><th class="num">満年齢</th><th>代襲元</th><th>判定</th><th>操作</th></tr>
       ${rows||'<tr><td colspan="8" class="empty">親族が未登録です</td></tr>'}
     </table>
     <div class="toolbar">
       <button class="btn primary" onclick="heirModal()">＋ 行追加</button>
       <button class="btn gold" onclick="quickFamily()">標準構成で簡易入力（配偶者・長男・長女）</button>
     </div>
     ${c.heirs.length?`<div class="card" style="margin-top:10px"><h3>家族関係図（自動生成）</h3>${familyTreeSVG(c)}</div>`:''}
   </div>
   ${navButtons()}`;
}
function quickFamily(){
  const c=activeCase();
  c.heirs.push(
    {id:uid(),rel:'配偶者',name:'配偶者',kana:'',birth:'',dead:false,daishuFrom:''},
    {id:uid(),rel:'子',name:'長男',kana:'',birth:'',dead:false,daishuFrom:''},
    {id:uid(),rel:'子',name:'長女',kana:'',birth:'',dead:false,daishuFrom:''});
  saveDB(); render();
}
function delHeir(id){
  const c=activeCase();
  if(!confirm('この親族を削除しますか？')) return;
  c.heirs=c.heirs.filter(h=>h.id!==id);
  c.scenarios.forEach(S=>{ for(const al of Object.values(S.alloc)) delete al[id]; });
  saveDB(); render();
}
function heirModal(id){
  const c=activeCase();
  const h=id?c.heirs.find(x=>x.id===id):{id:'',rel:'子',name:'',kana:'',birth:'',dead:false,daishuFrom:''};
  openModal('親族情報の'+(id?'編集':'追加'),`
    <div class="frow"><label>続柄<span class="req">必須</span></label>
      <select id="f-rel">${REL_OPTIONS.map(r=>`<option ${r===h.rel?'selected':''}>${r}</option>`).join('')}</select></div>
    <div class="frow"><label>氏名<span class="req">必須</span></label><input type="text" id="f-name" value="${esc(h.name)}"></div>
    <div class="frow"><label>ふりがな</label><input type="text" id="f-kana" value="${esc(h.kana)}"></div>
    <div class="frow"><label>生年月日</label><input type="date" id="f-birth" value="${esc(h.birth)}"></div>
    <div class="frow"><label>代襲元（親の氏名）</label><input type="text" id="f-daishu" value="${esc(h.daishuFrom)}" placeholder="代襲相続の場合のみ"></div>
    <div class="frow"><label>死亡（相続権なし）</label><input type="checkbox" id="f-dead" ${h.dead?'checked':''} style="width:auto"></div>`,
    `<button class="btn" onclick="closeModal()">キャンセル</button>
     <button class="btn primary" onclick="saveHeir('${id||''}')">保存</button>`);
}
function saveHeir(id){
  const c=activeCase();
  const data={rel:gv('f-rel'),name:gv('f-name'),kana:gv('f-kana'),birth:gv('f-birth'),
              daishuFrom:gv('f-daishu'),dead:document.getElementById('f-dead').checked};
  if(!data.name){alert('氏名を入力してください');return;}
  if(id){ Object.assign(c.heirs.find(h=>h.id===id),data); }
  else c.heirs.push({id:uid(),...data});
  saveDB(); closeModal(); render();
}
function gv(id){ return document.getElementById(id)?.value||''; }

/* ---------- 財産（汎用カテゴリ） ---------- */
function renderAssets(c,cat){
  const S=activeScenario(c);
  const cfg=ASSET_CATS[cat];
  const isTaisaku=S.type!=='現状';
  const rows=S.assets[cat].map((r,i)=>{
    const v=taxableRowValue(cat,r);
    const d=rowDiff(c,cat,r);
    const cols=[];
    cols.push(`<td>${i+1}</td><td class="${r.gift&&!r.giftAdd?'row-gift':''}">${diffBadge(d,r)}${esc(r.name)}</td>`);
    if(cfg.fields.some(f=>f.startsWith('branch'))) cols.push(`<td>${esc(r.branch||'')}</td>`);
    if(cfg.kinds.length) cols.push(`<td>${esc(r.kind||'')}</td>`);
    if(cat==='minashi') cols.push(`<td>${esc(heirName(c,r.receiver))}</td>`);
    if(cfg.unitQty) cols.push(`<td class="num">${yen(r.unit)}</td><td class="num">${yen(r.qty)}</td>`);
    cols.push(`<td class="num"><b>${r.gift&&!r.giftAdd?'—':yen(v)}</b></td>`);
    cols.push(`<td>${esc(r.memo||'')}</td>`);
    cols.push(`<td><button class="btn sm" onclick="assetModal('${cat}','${r.id}')">編集</button>
      ${isTaisaku?taisakuBtns(cat,r):''}
      <button class="btn sm danger" onclick="delAsset('${cat}','${r.id}')">削除</button></td>`);
    return `<tr>${cols.join('')}</tr>`;
  }).join('');
  const head=['No','品名・名称'];
  if(cfg.fields.some(f=>f.startsWith('branch'))) head.push('支店名等');
  if(cfg.kinds.length) head.push('種類');
  if(cat==='minashi') head.push('受取人');
  if(cfg.unitQty) head.push('単価','口数');
  head.push('評価額','メモ','操作');
  const total=S.assets[cat].filter(rowInEstate).reduce((a,r)=>a+taxableRowValue(cat,r),0);
  view.innerHTML=`
   <h2 class="page">財産目録入力 ${cfg.label}一覧</h2>
   ${scnTabs(c)}
   <p class="desc">財産目録を入力してください。${cat==='minashi'?'死亡保険金・死亡退職金は法定相続人の受取分に非課税枠（500万円×法定相続人の数）が適用されます。':''}
   ${isTaisaku?'対策ケースでは「贈与」「信託」ボタンで生前対策を反映できます。':''}</p>
   <div class="card">
     <table class="list">
       <tr>${head.map(h=>`<th>${h}</th>`).join('')}</tr>
       ${rows||`<tr><td colspan="${head.length}" class="empty">データがありません</td></tr>`}
       ${rows?`<tr><td colspan="${head.length}" style="text-align:right;background:#fdf6e3"><b>合計評価額（課税対象）: ${yen(total)} 円</b></td></tr>`:''}
     </table>
     <div class="toolbar"><button class="btn primary" onclick="assetModal('${cat}')">＋ 行追加</button></div>
   </div>
   ${navButtons()}`;
}
function taisakuBtns(cat,r){
  return `<button class="btn sm ${r.gift?'gold':'ghost'}" title="生前贈与する対策" onclick="toggleGift('${cat}','${r.id}')">贈与</button>
    <button class="btn sm ${r.trust?'gold':'ghost'}" title="信託へ移転" onclick="toggleTrust('${cat}','${r.id}')">信託</button>`;
}
function toggleGift(cat,id){
  const S=activeScenario(activeCase());
  const r=S.assets[cat].find(x=>x.id===id);
  if(!r.gift){
    openModal('生前贈与の設定',`
      <p class="desc" style="margin-bottom:10px">この財産を生前贈与した場合のシミュレーションです。相続開始前7年以内の贈与（暦年課税）は相続財産に加算されます。</p>
      <div class="frow"><label>加算の扱い</label><select id="gift-add">
        <option value="0">加算対象外（7年より前の贈与・相続時精算課税の基礎控除内など）</option>
        <option value="1">加算対象（7年以内の暦年贈与など・課税価格に含める）</option></select></div>`,
      `<button class="btn" onclick="closeModal()">キャンセル</button>
       <button class="btn primary" onclick="applyGift('${cat}','${id}')">設定</button>`);
  } else { r.gift=false; r.giftAdd=false; saveDB(); render(); }
}
function applyGift(cat,id){
  const S=activeScenario(activeCase());
  const r=S.assets[cat].find(x=>x.id===id);
  r.gift=true; r.giftAdd=gv('gift-add')==='1';
  saveDB(); closeModal(); render();
}
function toggleTrust(cat,id){
  const S=activeScenario(activeCase());
  const r=S.assets[cat].find(x=>x.id===id);
  r.trust=!r.trust; saveDB(); render();
}
function heirName(c,id){ const h=c.heirs.find(x=>x.id===id); return h?h.name:'（未指定）'; }
function delAsset(cat,id){
  const c=activeCase(); const S=activeScenario(c);
  if(!confirm('この行を削除しますか？')) return;
  S.assets[cat]=S.assets[cat].filter(r=>r.id!==id);
  delete S.alloc[id]; saveDB(); render();
}
function assetModal(cat,id){
  if(cat==='realestate'){ openREEditor(id); return; }
  const c=activeCase(); const S=activeScenario(c); const cfg=ASSET_CATS[cat];
  const r=id?S.assets[cat].find(x=>x.id===id):{};
  let html='';
  for(const f of cfg.fields){
    const [key,labelRaw]=f.split(':');
    const req=labelRaw.endsWith('*'); const label=labelRaw.replace('*','');
    let input;
    if(key==='kind') input=`<select id="a-kind">${cfg.kinds.map(k=>`<option ${k===r.kind?'selected':''}>${k}</option>`).join('')}</select>`;
    else if(key==='receiver') input=`<select id="a-receiver"><option value="">（未指定）</option>${c.heirs.filter(h=>!h.dead).map(h=>`<option value="${h.id}" ${h.id===r.receiver?'selected':''}>${esc(h.name)}（${esc(h.rel)}）</option>`).join('')}</select>`;
    else if(['unit','qty','value'].includes(key)) input=`<input type="number" id="a-${key}" value="${r[key]??''}" placeholder="数値">`;
    else input=`<input type="text" id="a-${key}" value="${esc(r[key]||'')}">`;
    html+=`<div class="frow"><label>${label}${req?'<span class="req">必須</span>':''}</label>${input}</div>`;
  }
  if(cfg.unitQty) html+=`<div class="frow"><label>評価額（自動計算）</label><input type="text" disabled value="単価 × 口数で自動計算されます"></div>`;
  openModal(cfg.label+'の'+(id?'編集':'追加'),html,
    `<button class="btn" onclick="closeModal()">キャンセル</button>
     <button class="btn primary" onclick="saveAsset('${cat}','${id||''}')">${id?'保存':'追加'}</button>`);
}
function saveAsset(cat,id){
  const S=activeScenario(activeCase()); const cfg=ASSET_CATS[cat];
  const data={};
  for(const f of cfg.fields){ const key=f.split(':')[0]; data[key]=gv('a-'+key); }
  if(!data.name){alert('品名・名称を入力してください');return;}
  if(cfg.unitQty&&num(data.unit)<=0){alert('単価を入力してください');return;}
  if(id) Object.assign(S.assets[cat].find(x=>x.id===id),data);
  else S.assets[cat].push({id:uid(),...data});
  saveDB(); closeModal(); render();
}

/* ---------- 不動産一覧 ---------- */
function renderREList(c){
  const S=activeScenario(c);
  const isTaisaku=S.type!=='現状';
  const kindLabel={land:'土地',building:'建物',mansion:'マンション'};
  const methodLabel={rosenka:'路線価方式',bairitsu:'倍率方式',kani:'簡易入力'};
  const rows=S.assets.realestate.map((r,i)=>{
    const v0=valuateRE(r).value;
    const v=reValue(r);
    const d=rowDiff(c,'realestate',r);
    const tk=TOKUREI_DEFS[r.tokureiCat||'none'];
    return `<tr>
      <td>${i+1}</td>
      <td class="${r.gift&&!r.giftAdd?'row-gift':''}">${diffBadge(d,r)}${esc(r.name)}</td>
      <td>${kindLabel[r.kind]||esc(r.kind||'')}</td>
      <td>${r.kind==='mansion'?'区分所有補正':r.kind==='building'?'固定資産税評価':methodLabel[r.method]||''}</td>
      <td class="num">${esc(r.area||r.senyuArea||'')}</td>
      <td>${tk&&tk.rate?`<span class="badge heir">${tk.short} ${esc(r.tokureiArea||'')}㎡</span>`:'—'}</td>
      <td class="num">${yen(v0)}</td>
      <td class="num"><b>${r.gift&&!r.giftAdd?'—':yen(v)}</b></td>
      <td><button class="btn sm primary" onclick="openREEditor('${r.id}')">編集</button>
        ${r.kind==='land'?`<button class="btn sm gold" onclick="openStrategy('${r.id}')" title="売却・賃貸経営の比較">活用</button>`:''}
        ${isTaisaku?taisakuBtns('realestate',r):''}
        <button class="btn sm danger" onclick="delAsset('realestate','${r.id}')">削除</button></td></tr>`;
  }).join('');
  const usage=tokureiUsage(S.assets.realestate.filter(rowInEstate));
  view.innerHTML=`
   <h2 class="page">財産目録入力 不動産一覧</h2>
   ${scnTabs(c)}
   <p class="desc">「行追加」から土地・建物・マンションを登録します。路線価方式の補正計算・倍率方式・区分所有補正率（令和6年改正）に対応しています。</p>
   <div class="card">
     <table class="list">
       <tr><th>No</th><th>名称・所在</th><th>種類</th><th>評価方式</th><th class="num">面積(㎡)</th><th>小規模宅地特例</th><th class="num">評価額</th><th class="num">特例適用後</th><th>操作</th></tr>
       ${rows||'<tr><td colspan="9" class="empty">データがありません。「行追加」から登録してください</td></tr>'}
     </table>
     <div class="toolbar">
       <button class="btn primary" onclick="openREEditor()">＋ 行追加（土地・建物・マンション）</button>
     </div>
     ${S.assets.realestate.length?tokureiUsageBar(usage):''}
   </div>
   ${navButtons()}`;
}
function tokureiUsageBar(u){
  const bar=(label,used,limit)=>{
    const pct=Math.min(100,used/limit*100);
    const cls=used>limit+0.001?'over':pct>=70?'near':'ok';
    return `<div class="usage-row"><span class="ul">${label}</span>
      <div class="usage-bar"><div class="usage-fill ${cls}" style="width:${Math.min(100,pct)}%"></div></div>
      <span class="uv ${cls}">${used.toFixed(0)}㎡ / ${limit}㎡</span></div>`;
  };
  let html=`<div style="margin-top:12px"><b style="font-size:12px">小規模宅地等の特例 限度面積の使用状況</b>`;
  html+=bar('特定居住用（330㎡）',u.kyoju,330);
  html+=bar('特定事業用（400㎡）',u.jigyo,400);
  html+=bar('貸付事業用（200㎡）',u.kashitsuke,200);
  if(u.usesKashitsuke) html+=`<div class="hint">貸付用と併用時の調整面積: ${u.heiyo.toFixed(1)}㎡ / 200㎡ ${u.ok?'✅':'<span style="color:var(--danger)">⚠ 限度超過（計算画面の最適化で調整できます）</span>'}</div>`;
  return html+'</div>';
}

/* ---------- 分割と税額計算 ---------- */
function renderCalc(c){
  const S=activeScenario(c);
  const t=calcTax(c,S);
  const people=t.people;
  const divisible=[];
  for(const cat of Object.keys(ASSET_CATS)){
    if(cat==='minashi') continue;
    for(const row of S.assets[cat]) if(rowInEstate(row)) divisible.push({cat,row});
  }
  const allocRows=divisible.map(({cat,row})=>{
    const v=taxableRowValue(cat,row);
    const al=S.alloc[row.id]||{};
    const sum=people.reduce((a,p)=>a+num(al[p.id]),0);
    const ok=Math.abs(sum-v)<=1;
    return `<tr>
      <td>${ASSET_CATS[cat].label}<br><small>${esc(row.name)}</small></td>
      <td class="num">${yen(v)}</td>
      ${people.map(p=>`<td class="num"><input class="alloc-input" type="number" value="${al[p.id]??''}"
        onchange="setAlloc('${row.id}','${p.id}',this.value)"></td>`).join('')}
      <td>${ok?'<span class="badge heir">配分済</span>':`<span class="badge warn">未配分 ${yen(v-sum)}</span>`}</td></tr>`;
  }).join('');

  const r=t.result;
  const sumOf=f=>people.reduce((a,p)=>a+(f(r[p.id],p)||0),0);
  const resultTable=`
   <table class="result">
    <tr><th>項目名</th><th>合計額</th>${people.map(p=>`<th>${esc(p.name)}</th>`).join('')}</tr>
    <tr><td>法定相続人の数</td><td>${t.n}</td>${people.map(p=>`<td>${t.LH.heirs.some(h=>h.id===p.id)?1:0}</td>`).join('')}</tr>
    <tr><td>課税価格（取得額）</td><td>${yen(t.taxBaseTotal)}</td>${people.map(p=>`<td>${yen(t.taxBase[p.id])}</td>`).join('')}</tr>
    <tr><td>基礎控除の額</td><td>${yen(t.basicDeduction)}</td><td colspan="${people.length}">3,000万円 + 600万円 × ${t.n}人</td></tr>
    <tr><td>生命保険金非課税枠</td><td>${yen(t.lifeExempt)}</td><td colspan="${people.length}">上限 500万円 × ${t.n}人</td></tr>
    <tr><td>死亡退職金非課税枠</td><td>${yen(t.retireExempt)}</td><td colspan="${people.length}">上限 500万円 × ${t.n}人</td></tr>
    ${t.giftExcluded?`<tr><td>生前贈与により除外</td><td>▲${yen(t.giftExcluded)}</td><td colspan="${people.length}">贈与税は別途（暦年110万円/年 基礎控除）</td></tr>`:''}
    <tr><td>課税遺産総額</td><td>${yen(t.taxableEstate)}</td><td colspan="${people.length}">課税価格合計 − 基礎控除</td></tr>
    <tr><td>法定相続分（%）</td><td>100</td>${people.map(p=>`<td>${((t.LH.shares[p.id]||0)*100).toFixed(1)}</td>`).join('')}</tr>
    <tr><td>法定相続分で仮按分</td><td>-</td>${people.map(p=>`<td>${yen(t.hypo[p.id]?.hypoAmt)}</td>`).join('')}</tr>
    <tr><td>相続税率（%）</td><td>-</td>${people.map(p=>`<td>${t.hypo[p.id]?(t.hypo[p.id].rate*100):'-'}</td>`).join('')}</tr>
    <tr class="total"><td>相続税の総額</td><td>${yen(t.totalTax)}</td><td colspan="${people.length}"></td></tr>
    <tr><td>実際の取得割合（%）</td><td>100</td>${people.map(p=>`<td>${(r[p.id].ratio*100).toFixed(1)}</td>`).join('')}</tr>
    <tr><td>各人の算出税額</td><td>${yen(sumOf(x=>x.tax))}</td>${people.map(p=>`<td>${yen(r[p.id].tax)}</td>`).join('')}</tr>
    <tr><td>2割加算</td><td>${yen(sumOf(x=>x.kasan))}</td>${people.map(p=>`<td>${yen(r[p.id].kasan)}</td>`).join('')}</tr>
    <tr><td>配偶者の税額軽減</td><td>▲${yen(sumOf(x=>x.spouseDed))}</td>${people.map(p=>`<td>${r[p.id].spouseDed?('▲'+yen(r[p.id].spouseDed)):'0'}</td>`).join('')}</tr>
    <tr><td>相次相続控除</td><td>▲${yen(sumOf(x=>x.soji))}</td>${people.map(p=>`<td>${r[p.id].soji?('▲'+yen(r[p.id].soji)):'0'}</td>`).join('')}</tr>
    <tr class="total"><td>各人の相続税納税額</td><td>${yen(t.totalPay)}</td>${people.map(p=>`<td>${yen(r[p.id].pay)}</td>`).join('')}</tr>
   </table>`;

  const shares=t.LH;
  const shareTable=`
   <table class="result"><tr><th>法定相続人</th><th>法定相続分</th><th>法定相続分相当額</th></tr>
   ${shares.heirs.map(h=>`<tr><td>${esc(h.name)}</td><td>${((shares.shares[h.id]||0)*100).toFixed(1)}%</td>
     <td>${yen(t.taxBaseTotal*(shares.shares[h.id]||0))} 円</td></tr>`).join('')}</table>`;
  const iryu=iryubun(c);
  const iryuTable=`
   <table class="result"><tr><th>相続人</th><th>遺留分割合</th><th>遺留分相当額</th></tr>
   ${iryu.map(x=>`<tr><td>${esc(x.h.name)}</td><td>${(x.ratio*100).toFixed(1)}%</td>
     <td>${yen(t.taxBaseTotal*x.ratio)} 円</td></tr>`).join('')}</table>`;

  view.innerHTML=`
   <h2 class="page">財産総額と相続税概算</h2>
   ${scnTabs(c)}
   <p class="desc">各相続人へ財産を配分すると、相続税の概算が自動計算されます。</p>
   <div class="kpi-wrap">
     <div class="kpi"><div class="t">財産総額（課税評価）</div><div class="v">${yen(t.totalAssets)} 円</div></div>
     <div class="kpi teal"><div class="t">課税価格の合計</div><div class="v">${yen(t.taxBaseTotal)} 円</div></div>
     <div class="kpi gold"><div class="t">相続税納税額合計</div><div class="v">${yen(t.totalPay)} 円</div></div>
   </div>
   ${c.scenarios.length>1?scnCompare(c):''}
   ${t.unallocated?`<div class="notice">未配分の財産が ${t.unallocated} 件あります。「一括評価額分配」または各欄への入力で配分してください。</div>`:''}
   <div class="card"><h3>小規模宅地等の特例</h3>
     <div class="toolbar" style="margin:0 0 8px">
       <button class="btn gold" onclick="runTokureiOpt()">⚡ 特例の最適化（税負担が最小の組合せを自動計算）</button>
     </div>
     ${tokureiUsageBar(tokureiUsage(S.assets.realestate.filter(rowInEstate)))}
   </div>
   <div class="card"><h3>各人の取得額（財産の配分）</h3>
     <div class="toolbar">
       <button class="btn navy" onclick="bulkAllocModal()">一括評価額分配</button>
       <button class="btn gold" onclick="openDivisionOpt()">⚡ 最適分割の提案（二次相続まで考慮）</button>
       <button class="btn ghost" onclick="clearAlloc()">配分をクリア</button>
     </div>
     <div style="overflow-x:auto">
     <table class="list">
      <tr><th>財産</th><th class="num">評価額</th>${people.map(p=>`<th>${esc(p.name)}</th>`).join('')}<th>状態</th></tr>
      ${allocRows||`<tr><td colspan="${3+people.length}" class="empty">財産が未登録です</td></tr>`}
     </table></div>
   </div>
   <div class="card"><h3>各人の相続税納付額</h3><div style="overflow-x:auto">${resultTable}</div></div>
   <div class="card"><h3>法定相続分相当額</h3>${shareTable}</div>
   <div class="card"><h3>遺留分相当額</h3>${iryuTable}</div>
   <div class="card no-print"><h3>グラフ（取得額と納税額）</h3><canvas id="chart" width="860" height="300"></canvas></div>
   <div class="toolbar">
     <button class="btn navy" onclick="openReport()">📄 レポートを作成</button>
   </div>
   ${navButtons()}`;
  drawChart(c,t);
}
/* シナリオ比較テーブル（差分ハイライト） */
function scnCompare(c){
  const results=c.scenarios.map(s=>({s, t:calcTax(c,s)}));
  const base=results.find(x=>x.s.type==='現状')||results[0];
  const people=base.t.people;
  const diffCell=(v,bv,inverse)=>{
    if(v===bv) return `<td class="num">${yen(v)}</td>`;
    const better=inverse?v>bv:v<bv;
    return `<td class="num ${better?'diff-good':'diff-bad'}">${yen(v)}<br><small>${v>bv?'+':'▲'}${yen(Math.abs(v-bv))}</small></td>`;
  };
  return `<div class="card"><h3>ケース比較（現状 vs 対策）</h3>
   <div style="overflow-x:auto"><table class="result">
    <tr><th>項目</th>${results.map(x=>`<th>${esc(x.s.name)}<br><small>${x.s.type}</small></th>`).join('')}</tr>
    <tr><td>課税価格の合計</td>${results.map(x=>diffCell(x.t.taxBaseTotal,base.t.taxBaseTotal)).join('')}</tr>
    <tr><td>課税遺産総額</td>${results.map(x=>diffCell(x.t.taxableEstate,base.t.taxableEstate)).join('')}</tr>
    <tr><td>相続税の総額</td>${results.map(x=>diffCell(x.t.totalTax,base.t.totalTax)).join('')}</tr>
    <tr class="total"><td>納税額合計</td>${results.map(x=>diffCell(x.t.totalPay,base.t.totalPay)).join('')}</tr>
    ${people.map(p=>`<tr><td>　${esc(p.name)} の納税額</td>${results.map(x=>diffCell(x.t.result[p.id]?x.t.result[p.id].pay:0,(base.t.result[p.id]||{}).pay||0)).join('')}</tr>`).join('')}
   </table></div>
   <p class="desc">緑=現状より減少 ／ 赤=現状より増加。贈与除外分には別途贈与税がかかる場合があります。</p></div>`;
}
function runTokureiOpt(){
  const c=activeCase(); const S=activeScenario(c);
  const rows=S.assets.realestate.filter(rowInEstate);
  const opt=optimizeTokurei(rows);
  if(!opt.detail.length){ alert('特例区分が設定された土地がありません。不動産の編集画面で「小規模宅地等の特例」の区分を選択してください。'); return; }
  openModal('小規模宅地等の特例 最適化結果',`
    <p class="desc" style="margin-bottom:10px">採用方式: <b>${esc(opt.mode)}</b></p>
    <table class="list"><tr><th>土地</th><th>区分</th><th class="num">適用面積</th><th class="num">減額見込み</th></tr>
    ${opt.detail.map(d=>{
      const row=rows.find(r=>r.id===d.id);
      return `<tr><td>${esc(row.name)}</td><td>${TOKUREI_DEFS[d.cat].short}</td>
        <td class="num">${d.applied}㎡</td><td class="num">▲${yen(d.reduction)}円</td></tr>`;
    }).join('')}
    <tr><td colspan="3" style="text-align:right"><b>減額合計</b></td><td class="num"><b>▲${yen(opt.total)}円</b></td></tr></table>
    <p class="desc" style="margin-top:8px">※ 適用には取得者の要件（配偶者・同居親族等）があります。適用の可否は税理士にご確認ください。</p>`,
    `<button class="btn" onclick="closeModal()">キャンセル</button>
     <button class="btn primary" onclick="applyTokureiOpt()">この配分を適用する</button>`);
  window._tokureiOpt=opt;
}
function applyTokureiOpt(){
  const S=activeScenario(activeCase());
  const opt=window._tokureiOpt; if(!opt) return;
  for(const d of opt.detail){
    const row=S.assets.realestate.find(r=>r.id===d.id);
    if(row) row.tokureiArea=d.applied;
  }
  // 特例区分があるのに配分ゼロの土地は0に
  saveDB(); closeModal(); render();
}
function setAlloc(rowId,heirId,val){
  const S=activeScenario(activeCase());
  S.alloc[rowId]=S.alloc[rowId]||{};
  S.alloc[rowId][heirId]=num(val);
  saveDB(); render();
}
function clearAlloc(){
  const S=activeScenario(activeCase());
  if(!confirm('このケースの配分をすべてクリアしますか？')) return;
  S.alloc={}; saveDB(); render();
}
function bulkAllocModal(){
  const c=activeCase(); const LH=legalHeirs(c);
  const people=c.heirs.filter(h=>!h.dead);
  const defaults=people.map(p=>Math.round((LH.shares[p.id]||0)*1000)/10);
  openModal('評価額の一括分配',`
    <div class="notice">各相続人の割合（合計100%）を設定すると、すべての財産・債務に一括で反映されます。</div>
    ${people.map((p,i)=>`<div class="frow"><label>${esc(p.name)}（${esc(p.rel)}）</label>
      <input type="number" step="0.1" id="pct-${p.id}" value="${defaults[i]}" style="max-width:140px"> %</div>`).join('')}
    <div class="toolbar">
      <button class="btn sm" onclick="presetPct('even')">均等配分にする</button>
      <button class="btn sm" onclick="presetPct('legal')">法定相続分で配分</button>
    </div>`,
    `<button class="btn" onclick="closeModal()">キャンセル</button>
     <button class="btn primary" onclick="applyBulkAlloc()">一括適用を実行</button>`);
}
function presetPct(mode){
  const c=activeCase(); const LH=legalHeirs(c);
  const people=c.heirs.filter(h=>!h.dead);
  people.forEach(p=>{
    const v=mode==='even'?Math.round(1000/people.length)/10:Math.round((LH.shares[p.id]||0)*1000)/10;
    const el=document.getElementById('pct-'+p.id); if(el) el.value=v;
  });
}
function applyBulkAlloc(){
  const c=activeCase(); const S=activeScenario(c);
  const people=c.heirs.filter(h=>!h.dead);
  const pcts={}; let sum=0;
  for(const p of people){ pcts[p.id]=num(gv('pct-'+p.id)); sum+=pcts[p.id]; }
  if(Math.abs(sum-100)>0.5){ alert('合計が100%になるように入力してください（現在 '+sum.toFixed(1)+'%）'); return; }
  for(const cat of Object.keys(ASSET_CATS)){
    if(cat==='minashi') continue;
    for(const row of S.assets[cat]){
      if(!rowInEstate(row)) continue;
      const v=taxableRowValue(cat,row);
      S.alloc[row.id]={};
      let assigned=0; const ids=people.map(p=>p.id);
      ids.forEach((hid,i)=>{
        let amt=i===ids.length-1?v-assigned:Math.floor(v*pcts[hid]/100);
        S.alloc[row.id][hid]=amt; assigned+=amt;
      });
    }
  }
  saveDB(); closeModal(); render();
}
function drawChart(c,t){
  const cv=document.getElementById('chart'); if(!cv) return;
  const ctx=cv.getContext('2d');
  const people=t.people;
  ctx.clearRect(0,0,cv.width,cv.height);
  if(!people.length) return;
  const max=Math.max(1,...people.map(p=>t.taxBase[p.id]));
  const bw=Math.min(90,(cv.width-80)/(people.length*2.2));
  const baseY=cv.height-40;
  ctx.font='11px sans-serif';
  people.forEach((p,i)=>{
    const x=60+i*(bw*2.2);
    const h1=(t.taxBase[p.id]/max)*(baseY-40);
    const h2=(t.result[p.id].pay/max)*(baseY-40);
    ctx.fillStyle='#2a9d8f'; ctx.fillRect(x,baseY-h1,bw,h1);
    ctx.fillStyle='#c9a227'; ctx.fillRect(x+bw+4,baseY-h2,bw,h2);
    ctx.fillStyle='#22303e';
    ctx.fillText(p.name,x,baseY+14);
    ctx.fillText(yen(t.taxBase[p.id]),x,baseY-h1-6);
    if(t.result[p.id].pay) ctx.fillText(yen(t.result[p.id].pay),x+bw+4,baseY-h2-6);
  });
  ctx.fillStyle='#2a9d8f'; ctx.fillRect(cv.width-190,10,12,12);
  ctx.fillStyle='#22303e'; ctx.fillText('取得額（課税価格）',cv.width-172,20);
  ctx.fillStyle='#c9a227'; ctx.fillRect(cv.width-190,28,12,12);
  ctx.fillStyle='#22303e'; ctx.fillText('納税額',cv.width-172,38);
}

/* ---------- 完了・レポート ---------- */
function renderDone(c){
  const t=calcTax(c);
  view.innerHTML=`
   <h2 class="page">入力完了</h2>
   <p class="desc">入力内容の確認・レポート出力・データの保存を行います。</p>
   <div class="kpi-wrap">
     <div class="kpi"><div class="t">課税価格の合計</div><div class="v">${yen(t.taxBaseTotal)} 円</div></div>
     <div class="kpi teal"><div class="t">基礎控除後の課税遺産総額</div><div class="v">${yen(t.taxableEstate)} 円</div></div>
     <div class="kpi gold"><div class="t">相続税納税額合計</div><div class="v">${yen(t.totalPay)} 円</div></div>
   </div>
   <div class="card"><h3>案件情報</h3>
     <table class="list">
       <tr><td>案件名</td><td>${esc(c.caseName)||'（無題）'}</td></tr>
       <tr><td>被相続人</td><td>${esc(c.decedent.name)}</td></tr>
       <tr><td>計算基準日</td><td>${esc(c.baseDate)}</td></tr>
       <tr><td>法定相続人</td><td>${t.LH.heirs.map(h=>esc(h.name)).join('、')||'（未登録）'}</td></tr>
       <tr><td>ケース</td><td>${c.scenarios.map(s=>esc(s.name)).join(' / ')}</td></tr>
       <tr><td>状態</td><td>${c.fixed?'<span class="badge warn">確定済</span>':'編集中'}</td></tr>
     </table>
   </div>
   <div class="toolbar">
     <button class="btn navy" onclick="openReport()">📄 プロ品質レポートを作成（印刷/PDF）</button>
     <button class="btn primary" onclick="fixCase()">${c.fixed?'確定を解除する':'シミュレーションを確定する'}</button>
     <button class="btn ghost" onclick="exportCase()">JSONエクスポート</button>
     <button class="btn ghost" onclick="document.getElementById('import-file').click()">JSONインポート</button>
     <input type="file" id="import-file" accept=".json" style="display:none" onchange="importCase(this)">
   </div>
   ${navButtons()}
   <div class="nav-btns"><button class="btn" onclick="ui.step=-1;render()">← 案件一覧に戻る</button></div>`;
}
function fixCase(){ const c=activeCase(); c.fixed=!c.fixed; saveDB(); render(); }
function exportCase(){
  const c=activeCase();
  const blob=new Blob([JSON.stringify(c,null,2)],{type:'application/json'});
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download=(c.caseName||'simulation')+'.json';
  a.click();
}
function importCase(inp){
  const f=inp.files[0]; if(!f) return;
  const rd=new FileReader();
  rd.onload=()=>{ try{
    const c=JSON.parse(rd.result); c.id=uid(); migrateCase(c);
    db.cases.push(c); db.activeId=c.id; ui.step=0; saveDB(); render();
  }catch(e){ alert('読み込みに失敗しました: '+e.message); } };
  rd.readAsText(f);
}

/* ---------- モーダル ---------- */
function openModal(title,body,foot){
  document.getElementById('m-title').textContent=title;
  document.getElementById('m-body').innerHTML=body;
  document.getElementById('m-foot').innerHTML=foot;
  document.getElementById('modal-bg').classList.add('open');
}
function closeModal(){ document.getElementById('modal-bg').classList.remove('open'); }
