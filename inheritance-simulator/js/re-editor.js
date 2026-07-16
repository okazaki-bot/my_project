"use strict";
/* ============================================================
   不動産入力エディタ
   - 種類（土地/建物/マンション）→ 評価方式 → 項目入力
   - 各項目に書類ガイド、右側にリアルタイム計算過程
============================================================ */

let reDraft=null;      // 編集中の行（保存までの下書き）
let reEditId=null;     // 編集対象id（null=新規）

function newRERow(){
  return {id:uid(), name:'', kind:'', method:'', area:'', maguchi:'', okuyuki:'',
    district:4, rosenka:'', kariwariMark:'D', kariwari:0.6,
    side:[], back:{rosenka:''},
    fuseikei:{on:false,mode:'calc',kagePct:'',soteiW:'',soteiD:''},
    gake:{on:false,area:'',dir:0}, tokkei:{on:false,area:''},
    mudouro:{on:false,tsuroArea:''}, setback:{on:false,area:''}, shido:'none',
    zosei:{on:false,items:[{label:'整地費',qty:'',unit:''},{label:'伐採・抜根費',qty:'',unit:''},{label:'地盤改良費',qty:'',unit:''},{label:'土盛費(m³)',qty:'',unit:''},{label:'土止費',qty:'',unit:''}]},
    koteiHyoka:'', bairitsu:'1.1', value:'',
    rights:'自用地', chintaiRatio:'',
    siteValue:'', siteArea:'', shikichiBunshi:'', shikichiBunbo:'', shikichiRatio:'',
    senyuArea:'', koteiHyokaBld:'', chikunen:'', soukaisu:'', shozaikai:'', chika:false,
    tokureiCat:'none', tokureiArea:'', market:'', memo:'', inputDate:new Date().toISOString().slice(0,10)};
}

function openREEditor(id){
  const S=activeScenario(activeCase());
  reEditId=id||null;
  reDraft = id ? JSON.parse(JSON.stringify(S.assets.realestate.find(r=>r.id===id))) : newRERow();
  // 旧データ互換
  if(!reDraft.kind) reDraft.kind='';
  renderREEditor();
}
function reSet(path,val){
  const ks=path.split('.'); let o=reDraft;
  while(ks.length>1) o=o[ks.shift()];
  o[ks[0]]=val;
  renderREEditor(true);
}
function reSetChk(path,el){ reSet(path, el.checked); }
function reBack(){ reDraft=null; reEditId=null; render(); }
function reSave(){
  if(!reDraft.name){ alert('名称（所在など）を入力してください'); return; }
  if(!reDraft.kind){ alert('種類（土地・建物・マンション）を選択してください'); return; }
  // 借地権割合を記号から反映
  reDraft.kariwari=KARIWARI[reDraft.kariwariMark]||0.6;
  if(num(reDraft.shikichiBunshi)>0&&num(reDraft.shikichiBunbo)>0)
    reDraft.shikichiRatio=num(reDraft.shikichiBunshi)/num(reDraft.shikichiBunbo);
  if(reDraft.tokureiCat!=='none'&&reDraft.tokureiArea===''){
    reDraft.tokureiArea=num(reDraft.area)||num(reDraft.senyuArea)||'';
  }
  const S=activeScenario(activeCase());
  if(reEditId){
    const i=S.assets.realestate.findIndex(r=>r.id===reEditId);
    S.assets.realestate[i]=reDraft;
  } else S.assets.realestate.push(reDraft);
  saveDB(); reBack();
}

/* ---------- 画面 ---------- */
function renderREEditor(keepScroll){
  const sc=keepScroll?window.scrollY:0;
  const r=reDraft;
  let body='';
  // STEP A: 種類
  body+=`<div class="card"><h3>STEP 1　どの不動産ですか？</h3>
    <div class="pick-cards">
      ${pickCard('kind','land','🌏 土地','宅地・畑・駐車場など',r.kind==='land')}
      ${pickCard('kind','building','🏠 建物（一戸建て等）','固定資産税評価額から自動計算',r.kind==='building')}
      ${pickCard('kind','mansion','🏢 分譲マンション','令和6年改正の区分所有補正に対応',r.kind==='mansion')}
    </div></div>`;

  if(r.kind){
    body+=`<div class="card"><h3>名称・メモ</h3>
      <div class="frow"><label>名称・所在<span class="req">必須</span> ${guideBtn(r.kind==='mansion'?'mansion':r.kind==='building'?'touki_building':'touki_land')}</label>
        <input type="text" value="${esc(r.name)}" placeholder="例: 自宅の土地（○○市○○町12-3）" onchange="reSet('name',this.value)"></div>
      <div class="frow"><label>メモ</label><input type="text" value="${esc(r.memo)}" onchange="reSet('memo',this.value)"></div>
    </div>`;
  }

  if(r.kind==='land') body+=renderLandForm(r);
  if(r.kind==='building') body+=renderBuildingForm(r);
  if(r.kind==='mansion') body+=renderMansionForm(r);

  if(r.kind){
    // 小規模宅地等の特例
    body+=`<div class="card"><h3>小規模宅地等の特例（該当する場合）</h3>
      <p class="desc" style="margin-bottom:8px">被相続人の自宅の土地や事業用の土地は、要件を満たすと評価額を大きく減額できます（取得者の要件があります。最終判断は税理士にご確認ください）。</p>
      <div class="frow"><label>特例の区分</label>
        <select onchange="reSet('tokureiCat',this.value)">
          ${Object.entries(TOKUREI_DEFS).map(([k,d])=>`<option value="${k}" ${r.tokureiCat===k?'selected':''}>${d.label}</option>`).join('')}
        </select></div>
      ${r.tokureiCat!=='none'?`<div class="frow"><label>特例を適用する面積(㎡)</label>
        <input type="number" value="${esc(r.tokureiArea)}" placeholder="空欄なら地積全体（限度面積まで）" onchange="reSet('tokureiArea',this.value)"></div>
        <p class="desc">複数の土地がある場合は、計算画面の「特例の最適化」で税負担が最小になる組合せを自動計算できます。</p>`:''}
    </div>`;
    body+=`<div class="frow" style="max-width:400px"><label>時価（任意・参考）</label><input type="number" value="${esc(r.market)}" onchange="reSet('market',this.value)" placeholder="円"></div>`;
  }

  // 計算プレビュー
  let preview='<p class="desc">種類と必須項目を入力すると、ここに計算過程が表示されます。</p>';
  if(r.kind){
    reDraft.kariwari=KARIWARI[r.kariwariMark]||0.6;
    if(num(r.shikichiBunshi)>0&&num(r.shikichiBunbo)>0) r.shikichiRatio=num(r.shikichiBunshi)/num(r.shikichiBunbo);
    const v=valuateRE(r);
    const after=reValue(r);
    preview=`
      ${v.warns&&v.warns.length?`<div class="notice">${v.warns.map(esc).join('<br>')}</div>`:''}
      <table class="calc-steps">
        ${v.steps.map(s=>`<tr><td class="sl">${esc(s.label)}</td><td>${esc(s.text||'')}${s.val!=null?`<div class="sv">${yen(s.val)} 円</div>`:''}</td></tr>`).join('')}
      </table>
      <div class="preview-total">評価額（特例適用前）<b>${yen(v.value)} 円</b></div>
      ${after!==v.value?`<div class="preview-total teal">小規模宅地等特例 適用後 <b>${yen(after)} 円</b></div>`:''}`;
  }

  view.innerHTML=`
   <h2 class="page">不動産の${reEditId?'編集':'追加'}</h2>
   <p class="desc">書類の「📖 どこを見る？」を押すと、登記簿や評価証明書のどの欄を写せばよいか図解が出ます。</p>
   <div class="re-layout">
     <div class="re-form">${body}
       <div class="toolbar">
         <button class="btn" onclick="reBack()">キャンセル</button>
         <button class="btn primary" onclick="reSave()">この内容で${reEditId?'保存':'追加'}する</button>
       </div>
     </div>
     <div class="re-preview"><div class="card sticky"><h3>計算過程（自動更新）</h3>${preview}</div></div>
   </div>`;
  if(keepScroll) window.scrollTo(0,sc);
}
function pickCard(path,val,title,sub,active){
  return `<div class="pick-card ${active?'active':''}" onclick="reSet('${path}','${val}')">
    <div class="pc-title">${title}</div><div class="pc-sub">${sub}</div></div>`;
}

/* ---------- 土地 ---------- */
function renderLandForm(r){
  let html=`<div class="card"><h3>STEP 2　評価方式を選ぶ</h3>
    <p class="desc" style="margin-bottom:8px">国税庁の路線価図（<a href="https://www.rosenka.nta.go.jp" target="_blank">rosenka.nta.go.jp</a>）で住所を検索。道路に数字があれば「路線価方式」、「倍率地域」と書いてあれば「倍率方式」です。${guideBtn('rosenka')}</p>
    <div class="pick-cards">
      ${pickCard('method','rosenka','🛣 路線価方式','市街地。道路に数字がある地域',r.method==='rosenka')}
      ${pickCard('method','bairitsu','📋 倍率方式','郊外など。固定資産税評価額×倍率',r.method==='bairitsu')}
      ${pickCard('method','kani','✏️ 簡易入力','評価額が分かっている・概算でよい',r.method==='kani')}
    </div></div>`;

  if(r.method==='kani'){
    html+=`<div class="card"><h3>STEP 3　評価額</h3>
      <div class="frow"><label>相続税評価額<span class="req">必須</span></label><input type="number" value="${esc(r.value)}" onchange="reSet('value',this.value)" placeholder="円"></div>
      <div class="frow"><label>地積(㎡) ${guideBtn('touki_land')}</label><input type="number" value="${esc(r.area)}" onchange="reSet('area',this.value)" placeholder="特例を使う場合は必須"></div>
      ${rightsBlock(r)}</div>`;
  }
  if(r.method==='bairitsu'){
    html+=`<div class="card"><h3>STEP 3　倍率方式の入力</h3>
      <div class="frow"><label>固定資産税評価額<span class="req">必須</span> ${guideBtn('hyoka')}</label><input type="number" value="${esc(r.koteiHyoka)}" onchange="reSet('koteiHyoka',this.value)" placeholder="評価証明書の「価格」欄"></div>
      <div class="frow"><label>評価倍率<span class="req">必須</span></label><input type="number" step="0.1" value="${esc(r.bairitsu)}" onchange="reSet('bairitsu',this.value)" placeholder="例: 1.1（評価倍率表で確認）"></div>
      <div class="frow"><label>地積(㎡) ${guideBtn('touki_land')}</label><input type="number" value="${esc(r.area)}" onchange="reSet('area',this.value)"></div>
      ${rightsBlock(r)}
      ${zoseiBlock(r)}</div>`;
  }
  if(r.method==='rosenka'){
    html+=`<div class="card"><h3>STEP 3　基本の入力（3つだけ）</h3>
      <div class="frow"><label>正面路線価（円/㎡）<span class="req">必須</span> ${guideBtn('rosenka')}</label>
        <div><input type="number" value="${esc(r.rosenka)}" onchange="reSet('rosenka',this.value)" placeholder="路線価図が「215D」なら 215000">
        <div class="hint">路線価図の数字は千円単位です。215 → 215,000円と入力</div></div></div>
      <div class="frow"><label>借地権割合の記号</label>
        <select onchange="reSet('kariwariMark',this.value)">${Object.entries(KARIWARI).map(([k,v])=>`<option value="${k}" ${r.kariwariMark===k?'selected':''}>${k}（${v*100}%）</option>`).join('')}</select></div>
      <div class="frow"><label>地区区分</label>
        <div><select onchange="reSet('district',parseInt(this.value))">${DISTRICTS.map((d,i)=>`<option value="${i}" ${r.district===i?'selected':''}>${d}${i===4?'（迷ったらこれ）':''}</option>`).join('')}</select>
        <div class="hint">路線価図で数字を囲む図形。無印（囲みなし）は普通住宅地区</div></div></div>
      <div class="frow"><label>地積(㎡)<span class="req">必須</span> ${guideBtn('touki_land')}</label><input type="number" value="${esc(r.area)}" onchange="reSet('area',this.value)" placeholder="登記簿の「地積」"></div>
      <div class="frow"><label>間口距離(m) ${guideBtn('maguchi')}</label><input type="number" step="0.1" value="${esc(r.maguchi)}" onchange="reSet('maguchi',this.value)" placeholder="道路に接する長さ"></div>
      <div class="frow"><label>奥行距離(m)</label>
        <div><input type="number" step="0.1" value="${esc(r.okuyuki)}" onchange="reSet('okuyuki',this.value)">
        ${num(r.area)>0&&num(r.maguchi)>0?`<div class="hint">参考: 地積÷間口 = ${(num(r.area)/num(r.maguchi)).toFixed(1)}m（不整形地はこの値が上限）
          <button class="btn sm ghost" onclick="reSet('okuyuki','${(num(r.area)/num(r.maguchi)).toFixed(1)}')">この値を使う</button></div>`:''}</div></div>
      ${rightsBlock(r)}
    </div>`;

    // 追加補正（アコーディオン風）
    html+=`<div class="card"><h3>STEP 4　当てはまるものだけチェック（任意）</h3>`;

    // 角地
    html+=`<div class="opt-block"><label class="opt-head"><input type="checkbox" ${r.side.length?'checked':''} onchange="reSet('side',this.checked?[{rosenka:'',jun:false}]:[])"> 角地・準角地（側方にも道路がある）</label>
      ${r.side.length?`<div class="opt-body">
        <div class="frow"><label>側方路線価（円/㎡）</label><input type="number" value="${esc(r.side[0].rosenka)}" onchange="reSet('side.0.rosenka',this.value)"></div>
        <div class="frow"><label>角地の種類</label><select onchange="reSet('side.0.jun',this.value==='1')">
          <option value="0" ${!r.side[0].jun?'selected':''}>角地（交差点の角）</option>
          <option value="1" ${r.side[0].jun?'selected':''}>準角地（同じ道路が折れ曲がった内側）</option></select></div>
      </div>`:''}</div>`;

    // 二方路線
    html+=`<div class="opt-block"><label class="opt-head"><input type="checkbox" ${num(r.back.rosenka)?'checked':''} onchange="reSet('back.rosenka',this.checked?'0':'')"> 裏にも道路がある（二方路線）</label>
      ${r.back.rosenka!==''?`<div class="opt-body"><div class="frow"><label>裏面路線価（円/㎡）</label><input type="number" value="${esc(r.back.rosenka)}" onchange="reSet('back.rosenka',this.value)"></div></div>`:''}</div>`;

    // 不整形地
    html+=`<div class="opt-block"><label class="opt-head"><input type="checkbox" ${r.fuseikei.on?'checked':''} onchange="reSetChk('fuseikei.on',this)"> 形がいびつ（不整形地） ${guideBtn('maguchi')}</label>
      ${r.fuseikei.on?`<div class="opt-body">
        <div class="frow"><label>かげ地割合の求め方</label><select onchange="reSet('fuseikei.mode',this.value)">
          <option value="calc" ${r.fuseikei.mode==='calc'?'selected':''}>想定整形地の縦横から自動計算</option>
          <option value="direct" ${r.fuseikei.mode==='direct'?'selected':''}>かげ地割合を直接入力</option></select></div>
        ${r.fuseikei.mode==='calc'?`
          <div class="frow"><label>想定整形地の間口(m)</label><input type="number" step="0.1" value="${esc(r.fuseikei.soteiW)}" onchange="reSet('fuseikei.soteiW',this.value)" placeholder="土地を囲む長方形の横幅"></div>
          <div class="frow"><label>想定整形地の奥行(m)</label><input type="number" step="0.1" value="${esc(r.fuseikei.soteiD)}" onchange="reSet('fuseikei.soteiD',this.value)"></div>`
        :`<div class="frow"><label>かげ地割合(%)</label><input type="number" value="${esc(r.fuseikei.kagePct)}" onchange="reSet('fuseikei.kagePct',this.value)"></div>`}
      </div>`:''}</div>`;

    // がけ地
    html+=`<div class="opt-block"><label class="opt-head"><input type="checkbox" ${r.gake.on?'checked':''} onchange="reSetChk('gake.on',this)"> がけ地（急斜面）を含む</label>
      ${r.gake.on?`<div class="opt-body">
        <div class="frow"><label>がけ地の面積(㎡)</label><input type="number" value="${esc(r.gake.area)}" onchange="reSet('gake.area',this.value)"></div>
        <div class="frow"><label>がけの向き（斜面の方位）</label><select onchange="reSet('gake.dir',parseInt(this.value))">${GAKE_DIRS.map((d,i)=>`<option value="${i}" ${r.gake.dir===i?'selected':''}>${d}</option>`).join('')}</select></div>
        <label class="opt-head" style="margin-top:6px"><input type="checkbox" ${r.tokkei.on?'checked':''} onchange="reSetChk('tokkei.on',this)"> 土砂災害特別警戒区域を含む</label>
        ${r.tokkei.on?`<div class="frow"><label>特別警戒区域の面積(㎡)</label><input type="number" value="${esc(r.tokkei.area)}" onchange="reSet('tokkei.area',this.value)"></div>`:''}
      </div>`:''}</div>`;

    // 無道路地・セットバック・私道
    html+=`<div class="opt-block"><label class="opt-head"><input type="checkbox" ${r.mudouro.on?'checked':''} onchange="reSetChk('mudouro.on',this)"> 道路に接していない（無道路地）</label>
      ${r.mudouro.on?`<div class="opt-body"><div class="frow"><label>通路開設に必要な面積(㎡)</label><input type="number" value="${esc(r.mudouro.tsuroArea)}" onchange="reSet('mudouro.tsuroArea',this.value)" placeholder="接道義務を満たす最小の通路"></div></div>`:''}</div>`;
    html+=`<div class="opt-block"><label class="opt-head"><input type="checkbox" ${r.setback.on?'checked':''} onchange="reSetChk('setback.on',this)"> セットバックが必要（前面道路が4m未満）</label>
      ${r.setback.on?`<div class="opt-body"><div class="frow"><label>後退が必要な部分の面積(㎡)</label><input type="number" value="${esc(r.setback.area)}" onchange="reSet('setback.area',this.value)"></div></div>`:''}</div>`;
    html+=`<div class="opt-block"><label class="opt-head">私道の場合</label>
      <div class="opt-body"><select onchange="reSet('shido',this.value)">
        <option value="none" ${r.shido==='none'?'selected':''}>私道ではない</option>
        <option value="ikidomari" ${r.shido==='ikidomari'?'selected':''}>行き止まりの私道（評価額×30%）</option>
        <option value="torinuke" ${r.shido==='torinuke'?'selected':''}>通り抜けできる私道（評価しない）</option></select></div></div>`;
    html+=zoseiBlock(r);
    html+=`</div>`;
  }
  return html;
}

/* 権利関係ブロック（土地共通） */
function rightsBlock(r){
  return `<div class="frow"><label>土地の利用状況</label>
    <div><select onchange="reSet('rights',this.value)">
      <option ${r.rights==='自用地'?'selected':''}>自用地</option>
      <option ${r.rights==='貸宅地'?'selected':''}>貸宅地</option>
      <option ${r.rights==='貸家建付地'?'selected':''}>貸家建付地</option>
      <option ${r.rights==='借地権'?'selected':''}>借地権</option></select>
    <div class="hint">自用地=自分で使用／貸宅地=他人に土地を貸している／貸家建付地=自分のアパート等の敷地／借地権=借りている土地の権利</div></div></div>
  ${r.rights==='貸家建付地'?`<div class="frow"><label>賃貸割合(%)</label><input type="number" value="${esc(r.chintaiRatio)}" onchange="reSet('chintaiRatio',this.value)" placeholder="空室がなければ100"></div>`:''}`;
}

/* 造成費ブロック */
function zoseiBlock(r){
  return `<div class="opt-block"><label class="opt-head"><input type="checkbox" ${r.zosei.on?'checked':''} onchange="reSetChk('zosei.on',this)"> 宅地造成費を控除する（市街地農地・雑種地など） ${guideBtn('zosei')}</label>
    ${r.zosei.on?`<div class="opt-body">
      <table class="list"><tr><th>項目</th><th>数量(㎡/m³)</th><th>単価(円)</th><th class="num">金額</th></tr>
      ${r.zosei.items.map((it,i)=>`<tr><td>${esc(it.label)}</td>
        <td><input type="number" style="width:100px" value="${esc(it.qty)}" onchange="reSet('zosei.items.${i}.qty',this.value)"></td>
        <td><input type="number" style="width:110px" value="${esc(it.unit)}" onchange="reSet('zosei.items.${i}.unit',this.value)"></td>
        <td class="num">${yen(num(it.qty)*num(it.unit))}</td></tr>`).join('')}
      </table>
      <div class="hint">単価は国税局の「宅地造成費の金額表」（都道府県・年度別）を転記してください</div>
    </div>`:''}</div>`;
}

/* ---------- 建物 ---------- */
function renderBuildingForm(r){
  return `<div class="card"><h3>STEP 2　建物の入力（1つだけ）</h3>
    <div class="frow"><label>固定資産税評価額<span class="req">必須</span> ${guideBtn('hyoka')}</label>
      <div><input type="number" value="${esc(r.koteiHyoka)}" onchange="reSet('koteiHyoka',this.value)" placeholder="評価証明書の「価格」欄">
      <div class="hint">建物の相続税評価額は「固定資産税評価額 × 1.0」。証明書の金額をそのまま入力すればOKです</div></div></div>
    <div class="frow"><label>利用状況</label><select onchange="reSet('rights',this.value)">
      <option value="自用" ${r.rights!=='貸家'?'selected':''}>自用（自宅・空き家など）</option>
      <option value="貸家" ${r.rights==='貸家'?'selected':''}>貸家（賃貸中）</option></select></div>
    ${r.rights==='貸家'?`<div class="frow"><label>賃貸割合(%)</label><input type="number" value="${esc(r.chintaiRatio)}" onchange="reSet('chintaiRatio',this.value)" placeholder="満室なら100"></div>`:''}
    <div class="frow"><label>床面積(㎡)（任意） ${guideBtn('touki_building')}</label><input type="number" value="${esc(r.area)}" onchange="reSet('area',this.value)"></div>
  </div>`;
}

/* ---------- マンション ---------- */
function renderMansionForm(r){
  const bunOk=num(r.shikichiBunshi)>0&&num(r.shikichiBunbo)>0;
  return `<div class="card"><h3>STEP 2　マンションの入力 ${guideBtn('mansion')}</h3>
    <p class="desc" style="margin-bottom:8px">登記簿（区分建物）と固定資産評価証明書から転記します。令和6年からの「区分所有補正率」は自動計算されます。</p>
    <div class="frow"><label>専有部分の床面積(㎡)<span class="req">必須</span></label><input type="number" step="0.01" value="${esc(r.senyuArea)}" onchange="reSet('senyuArea',this.value)" placeholder="登記簿「専有部分の建物の表示」"></div>
    <div class="frow"><label>敷地権の割合<span class="req">必須</span></label>
      <div style="display:flex;gap:6px;align-items:center">
        <input type="number" style="width:130px" value="${esc(r.shikichiBunshi)}" onchange="reSet('shikichiBunshi',this.value)" placeholder="6789">
        <span>／</span>
        <input type="number" style="width:150px" value="${esc(r.shikichiBunbo)}" onchange="reSet('shikichiBunbo',this.value)" placeholder="1234567">
        ${bunOk?`<span class="hint">= ${(num(r.shikichiBunshi)/num(r.shikichiBunbo)*100).toFixed(4)}%</span>`:''}
      </div></div>
    <div class="frow"><label>敷地全体の評価額<span class="req">必須</span></label>
      <div><input type="number" value="${esc(r.siteValue)}" onchange="reSet('siteValue',this.value)" placeholder="円">
      <div class="hint">正確には「敷地全体の路線価評価額」。簡易には土地の固定資産評価証明書（敷地全体）の価格×1.14（東京の目安）や、路線価×敷地全体面積でも概算できます</div></div></div>
    <div class="frow"><label>敷地全体の面積(㎡)（任意）</label><input type="number" value="${esc(r.siteArea)}" onchange="reSet('siteArea',this.value)" placeholder="狭小度の計算精度が上がります"></div>
    <div class="frow"><label>建物（専有部分）の固定資産税評価額<span class="req">必須</span> ${guideBtn('hyoka')}</label><input type="number" value="${esc(r.koteiHyokaBld)}" onchange="reSet('koteiHyokaBld',this.value)"></div>
    <hr style="border:none;border-top:1px dashed var(--line);margin:10px 0">
    <div class="grid2">
      <div class="frow"><label>築年数（年）</label><input type="number" value="${esc(r.chikunen)}" onchange="reSet('chikunen',this.value)" placeholder="1年未満切上げ"></div>
      <div class="frow"><label>建物の総階数</label><input type="number" value="${esc(r.soukaisu)}" onchange="reSet('soukaisu',this.value)"></div>
      <div class="frow"><label>所在階</label><input type="number" value="${esc(r.shozaikai)}" onchange="reSet('shozaikai',this.value)"></div>
      <div class="frow"><label>地階（地下）ですか</label><input type="checkbox" ${r.chika?'checked':''} onchange="reSetChk('chika',this)" style="width:auto"></div>
    </div>
    <div class="frow"><label>利用状況</label><select onchange="reSet('rights',this.value)">
      <option value="自用" ${r.rights!=='貸家'?'selected':''}>自用（居住・空室）</option>
      <option value="貸家" ${r.rights==='貸家'?'selected':''}>賃貸中</option></select></div>
  </div>`;
}
