"use strict";
/* ============================================================
   レポート出力
   - 表紙 / 家族関係図SVG / ケース別財産明細 / 5種グラフ / 付録
   - 印刷・PDF保存（ブラウザの印刷機能）
============================================================ */

const CHART_COLORS=['#2a9d8f','#c9a227','#1b3a5c','#e76f51','#8ab17d','#6d597a','#b56576','#457b9d'];

/* ---------- SVGグラフ部品 ---------- */
function svgPie(data, size=220){
  const total=data.reduce((a,d)=>a+d.v,0);
  if(total<=0) return '<p class="desc">データがありません</p>';
  const cx=size/2, cy=size/2, R=size/2-6;
  let a0=-Math.PI/2, paths='';
  data.forEach((d,i)=>{
    if(d.v<=0) return;
    const a1=a0+d.v/total*2*Math.PI;
    const large=a1-a0>Math.PI?1:0;
    const x0=cx+R*Math.cos(a0), y0=cy+R*Math.sin(a0);
    const x1=cx+R*Math.cos(a1), y1=cy+R*Math.sin(a1);
    if(d.v===total) paths+=`<circle cx="${cx}" cy="${cy}" r="${R}" fill="${CHART_COLORS[i%8]}"/>`;
    else paths+=`<path d="M${cx},${cy} L${x0.toFixed(1)},${y0.toFixed(1)} A${R},${R} 0 ${large} 1 ${x1.toFixed(1)},${y1.toFixed(1)} Z" fill="${CHART_COLORS[i%8]}"/>`;
    a0=a1;
  });
  const legend=data.filter(d=>d.v>0).map((d,i)=>
    `<div class="lg-row"><span class="lg-sw" style="background:${CHART_COLORS[data.indexOf(d)%8]}"></span>${esc(d.label)}　<b>${yen(d.v)}円</b>（${(d.v/total*100).toFixed(1)}%）</div>`).join('');
  return `<div class="chart-flex"><svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">${paths}</svg><div>${legend}</div></div>`;
}
function svgBar(data, width=520, height=200, unit='円'){
  const max=Math.max(1,...data.map(d=>d.v));
  const bw=Math.min(80,(width-60)/data.length*0.65);
  const gap=(width-60)/data.length;
  let bars='';
  data.forEach((d,i)=>{
    const h=d.v/max*(height-56);
    const x=40+i*gap+(gap-bw)/2, y=height-30-h;
    bars+=`<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${bw}" height="${h.toFixed(1)}" fill="${d.color||CHART_COLORS[i%8]}" rx="3"/>
      <text x="${(x+bw/2).toFixed(1)}" y="${height-14}" text-anchor="middle" font-size="10" fill="#333">${esc(d.label)}</text>
      <text x="${(x+bw/2).toFixed(1)}" y="${(y-5).toFixed(1)}" text-anchor="middle" font-size="10" fill="#333">${yen(d.v)}</text>`;
  });
  return `<svg viewBox="0 0 ${width} ${height}" style="width:100%;max-width:${width}px">
    <line x1="35" y1="${height-30}" x2="${width-10}" y2="${height-30}" stroke="#999"/>${bars}</svg>`;
}
function svgStacked(people, series, width=520){
  // series: [{label, color, values:{personId:v}}]
  const height=48+people.length*36;
  const totals=people.map(p=>series.reduce((a,s)=>a+(s.values[p.id]||0),0));
  const max=Math.max(1,...totals);
  let rows='';
  people.forEach((p,i)=>{
    let x=110; const y=40+i*36;
    series.forEach(s=>{
      const v=s.values[p.id]||0; if(v<=0) return;
      const w=v/max*(width-130);
      rows+=`<rect x="${x.toFixed(1)}" y="${y}" width="${w.toFixed(1)}" height="22" fill="${s.color}"/>`;
      x+=w;
    });
    rows+=`<text x="104" y="${y+15}" text-anchor="end" font-size="11" fill="#333">${esc(p.name)}</text>
      <text x="${(x+4).toFixed(1)}" y="${y+15}" font-size="10" fill="#333">${yen(totals[i])}円</text>`;
  });
  const legend=series.map(s=>`<span class="lg-inline"><span class="lg-sw" style="background:${s.color}"></span>${esc(s.label)}</span>`).join(' ');
  return `<div style="font-size:11px;margin-bottom:4px">${legend}</div>
    <svg viewBox="0 0 ${width} ${height}" style="width:100%;max-width:${width}px">${rows}</svg>`;
}

/* ---------- 家族関係図SVG ---------- */
function familyTreeSVG(c){
  const W=760, boxW=120, boxH=44;
  const alive=h=>!h.dead;
  const spouse=c.heirs.filter(h=>h.rel==='配偶者');
  const kids=c.heirs.filter(h=>h.rel==='子');
  const gkids=c.heirs.filter(h=>h.rel==='孫（代襲）');
  const parents=c.heirs.filter(h=>h.rel==='父'||h.rel==='母'||h.rel==='祖父母');
  const sibs=c.heirs.filter(h=>h.rel==='兄弟姉妹'||h.rel==='甥姪（代襲）');
  const others=c.heirs.filter(h=>h.rel==='その他（受遺者等）');
  const LH=legalHeirs(c);
  const isLegal=h=>LH.heirs.some(x=>x.id===h.id);

  const rowY={parents:20, main:110, kids:210, gkids:300};
  let H=260;
  if(gkids.length) H=360;
  let svg='';
  const box=(x,y,name,sub,type,dead)=>{
    const fill=dead?'#eee':type==='dec'?'#1b3a5c':type==='sp'?'#efe6f7':type==='heir'?'#d9f2e6':'#fff';
    const tcol=type==='dec'?'#fff':'#333';
    return `<g><rect x="${x}" y="${y}" width="${boxW}" height="${boxH}" rx="6" fill="${fill}" stroke="${dead?'#aaa':type==='heir'?'#2a9d8f':'#888'}" stroke-width="1.5"/>
      <text x="${x+boxW/2}" y="${y+18}" text-anchor="middle" font-size="12" font-weight="bold" fill="${tcol}">${esc(name)}${dead?'（故）':''}</text>
      <text x="${x+boxW/2}" y="${y+34}" text-anchor="middle" font-size="9.5" fill="${type==='dec'?'#cdd7e2':'#777'}">${esc(sub)}</text></g>`;
  };

  // 中央: 被相続人＋配偶者
  const cx=W/2;
  const decX=spouse.length?cx-boxW-20:cx-boxW/2;
  svg+=box(decX,rowY.main,c.decedent.name||'被相続人','被相続人','dec',true);
  if(spouse.length){
    const spX=cx+20;
    svg+=box(spX,rowY.main,spouse[0].name,'配偶者','sp',spouse[0].dead);
    svg+=`<line x1="${decX+boxW}" y1="${rowY.main+boxH/2}" x2="${spX}" y2="${rowY.main+boxH/2}" stroke="#888" stroke-width="2"/>`;
    svg+=`<line x1="${decX+boxW}" y1="${rowY.main+boxH/2+4}" x2="${spX}" y2="${rowY.main+boxH/2+4}" stroke="#888" stroke-width="2"/>`;
  }

  // 親世代
  if(parents.length){
    const pw=parents.length*(boxW+16)-16;
    let px=cx-pw/2;
    for(const p of parents){
      svg+=box(px,rowY.parents,p.name,p.rel+(isLegal(p)?'・法定相続人':''),isLegal(p)?'heir':'',p.dead);
      svg+=`<line x1="${px+boxW/2}" y1="${rowY.parents+boxH}" x2="${decX+boxW/2}" y2="${rowY.main}" stroke="#aaa"/>`;
      px+=boxW+16;
    }
  }
  // 子世代
  const kidAll=[...kids];
  if(kidAll.length||gkids.length){
    const kw=kidAll.length*(boxW+16)-16;
    let kx=cx-Math.max(kw,0)/2;
    const midX=spouse.length?cx:decX+boxW/2;
    for(const k of kidAll){
      svg+=box(kx,rowY.kids,k.name,'子'+(isLegal(k)?'・法定相続人':k.dead?'':''),isLegal(k)?'heir':'',k.dead);
      svg+=`<line x1="${midX}" y1="${rowY.main+boxH}" x2="${kx+boxW/2}" y2="${rowY.kids}" stroke="#aaa"/>`;
      kx+=boxW+16;
    }
    // 代襲孫（代襲元ごとに配置）
    if(gkids.length){
      const gw=gkids.length*(boxW+16)-16;
      let gx=cx-gw/2;
      for(const g of gkids){
        svg+=box(gx,rowY.gkids,g.name,'孫（代襲）'+(isLegal(g)?'・法定相続人':''),isLegal(g)?'heir':'',g.dead);
        const parent=kidAll.find(k=>k.name===g.daishuFrom);
        const fromX=parent? cx-Math.max(kw,0)/2+kidAll.indexOf(parent)*(boxW+16)+boxW/2 : midX;
        const fromY=parent? rowY.kids+boxH : rowY.main+boxH;
        svg+=`<line x1="${fromX}" y1="${fromY}" x2="${gx+boxW/2}" y2="${rowY.gkids}" stroke="#aaa" stroke-dasharray="4 3"/>`;
        gx+=boxW+16;
      }
    }
  }
  // 兄弟姉妹・その他（右側縦並び）
  let sy=20;
  for(const s of [...sibs,...others]){
    svg+=box(W-boxW-10,sy,s.name,s.rel+(isLegal(s)?'・法定相続人':''),isLegal(s)?'heir':'',s.dead);
    sy+=boxH+12;
    H=Math.max(H,sy+20);
  }
  return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;background:#fbfcfe;border:1px solid var(--line);border-radius:8px">${svg}</svg>`;
}

/* ---------- レポート本体 ---------- */
function openReport(){
  const c=activeCase();
  const results=c.scenarios.map(s=>({s,t:calcTax(c,s)}));
  const base=results.find(x=>x.s.type==='現状')||results[0];
  const t=base.t;
  const people=t.people;
  const today=new Date().toISOString().slice(0,10);

  /* グラフ1: 財産構成 */
  const comp=[
    {label:'預金', v:t.catTotals.deposits||0},
    {label:'有価証券', v:t.catTotals.securities||0},
    {label:'保険・年金', v:(t.catTotals.insurance||0)},
    {label:'みなし相続財産', v:t.catTotals.minashi||0},
    {label:'不動産', v:t.catTotals.realestate||0},
    {label:'その他', v:(t.catTotals.division||0)+(t.catTotals.others||0)},
  ];
  /* グラフ2: 各人税額 */
  const taxBar=people.map((p,i)=>({label:p.name, v:t.result[p.id].pay, color:CHART_COLORS[i%8]}));
  /* グラフ3: 取得割合（内訳） */
  const stack=svgStacked(people,[
    {label:'金融資産',color:'#2a9d8f',values:Object.fromEntries(people.map(p=>[p.id,t.acquired[p.id].market.fin]))},
    {label:'不動産',color:'#1b3a5c',values:Object.fromEntries(people.map(p=>[p.id,t.acquired[p.id].market.re]))},
    {label:'保険等',color:'#c9a227',values:Object.fromEntries(people.map(p=>[p.id,t.acquired[p.id].market.ins]))},
  ]);
  /* グラフ4: 法定相続分 */
  const legalBar=t.LH.heirs.map((h,i)=>({label:h.name, v:Math.round(t.taxBaseTotal*(t.LH.shares[h.id]||0)), color:CHART_COLORS[i%8]}));
  /* グラフ5: 遺留分 */
  const iryu=iryubun(c);
  const iryuBar=iryu.filter(x=>x.ratio>0).map((x,i)=>({label:x.h.name, v:Math.round(t.taxBaseTotal*x.ratio), color:CHART_COLORS[i%8]}));

  /* 不動産明細（グルーピング＋計算過程） */
  const S=base.s;
  const reDetail=S.assets.realestate.map(r=>{
    const v=valuateRE(r);
    const after=reValue(r);
    return `<div class="re-detail">
      <h4>${esc(r.name)} <small>（${r.kind==='land'?'土地':r.kind==='building'?'建物':'マンション'}${r.method?'・'+(r.method==='rosenka'?'路線価方式':r.method==='bairitsu'?'倍率方式':'簡易入力'):''}）</small></h4>
      <table class="calc-steps">${v.steps.map(s2=>`<tr><td class="sl">${esc(s2.label)}</td><td>${esc(s2.text||'')}${s2.val!=null?`<span class="sv-inline">→ ${yen(s2.val)}円</span>`:''}</td></tr>`).join('')}</table>
      <div class="re-total">評価額 ${yen(v.value)}円${after!==v.value?` ／ 小規模宅地等特例適用後 <b>${yen(after)}円</b>`:''}</div>
    </div>`;
  }).join('');

  /* 財産明細テーブル */
  const catRows=Object.entries(ASSET_CATS).map(([cat,cfg])=>{
    const rows=S.assets[cat].filter(rowInEstate);
    if(!rows.length) return '';
    return `<tr><td>${cfg.label}</td><td class="num">${rows.length}件</td>
      <td class="num">${yen(rows.reduce((a,r)=>a+taxableRowValue(cat,r),0))} 円</td></tr>`;
  }).join('');

  /* ケース比較 */
  const compareHtml=c.scenarios.length>1?`
    <div class="rp-section"><h3>■ 対策ケース比較</h3>
    <table class="result"><tr><th>項目</th>${results.map(x=>`<th>${esc(x.s.name)}</th>`).join('')}</tr>
     <tr><td>課税価格の合計</td>${results.map(x=>`<td class="num">${yen(x.t.taxBaseTotal)}</td>`).join('')}</tr>
     <tr><td>相続税の総額</td>${results.map(x=>`<td class="num">${yen(x.t.totalTax)}</td>`).join('')}</tr>
     <tr class="total"><td>納税額合計</td>${results.map(x=>`<td class="num ${x.t.totalPay<base.t.totalPay?'diff-good':''}">${yen(x.t.totalPay)}${x!==base?`<br><small>現状比 ${x.t.totalPay<=base.t.totalPay?'▲':'+'}${yen(Math.abs(x.t.totalPay-base.t.totalPay))}</small>`:''}</td>`).join('')}</tr>
    </table></div>`:'';

  const r=t.result;
  view.innerHTML=`
  <div class="no-print toolbar" style="margin-bottom:10px">
    <button class="btn" onclick="render()">← 戻る</button>
    <button class="btn navy" onclick="window.print()">🖨 印刷 / PDF保存</button>
    <span class="hint">PDFにするには印刷画面で「送信先: PDFに保存」を選択</span>
  </div>
  <div class="report">
    <!-- 表紙 -->
    <div class="rp-cover">
      <div class="rp-cover-line"></div>
      <h1>相続シミュレーション報告書</h1>
      <div class="rp-cover-case">${esc(c.caseName)||'（無題の案件）'}</div>
      <table class="rp-cover-tbl">
        <tr><td>被相続人</td><td>${esc(c.decedent.name)} 様</td></tr>
        <tr><td>計算基準日</td><td>${esc(c.baseDate)}</td></tr>
        <tr><td>作成日</td><td>${today}</td></tr>
        <tr><td>作成</td><td>${esc(db.office||'　')}</td></tr>
      </table>
      <p class="rp-disclaimer">本書は財産評価基本通達等に基づく概算シミュレーションです。実際の申告にあたっては税理士にご相談ください。</p>
    </div>

    <div class="rp-section"><h3>■ サマリー</h3>
      <div class="kpi-wrap">
        <div class="kpi"><div class="t">課税価格の合計</div><div class="v">${yen(t.taxBaseTotal)} 円</div></div>
        <div class="kpi teal"><div class="t">課税遺産総額（基礎控除後）</div><div class="v">${yen(t.taxableEstate)} 円</div></div>
        <div class="kpi gold"><div class="t">相続税納税額合計</div><div class="v">${yen(t.totalPay)} 円</div></div>
      </div></div>

    <div class="rp-section"><h3>■ 家族関係図</h3>${familyTreeSVG(c)}
      <table class="result" style="margin-top:8px"><tr><th>相続人</th><th>続柄</th><th>法定相続分</th><th>課税価格</th><th>納税額</th></tr>
      ${people.map(p=>`<tr><td>${esc(p.name)}</td><td>${esc(p.rel)}</td><td>${((t.LH.shares[p.id]||0)*100).toFixed(1)}%</td>
        <td class="num">${yen(t.taxBase[p.id])}</td><td class="num">${yen(r[p.id].pay)}</td></tr>`).join('')}</table></div>

    <div class="rp-section"><h3>■ 財産構成</h3>${svgPie(comp)}
      <table class="result" style="margin-top:10px"><tr><th>財産カテゴリ</th><th>件数</th><th>評価額</th></tr>${catRows}
      <tr class="total"><td>財産合計（債務控除前）</td><td></td><td class="num">${yen(t.totalAssets+(t.catTotals.minashi||0))} 円</td></tr>
      <tr><td>債務・葬式費用</td><td></td><td class="num">▲${yen(t.totalDebts)} 円</td></tr></table></div>

    ${S.assets.realestate.length?`<div class="rp-section"><h3>■ 不動産の評価明細</h3>${reDetail}</div>`:''}

    <div class="rp-section"><h3>■ 相続税の計算</h3>
      <table class="result">
        <tr><th>項目</th><th>金額・内容</th></tr>
        <tr><td>課税価格の合計</td><td class="num">${yen(t.taxBaseTotal)} 円</td></tr>
        <tr><td>基礎控除（3,000万円+600万円×${t.n}人）</td><td class="num">▲${yen(t.basicDeduction)} 円</td></tr>
        <tr><td>生命保険金非課税枠</td><td class="num">▲${yen(t.lifeExempt)} 円（適用済）</td></tr>
        <tr><td>死亡退職金非課税枠</td><td class="num">▲${yen(t.retireExempt)} 円（適用済）</td></tr>
        <tr><td>課税遺産総額</td><td class="num">${yen(t.taxableEstate)} 円</td></tr>
        <tr class="total"><td>相続税の総額</td><td class="num">${yen(t.totalTax)} 円</td></tr>
      </table></div>

    <div class="rp-section"><h3>■ 各人の納税額</h3>${svgBar(taxBar)}</div>
    <div class="rp-section"><h3>■ 各人の取得財産の内訳</h3>${stack}</div>
    <div class="rp-section rp-half">
      <div><h3>■ 法定相続分相当額</h3>${svgBar(legalBar,380,180)}</div>
      <div><h3>■ 遺留分相当額</h3>${iryuBar.length?svgBar(iryuBar,380,180):'<p class="desc">該当なし</p>'}</div>
    </div>

    ${compareHtml}

    <div class="rp-section rp-appendix"><h3>■ 付録</h3>
      <h4>相続税の速算表</h4>
      <table class="result"><tr><th>法定相続分に応ずる取得金額</th><th>税率</th><th>控除額</th></tr>
        <tr><td>1,000万円以下</td><td>10%</td><td>—</td></tr>
        <tr><td>3,000万円以下</td><td>15%</td><td>50万円</td></tr>
        <tr><td>5,000万円以下</td><td>20%</td><td>200万円</td></tr>
        <tr><td>1億円以下</td><td>30%</td><td>700万円</td></tr>
        <tr><td>2億円以下</td><td>40%</td><td>1,700万円</td></tr>
        <tr><td>3億円以下</td><td>45%</td><td>2,700万円</td></tr>
        <tr><td>6億円以下</td><td>50%</td><td>4,200万円</td></tr>
        <tr><td>6億円超</td><td>55%</td><td>7,200万円</td></tr></table>
      <h4>小規模宅地等の特例（概要）</h4>
      <table class="result"><tr><th>区分</th><th>減額割合</th><th>限度面積</th><th>主な要件</th></tr>
        <tr><td>特定居住用宅地等</td><td>80%</td><td>330㎡</td><td>配偶者、同居親族等が取得</td></tr>
        <tr><td>特定事業用宅地等</td><td>80%</td><td>400㎡</td><td>事業を承継する親族が取得</td></tr>
        <tr><td>貸付事業用宅地等</td><td>50%</td><td>200㎡</td><td>貸付事業を承継（3年縛りあり）</td></tr></table>
      <h4>相続手続きで必要になる主な書類</h4>
      <table class="result"><tr><th>書類</th><th>入手先</th></tr>
        <tr><td>戸籍謄本（出生から死亡まで）・法定相続情報一覧図</td><td>市区町村役場／法務局</td></tr>
        <tr><td>登記事項証明書（全部事項証明書）</td><td>法務局（オンライン請求可）</td></tr>
        <tr><td>固定資産評価証明書・課税明細書</td><td>市区町村役場（23区は都税事務所）</td></tr>
        <tr><td>残高証明書（預金・有価証券）</td><td>各金融機関</td></tr>
        <tr><td>生命保険の支払明細・保険証券</td><td>各保険会社</td></tr>
        <tr><td>路線価図・評価倍率表</td><td>国税庁 rosenka.nta.go.jp（無料）</td></tr></table>
      <p class="rp-disclaimer">本レポートの評価・税額はすべて概算です。財産評価基本通達の細目（利用区分の判定、特例の適用要件等）により実際の評価額・税額は変動します。申告・対策の実行前に必ず税理士へご相談ください。</p>
    </div>
  </div>`;
  window.scrollTo(0,0);
}
