"use strict";
/* ============================================================
   相続対策シミュレーション
   1. 最適分割の探索（一次相続＋二次相続の合計税額を最小化）
   2. 不動産活用シミュレーション（売却／アパート経営／戸建賃貸）
============================================================ */

/* ---------- 共通: 配分パーセントの適用 ---------- */
function applyPctsToScenario(c,S,pcts){
  const people=c.heirs.filter(h=>!h.dead);
  for(const cat of Object.keys(ASSET_CATS)){
    if(cat==='minashi') continue;
    for(const row of S.assets[cat]){
      if(!rowInEstate(row)) continue;
      const v=taxableRowValue(cat,row);
      S.alloc[row.id]={};
      let assigned=0; const ids=people.map(p=>p.id);
      ids.forEach((hid,i)=>{
        const pct=pcts[hid]||0;
        let amt=i===ids.length-1?v-assigned:Math.floor(v*pct/100);
        S.alloc[row.id][hid]=amt; assigned+=amt;
      });
    }
  }
}

/* ---------- 1. 最適分割の探索 ---------- */
function secondaryTax(estate,n){
  if(n<=0||estate<=0) return 0;
  const taxable=Math.max(0, estate-(30000000+6000000*n));
  let tot=0;
  for(let k=0;k<n;k++){
    const part=Math.floor(taxable/n/1000)*1000;
    const [r,d]=taxBracket(part);
    tot+=Math.max(0,part*r-d);
  }
  return Math.floor(tot/100)*100;
}

function runDivisionSweep(c){
  const S=activeScenario(c);
  const LH=legalHeirs(c);
  const spouse=LH.spouse[0];
  const others=LH.heirs.filter(h=>!spouse||h.id!==spouse.id);
  const wsum=others.reduce((a,h)=>a+(LH.shares[h.id]||0),0);
  const spouseOwn=num(c.spouseOwn||0);
  const results=[];
  const maxS=spouse?100:0;
  for(let s=0;s<=maxS;s+=1){
    const pcts={};
    if(spouse) pcts[spouse.id]=s;
    others.forEach(h=>pcts[h.id]=(100-s)*(wsum?(LH.shares[h.id]||0)/wsum:1/Math.max(1,others.length)));
    const S2=JSON.parse(JSON.stringify(S));
    applyPctsToScenario(c,S2,pcts);
    const t=calcTax(c,S2);
    const tax1=t.totalPay;
    let tax2=0;
    if(spouse){
      const estate2=spouseOwn + (t.taxBase[spouse.id]||0) - (t.result[spouse.id]?t.result[spouse.id].pay:0);
      tax2=secondaryTax(estate2, others.length);
    }
    results.push({s,pcts,tax1,tax2,total:tax1+tax2});
    if(!spouse) break;
  }
  let best=results[0], best1=results[0];
  for(const r of results){ if(r.total<best.total) best=r; if(r.tax1<best1.tax1) best1=r; }
  // 法定相続分ポイント
  const legalS=spouse?Math.round((LH.shares[spouse.id]||0)*100):0;
  const legal=results.find(r=>r.s===legalS)||results[0];
  return {results,best,best1,legal,spouse,others,spouseOwn};
}

function openDivisionOpt(){
  const c=activeCase();
  const LH=legalHeirs(c);
  if(!LH.heirs.length){ alert('親族構成で法定相続人を登録してください'); return; }
  const spouse=LH.spouse[0];
  openModal('⚡ 最適分割の提案（二次相続まで考慮）',`
    <p class="desc" style="margin-bottom:10px">配偶者の取得割合を0〜100%まで動かし、<b>一次相続＋二次相続（配偶者が亡くなった時）の合計税額</b>が最小になる分割を探します。配偶者以外は法定相続分の比率で分けます。</p>
    ${spouse?`<div class="frow"><label>配偶者の固有財産（現在の自己資産）</label>
      <div><input type="number" id="dv-own" value="${esc(c.spouseOwn||'')}" placeholder="円（例: 20000000）">
      <div class="hint">二次相続では「配偶者の固有財産＋今回相続した財産」が課税対象になります。正確に入れるほど提案が正確になります。</div></div></div>`
    :'<div class="notice">配偶者がいないため、二次相続の考慮は不要です。分割割合による税額差（2割加算対象者への配分など）のみ計算します。</div>'}
    <div id="dv-result"></div>`,
    `<button class="btn" onclick="closeModal()">閉じる</button>
     <button class="btn primary" onclick="runDivisionOpt()">計算する</button>`);
}
function runDivisionOpt(){
  const c=activeCase();
  c.spouseOwn=gv('dv-own'); saveDB();
  const sw=runDivisionSweep(c);
  window._divOpt=sw;
  const fmt=r=>`配偶者 ${r.s}% ／ その他 ${100-r.s}%`;
  const rows=[
    {label:'🏆 合計最小（おすすめ）', r:sw.best, cls:'diff-good'},
    {label:'一次相続のみ最小', r:sw.best1, cls:''},
    {label:'法定相続分どおり', r:sw.legal, cls:''},
  ];
  // 10%刻みの一覧
  const sweep=sw.results.filter(r=>r.s%10===0).map(r=>
    `<tr ${r.s===sw.best.s?'style="background:#e6f6ee;font-weight:700"':''}>
      <td>${r.s}%</td><td class="num">${yen(r.tax1)}</td><td class="num">${yen(r.tax2)}</td><td class="num">${yen(r.total)}</td></tr>`).join('');
  document.getElementById('dv-result').innerHTML=`
    <table class="list" style="margin-top:12px">
      <tr><th>パターン</th><th>分割</th><th class="num">一次相続税</th><th class="num">二次相続税</th><th class="num">合計</th><th></th></tr>
      ${rows.map((x,i)=>`<tr>
        <td><b>${x.label}</b></td><td>${sw.spouse?fmt(x.r):'—'}</td>
        <td class="num">${yen(x.r.tax1)}</td><td class="num">${yen(x.r.tax2)}</td>
        <td class="num ${x.cls}"><b>${yen(x.r.total)}</b></td>
        <td><button class="btn sm primary" onclick="applyDivisionOpt(${i})">この分割を適用</button></td></tr>`).join('')}
    </table>
    ${sw.spouse?`<details style="margin-top:10px"><summary style="cursor:pointer;font-size:12px;color:var(--teal-dark)">配偶者取得割合ごとの税額一覧（10%刻み）</summary>
      <table class="list" style="margin-top:6px"><tr><th>配偶者割合</th><th class="num">一次</th><th class="num">二次</th><th class="num">合計</th></tr>${sweep}</table></details>
    <p class="desc" style="margin-top:8px">※ 二次相続は「配偶者の固有財産＋一次で取得した財産（納税後）」を、現在の子等${sw.others.length}人が均等相続する前提の概算です。配偶者の今後の生活費による財産減少は考慮していません。</p>`:''}`;
}
function applyDivisionOpt(idx){
  const c=activeCase(); const S=activeScenario(c);
  const sw=window._divOpt; if(!sw) return;
  const r=[sw.best,sw.best1,sw.legal][idx];
  applyPctsToScenario(c,S,r.pcts);
  saveDB(); closeModal(); render();
}

/* ============================================================
   2. 不動産活用シミュレーション
============================================================ */
let stRowId=null;

function defaultStrategy(row){
  const own={...row, rights:'自用地'};
  const jiyo=valuateRE(own).value;                 // 自用地評価額
  const mkt=Math.round(jiyo/0.8/100000)*100000;    // 時価目安（路線価は公示価格の約80%）
  const area=num(row.area)||100;
  const apFloorTsubo=Math.round(area*1.2/3.3058);  // 延床目安（容積率120%仮定）
  const apCost=apFloorTsubo*900000;                // 木造アパート 坪90万円
  const koTsubo=Math.min(35,Math.round(area*0.8/3.3058));
  const koCost=koTsubo*850000;                     // 戸建賃貸 坪85万円
  return {price:mkt, costBasis:'',
    apCost, apRent:Math.round(apCost*0.07/12/1000)*1000,   // 表面利回り7%目安
    koCost, koRent:Math.round(koCost*0.065/12/1000)*1000,  // 表面利回り6.5%目安
    loanRate:2.0, loanYears:30, expRatio:20, longTerm:true, jiyo, mkt, apFloorTsubo, koTsubo};
}
function openStrategy(rowId){
  const S=activeScenario(activeCase());
  const row=S.assets.realestate.find(r=>r.id===rowId);
  if(!row||row.kind!=='land'){ alert('土地の行を選択してください'); return; }
  stRowId=rowId;
  if(!row.strategy) row.strategy=defaultStrategy(row);
  else Object.assign(row.strategy, {jiyo:defaultStrategy(row).jiyo});
  renderStrategy();
}
function stSet(key,val){
  const S=activeScenario(activeCase());
  const row=S.assets.realestate.find(r=>r.id===stRowId);
  row.strategy[key]=val; saveDB(); renderStrategy(true);
}
function stBack(){ stRowId=null; render(); }

/* 元利均等の年間返済額 */
function annualPayment(P,ratePct,years){
  const i=ratePct/100/12, n=years*12;
  if(P<=0||n<=0) return 0;
  if(i===0) return P/years;
  return P*i/(1-Math.pow(1+i,-n))*12;
}

/* プランごとのシナリオを組み立てて税額計算 */
function strategyPlans(c,row){
  const S=activeScenario(c);
  const st=row.strategy;
  const legalPcts=(()=>{const LH=legalHeirs(c);const p={};c.heirs.filter(h=>!h.dead).forEach(h=>p[h.id]=(LH.shares[h.id]||0)*100);return p;})();
  const calcWith=mod=>{
    const S2=JSON.parse(JSON.stringify(S));
    mod(S2);
    applyPctsToScenario(c,S2,legalPcts);
    return calcTax(c,S2);
  };
  const base=calcWith(()=>{});

  // 売却
  const price=num(st.price);
  const fee=Math.round((price*0.03+60000)*1.1);
  const basis=num(st.costBasis)||price*0.05;
  const gain=Math.max(0, price-basis-fee);
  const gainTax=Math.round(gain*(st.longTerm?0.20315:0.3963));
  const net=price-fee-gainTax;
  const sale=calcWith(S2=>{
    S2.assets.realestate=S2.assets.realestate.filter(r=>r.id!==row.id);
    delete S2.alloc[row.id];
    S2.assets.deposits.push({id:'sale_'+row.id,name:'売却手取り（'+row.name+'）',kind:'現金',unit:net,qty:1});
  });

  // アパート経営（全額借入）
  const apMod=S2=>{
    const land=S2.assets.realestate.find(r=>r.id===row.id);
    land.rights='貸家建付地'; land.chintaiRatio=100;
    if(land.tokureiCat==='kyoju') land.tokureiCat='kashitsuke';
    S2.assets.realestate.push({id:'ap_'+row.id,name:'新築アパート（'+row.name+'）',kind:'building',
      koteiHyoka:Math.round(num(st.apCost)*0.6), rights:'貸家', chintaiRatio:100});
    S2.assets.debts.push({id:'apl_'+row.id,name:'アパートローン',kind:'借入金',value:num(st.apCost)});
  };
  const ap=calcWith(apMod);
  const apPay=annualPayment(num(st.apCost),num(st.loanRate),num(st.loanYears));
  const apRentY=num(st.apRent)*12;
  const apNet=apRentY*(1-num(st.expRatio)/100)-apPay;

  // 戸建賃貸（全額借入）
  const koMod=S2=>{
    const land=S2.assets.realestate.find(r=>r.id===row.id);
    land.rights='貸家建付地'; land.chintaiRatio=100;
    if(land.tokureiCat==='kyoju') land.tokureiCat='kashitsuke';
    S2.assets.realestate.push({id:'ko_'+row.id,name:'戸建賃貸（'+row.name+'）',kind:'building',
      koteiHyoka:Math.round(num(st.koCost)*0.6), rights:'貸家', chintaiRatio:100});
    S2.assets.debts.push({id:'kol_'+row.id,name:'戸建賃貸ローン',kind:'借入金',value:num(st.koCost)});
  };
  const ko=calcWith(koMod);
  const koPay=annualPayment(num(st.koCost),num(st.loanRate),num(st.loanYears));
  const koRentY=num(st.koRent)*12;
  const koNet=koRentY*(1-num(st.expRatio)/100)-koPay;

  return {base,
    sale:{t:sale, price, fee, gainTax, net},
    ap:{t:ap, mod:apMod, cost:num(st.apCost), rentY:apRentY, pay:apPay, netCF:apNet, yield:num(st.apCost)?apRentY/num(st.apCost)*100:0},
    ko:{t:ko, mod:koMod, cost:num(st.koCost), rentY:koRentY, pay:koPay, netCF:koNet, yield:num(st.koCost)?koRentY/num(st.koCost)*100:0}};
}

function renderStrategy(keepScroll){
  const sc=keepScroll?window.scrollY:0;
  const c=activeCase(); const S=activeScenario(c);
  const row=S.assets.realestate.find(r=>r.id===stRowId);
  const st=row.strategy;
  const P=strategyPlans(c,row);
  const diff=(t)=>{const d=t.totalPay-P.base.totalPay;return d===0?'±0':(d<0?`<span class="diff-good-txt">▲${yen(-d)}</span>`:`<span class="diff-bad-txt">＋${yen(d)}</span>`);};

  view.innerHTML=`
   <h2 class="page">不動産活用シミュレーション</h2>
   <p class="desc">対象: <b>${esc(row.name)}</b>（自用地評価額 ${yen(st.jiyo)}円）— 相場を確認して金額を調整すると、相続税と収支への影響を比較できます。</p>

   <div class="card"><h3>① 相場の確認（外部サイト）</h3>
     <table class="list">
       <tr><th>調べること</th><th>サイト</th><th>使い方</th></tr>
       <tr><td>土地の実勢価格（売却相場）</td>
         <td><a href="https://www.reinfolib.mlit.go.jp/realEstatePrices/" target="_blank">不動産情報ライブラリ（国交省）</a></td>
         <td>所在地で検索 → 近隣の「取引価格」の㎡単価 × 地積で概算</td></tr>
       <tr><td>売出し相場</td>
         <td><a href="https://suumo.jp/baikyaku/" target="_blank">SUUMO 売却</a></td>
         <td>近隣の売出し中の土地価格を確認</td></tr>
       <tr><td>家賃相場（アパート/戸建）</td>
         <td><a href="https://suumo.jp/chintai/soba/" target="_blank">SUUMO 家賃相場</a></td>
         <td>市区町村→間取り別の平均家賃を確認して下の家賃欄へ</td></tr>
     </table>
     <div class="hint">時価目安の初期値は「自用地評価額 ÷ 0.8」（路線価は公示価格の約80%水準）で自動計算しています。実際の相場が分かったら上書きしてください。</div>
   </div>

   <div class="strategy-grid">
    <div class="card plan-card"><h3>💰 プランA　売却して現金化</h3>
      <div class="frow"><label>想定売却価格</label><input type="number" value="${esc(st.price)}" onchange="stSet('price',this.value)"></div>
      <div class="frow"><label>取得費（分かる場合）</label><input type="number" value="${esc(st.costBasis)}" onchange="stSet('costBasis',this.value)" placeholder="不明なら空欄（5%概算）"></div>
      <div class="frow"><label>所有期間</label><select onchange="stSet('longTerm',this.value==='1')">
        <option value="1" ${st.longTerm?'selected':''}>5年超（長期・税率20.315%）</option>
        <option value="0" ${!st.longTerm?'selected':''}>5年以下（短期・税率39.63%）</option></select></div>
      <table class="mini-result">
        <tr><td>仲介手数料（3%+6万+税）</td><td class="num">▲${yen(P.sale.fee)}</td></tr>
        <tr><td>譲渡所得税（概算）</td><td class="num">▲${yen(P.sale.gainTax)}</td></tr>
        <tr class="tt"><td>手取り額</td><td class="num">${yen(P.sale.net)} 円</td></tr>
        <tr><td>相続税額（法定分割時）</td><td class="num">${yen(P.sale.t.totalPay)} 円</td></tr>
        <tr class="tt"><td>現状との差</td><td class="num">${diff(P.sale.t)}</td></tr>
      </table>
      <div class="hint">⚠ 売却すると評価が「時価100%の現金」になるため、相続税は増えるのが普通です。納税資金の確保・分割のしやすさとのトレードオフです。</div>
      <button class="btn sm navy" onclick="reflectStrategy('sale')">この案を対策ケースに反映</button>
    </div>

    <div class="card plan-card"><h3>🏢 プランB　借入してアパート経営</h3>
      <div class="frow"><label>建築費（全額借入）</label><div><input type="number" value="${esc(st.apCost)}" onchange="stSet('apCost',this.value)">
        <div class="hint">目安: 延床${st.apFloorTsubo}坪 × 坪90万円（木造）</div></div></div>
      <div class="frow"><label>想定家賃収入（月額合計）</label><div><input type="number" value="${esc(st.apRent)}" onchange="stSet('apRent',this.value)">
        <div class="hint">SUUMO相場×戸数で。初期値は表面利回り7%から逆算</div></div></div>
      <table class="mini-result">
        <tr><td>表面利回り</td><td class="num">${P.ap.yield.toFixed(1)} %</td></tr>
        <tr><td>年間家賃収入</td><td class="num">${yen(P.ap.rentY)} 円</td></tr>
        <tr><td>年間返済（金利${st.loanRate}%・${st.loanYears}年）</td><td class="num">▲${yen(P.ap.pay)} 円</td></tr>
        <tr class="tt"><td>年間手残り（経費${st.expRatio}%控除後）</td><td class="num">${P.ap.netCF<0?'<span class="diff-bad-txt">':''}${yen(P.ap.netCF)} 円${P.ap.netCF<0?'</span>':''}</td></tr>
        <tr><td>相続税額（法定分割時）</td><td class="num">${yen(P.ap.t.totalPay)} 円</td></tr>
        <tr class="tt"><td>現状との差</td><td class="num">${diff(P.ap.t)}</td></tr>
      </table>
      <div class="hint">評価減の内訳: 土地→貸家建付地（▲借地権割合×30%）／建物→建築費の約60%×貸家70%＝約42%評価／借入金は全額債務控除</div>
      <button class="btn sm navy" onclick="reflectStrategy('ap')">この案を対策ケースに反映</button>
    </div>

    <div class="card plan-card"><h3>🏠 プランC　借入して戸建賃貸</h3>
      <div class="frow"><label>建築費（全額借入）</label><div><input type="number" value="${esc(st.koCost)}" onchange="stSet('koCost',this.value)">
        <div class="hint">目安: ${st.koTsubo}坪 × 坪85万円</div></div></div>
      <div class="frow"><label>想定家賃（月額）</label><div><input type="number" value="${esc(st.koRent)}" onchange="stSet('koRent',this.value)">
        <div class="hint">SUUMO相場の3LDK〜4LDK戸建を参考に</div></div></div>
      <table class="mini-result">
        <tr><td>表面利回り</td><td class="num">${P.ko.yield.toFixed(1)} %</td></tr>
        <tr><td>年間家賃収入</td><td class="num">${yen(P.ko.rentY)} 円</td></tr>
        <tr><td>年間返済（金利${st.loanRate}%・${st.loanYears}年）</td><td class="num">▲${yen(P.ko.pay)} 円</td></tr>
        <tr class="tt"><td>年間手残り（経費${st.expRatio}%控除後）</td><td class="num">${P.ko.netCF<0?'<span class="diff-bad-txt">':''}${yen(P.ko.netCF)} 円${P.ko.netCF<0?'</span>':''}</td></tr>
        <tr><td>相続税額（法定分割時）</td><td class="num">${yen(P.ko.t.totalPay)} 円</td></tr>
        <tr class="tt"><td>現状との差</td><td class="num">${diff(P.ko.t)}</td></tr>
      </table>
      <div class="hint">戸建賃貸はアパートより建築費が小さく空室リスクが読みやすい一方、収入は1世帯分です</div>
      <button class="btn sm navy" onclick="reflectStrategy('ko')">この案を対策ケースに反映</button>
    </div>
   </div>

   <div class="card"><h3>② 共通条件</h3>
     <div class="grid2">
      <div class="frow"><label>借入金利（%）</label><input type="number" step="0.1" value="${esc(st.loanRate)}" onchange="stSet('loanRate',this.value)"></div>
      <div class="frow"><label>借入期間（年）</label><input type="number" value="${esc(st.loanYears)}" onchange="stSet('loanYears',this.value)"></div>
      <div class="frow"><label>運営経費率（%）</label><input type="number" value="${esc(st.expRatio)}" onchange="stSet('expRatio',this.value)"></div>
     </div></div>

   <div class="card"><h3>③ 比較まとめ（相続税は法定相続分で分割した場合）</h3>
     <table class="result">
      <tr><th>プラン</th><th>相続税額</th><th>現状との差</th><th>年間キャッシュフロー</th><th>主なリスク・注意点</th></tr>
      <tr><td>現状維持</td><td class="num">${yen(P.base.totalPay)}</td><td class="num">—</td><td class="num">—</td><td style="text-align:left">—</td></tr>
      <tr><td>A 売却</td><td class="num">${yen(P.sale.t.totalPay)}</td><td class="num">${diff(P.sale.t)}</td><td class="num">—</td><td style="text-align:left">税負担は増えやすいが納税資金・分割対策に有効</td></tr>
      <tr><td>B アパート経営</td><td class="num">${yen(P.ap.t.totalPay)}</td><td class="num">${diff(P.ap.t)}</td><td class="num">${yen(P.ap.netCF)}円</td><td style="text-align:left">空室・金利上昇・修繕リスク。3年内相続は貸付特例の制限あり</td></tr>
      <tr><td>C 戸建賃貸</td><td class="num">${yen(P.ko.t.totalPay)}</td><td class="num">${diff(P.ko.t)}</td><td class="num">${yen(P.ko.netCF)}円</td><td style="text-align:left">同上（単一入居者依存）</td></tr>
     </table>
     <p class="desc">※ 相続開始前3年以内に貸付を開始した宅地は貸付事業用の小規模宅地特例が使えません（事業的規模を除く）。借入による対策は相続直前では税務上否認されるリスクがあります。実行前に必ず税理士へご相談ください。</p>
   </div>
   <div class="toolbar">
     <button class="btn" onclick="stBack()">← 不動産一覧に戻る</button>
   </div>`;
  if(keepScroll) window.scrollTo(0,sc);
}

/* 対策ケースへ反映 */
function reflectStrategy(plan){
  const c=activeCase();
  const S=activeScenario(c);
  const row=S.assets.realestate.find(r=>r.id===stRowId);
  const st=row.strategy;
  const P=strategyPlans(c,row);
  const S2=JSON.parse(JSON.stringify(c.scenarios.find(s=>s.type==='現状')||S));
  S2.id=uid(); S2.type='対策';
  if(plan==='sale'){
    S2.name='売却案（'+row.name.slice(0,8)+'）';
    S2.assets.realestate=S2.assets.realestate.filter(r=>r.id!==row.id);
    delete S2.alloc[row.id];
    S2.assets.deposits.push({id:uid(),name:'売却手取り（'+row.name+'）',kind:'現金',unit:P.sale.net,qty:1,memo:'活用シミュレーションから作成'});
  }
  if(plan==='ap'){ S2.name='アパート経営案'; P.ap.mod(S2); }
  if(plan==='ko'){ S2.name='戸建賃貸案'; P.ko.mod(S2); }
  // 法定相続分で自動配分しておく
  const LH=legalHeirs(c); const pcts={};
  c.heirs.filter(h=>!h.dead).forEach(h=>pcts[h.id]=(LH.shares[h.id]||0)*100);
  applyPctsToScenario(c,S2,pcts);
  c.scenarios.push(S2); c.activeScn=S2.id;
  saveDB();
  stRowId=null; ui.step=10; render();
}
