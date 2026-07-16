"use strict";
/* ============================================================
   計算エンジン
   - 法定相続人判定 / 相続税計算
   - 不動産評価（路線価方式・倍率方式・簡易・区分マンション）
   - 小規模宅地等の特例 最適化
============================================================ */

/* ---------- 汎用 ---------- */
const yen = n => (n==null||isNaN(n)) ? '-' : Math.round(n).toLocaleString('ja-JP');
const num = v => { const n=parseFloat(String(v??'').replace(/,/g,'')); return isNaN(n)?0:n; };
function esc(s){ return String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }
function uid(){ return Math.random().toString(36).slice(2,10); }
function age(birth, base){
  if(!birth) return '';
  const b=new Date(birth), d=new Date(base||Date.now());
  let a=d.getFullYear()-b.getFullYear();
  if(d.getMonth()<b.getMonth()||(d.getMonth()===b.getMonth()&&d.getDate()<b.getDate())) a--;
  return isNaN(a)?'':a;
}

/* ============================================================
   不動産評価
   row（土地・路線価）: {method:'rosenka', district, rosenka(円/㎡), area, maguchi, okuyuki,
     side:[{rosenka, jun}], back:{rosenka}, fuseikei:{on,mode,kagePct,soteiW,soteiD},
     gake:{on,area,dir}, tokkei:{on,area}, mudouro:{on,tsuroArea}, setback:{on,area},
     shido:'none'|'ikidomari'|'torinuke', zosei:{on,items:[{label,qty,unit}]},
     rights, kariwari, chintaiRatio}
   row（土地・倍率）: {method:'bairitsu', koteiHyoka, bairitsu, ...rights}
   row（簡易）: {method:'kani', value}
   row（建物）: {kind:'building', koteiHyoka, rights:'自用'|'貸家', chintaiRatio}
   row（マンション）: {kind:'mansion', siteValue, shikichiRatio(小数), senyuArea,
     koteiHyokaBld, chikunen, soukaisu, shozaikai, chika, rights, kariwari, chintaiRatio}
============================================================ */

/* 土地の権利調整率 */
function rightsFactor(row){
  const kw = num(row.kariwari)||0.6;
  const cr = row.chintaiRatio===''||row.chintaiRatio==null ? 1 : Math.min(1,num(row.chintaiRatio)/100);
  switch(row.rights){
    case '貸宅地':     return {f:1-kw, label:`貸宅地（1−借地権割合${Math.round(kw*100)}%）`};
    case '貸家建付地': return {f:1-kw*SHAKKA*cr, label:`貸家建付地（1−${Math.round(kw*100)}%×30%×賃貸割合${Math.round(cr*100)}%）`};
    case '借地権':     return {f:kw, label:`借地権（×借地権割合${Math.round(kw*100)}%）`};
    default:           return {f:1, label:'自用地'};
  }
}

/* 路線価方式の土地評価（計算過程 steps 付き） */
function valuateRosenka(row){
  const steps=[], warns=[];
  const d=row.district??4;
  const area=num(row.area), W=num(row.maguchi), D=num(row.okuyuki);
  const F=num(row.rosenka);
  if(!F||!area) return {value:0, steps:[{label:'入力不足', text:'正面路線価と地積を入力してください'}], warns};

  // 1. 正面路線価 × 奥行価格補正率
  const okuF=okuyukiRate(d,D);
  let unit=F*okuF;
  steps.push({label:'① 正面路線 奥行価格補正', text:`${yen(F)}円 × ${okuF.toFixed(2)}（奥行${D}m・${DISTRICTS[d]}）`, val:unit});

  // 2. 側方路線影響加算（側方路線から見た奥行 = 間口距離）
  (row.side||[]).forEach((s,i)=>{
    const sr=num(s.rosenka); if(!sr) return;
    const okuS=okuyukiRate(d,W);
    const add=sr*okuS*sokuhoRate(d,s.jun);
    unit+=add;
    steps.push({label:`② 側方路線影響加算${i?`(${i+1})`:''}`, text:`${yen(sr)}円 × ${okuS.toFixed(2)} × ${sokuhoRate(d,s.jun).toFixed(2)}（${s.jun?'準角地':'角地'}）= +${yen(add)}円`, val:unit});
  });

  // 3. 二方路線影響加算
  if(row.back&&num(row.back.rosenka)){
    const br=num(row.back.rosenka);
    const add=br*okuyukiRate(d,D)*nihouRate(d);
    unit+=add;
    steps.push({label:'③ 二方路線影響加算', text:`${yen(br)}円 × ${okuyukiRate(d,D).toFixed(2)} × ${nihouRate(d).toFixed(2)} = +${yen(add)}円`, val:unit});
  }

  // 4. 不整形地補正 or 間口狭小×奥行長大
  const magR=maguchiRate(d,W), nagR=okunagaRate(d,D,W);
  if(row.fuseikei&&row.fuseikei.on){
    let kage=0;
    if(row.fuseikei.mode==='calc'){
      const sw=num(row.fuseikei.soteiW), sd=num(row.fuseikei.soteiD);
      if(sw>0&&sd>0){
        kage=Math.max(0,(sw*sd-area)/(sw*sd)*100);
        steps.push({label:'　かげ地割合の計算', text:`(想定整形地 ${sw}m×${sd}m=${(sw*sd).toFixed(1)}㎡ − 地積${area}㎡) ÷ ${(sw*sd).toFixed(1)}㎡ = ${kage.toFixed(1)}%`});
      }
    } else kage=num(row.fuseikei.kagePct);
    const fuR=fuseikeiRate(d,area,kage);
    const kubun=chisekiKubun(d,area);
    if(kubun===null){ warns.push(`${DISTRICTS[d]}は不整形地補正の適用対象外です`); }
    // 不整形×間口狭小 と 奥行長大×間口狭小 の小さい方（小数点2位未満切捨て・下限0.60）
    const c1=Math.floor(fuR*magR*100)/100;
    const c2=Math.floor(nagR*magR*100)/100;
    const c=Math.max(0.60, Math.min(c1,c2));
    unit*=c;
    steps.push({label:'④ 不整形地補正', text:`かげ地割合${kage.toFixed(1)}%・地積区分${kubun||'—'} → 補正率${fuR.toFixed(2)}。min(不整形${fuR.toFixed(2)}×間口狭小${magR.toFixed(2)}=${c1.toFixed(2)}, 奥行長大${nagR.toFixed(2)}×間口狭小${magR.toFixed(2)}=${c2.toFixed(2)})、下限0.60 → ${c.toFixed(2)}`, val:unit});
  } else if(magR<1||nagR<1){
    unit*=magR*nagR;
    steps.push({label:'④ 間口狭小・奥行長大補正', text:`間口狭小${magR.toFixed(2)}（間口${W}m）× 奥行長大${nagR.toFixed(2)}（奥行/間口=${W>0?(D/W).toFixed(1):'-'}）`, val:unit});
  }

  // 5. がけ地・特別警戒区域
  if(row.gake&&row.gake.on&&num(row.gake.area)>0){
    const ratio=num(row.gake.area)/area;
    let gr=gakechiRate(ratio,row.gake.dir??0);
    let label=`がけ地補正率 ${gr.toFixed(2)}（がけ地割合${(ratio*100).toFixed(0)}%・${GAKE_DIRS[row.gake.dir??0]}向き）`;
    if(row.tokkei&&row.tokkei.on&&num(row.tokkei.area)>0){
      const tr0=tokkeiRate(num(row.tokkei.area)/area);
      gr=Math.max(0.50, Math.round(tr0*gr*100)/100);
      label+=` × 特別警戒${tr0.toFixed(2)} → ${gr.toFixed(2)}（下限0.50）`;
    }
    unit*=gr;
    steps.push({label:'⑤ がけ地等補正', text:label, val:unit});
  } else if(row.tokkei&&row.tokkei.on&&num(row.tokkei.area)>0){
    const tr=tokkeiRate(num(row.tokkei.area)/area);
    unit*=tr;
    steps.push({label:'⑤ 特別警戒区域補正', text:`補正率 ${tr.toFixed(2)}`, val:unit});
  }

  let value=unit*area;
  steps.push({label:'⑥ 1㎡単価 × 地積', text:`${yen(unit)}円 × ${area}㎡`, val:value});

  // 6. 無道路地（通路開設費用控除・上限40%）
  if(row.mudouro&&row.mudouro.on&&num(row.mudouro.tsuroArea)>0){
    const ded=Math.min(F*num(row.mudouro.tsuroArea), value*0.4);
    value-=ded;
    steps.push({label:'⑦ 無道路地控除', text:`通路開設費用 min(正面路線価×通路${row.mudouro.tsuroArea}㎡, 価額×40%) = ▲${yen(ded)}円`, val:value});
  }
  // 7. セットバック
  if(row.setback&&row.setback.on&&num(row.setback.area)>0){
    const ded=value*(num(row.setback.area)/area)*0.7;
    value-=ded;
    steps.push({label:'⑧ セットバック控除', text:`該当${row.setback.area}㎡/${area}㎡ × 70% = ▲${yen(ded)}円`, val:value});
  }
  // 8. 私道
  if(row.shido==='ikidomari'){ value*=0.3; steps.push({label:'⑨ 私道（行き止まり）', text:'× 30%', val:value}); }
  if(row.shido==='torinuke'){ value=0; steps.push({label:'⑨ 私道（通り抜け）', text:'評価しない（0円）', val:0}); }

  // 9. 宅地造成費控除
  if(row.zosei&&row.zosei.on){
    let z=0; const parts=[];
    (row.zosei.items||[]).forEach(it=>{ const a=num(it.qty)*num(it.unit); if(a>0){z+=a; parts.push(`${it.label||'項目'} ${yen(a)}円`);} });
    if(z>0){ value=Math.max(0,value-z); steps.push({label:'⑩ 宅地造成費控除', text:parts.join(' + ')+` = ▲${yen(z)}円`, val:value}); }
  }

  // 10. 権利調整
  const rf=rightsFactor(row);
  if(rf.f!==1){ value*=rf.f; steps.push({label:'⑪ 権利調整', text:rf.label, val:value}); }

  value=Math.floor(value);
  return {value, unit, steps, warns};
}

/* 倍率方式 */
function valuateBairitsu(row){
  const steps=[], warns=[];
  const k=num(row.koteiHyoka), b=num(row.bairitsu)||1.1;
  let value=k*b;
  steps.push({label:'① 固定資産税評価額 × 倍率', text:`${yen(k)}円 × ${b}`, val:value});
  const rf=rightsFactor(row);
  if(rf.f!==1){ value*=rf.f; steps.push({label:'② 権利調整', text:rf.label, val:value}); }
  if(row.zosei&&row.zosei.on){
    let z=0;(row.zosei.items||[]).forEach(it=>{z+=num(it.qty)*num(it.unit);});
    if(z>0){ value=Math.max(0,value-z); steps.push({label:'③ 宅地造成費控除', text:`▲${yen(z)}円`, val:value}); }
  }
  return {value:Math.floor(value), steps, warns};
}

/* 建物（固定資産税評価額 × 1.0、貸家は借家権控除） */
function valuateBuilding(row){
  const steps=[];
  const k=num(row.koteiHyoka);
  let value=k;
  steps.push({label:'① 固定資産税評価額 × 1.0', text:`${yen(k)}円`, val:value});
  if(row.rights==='貸家'){
    const cr=row.chintaiRatio===''||row.chintaiRatio==null?1:Math.min(1,num(row.chintaiRatio)/100);
    value*=1-SHAKKA*cr;
    steps.push({label:'② 貸家の評価減', text:`× (1 − 借家権30% × 賃貸割合${Math.round(cr*100)}%)`, val:value});
  }
  return {value:Math.floor(value), steps, warns:[]};
}

/* 区分所有マンション（令和6年改正 区分所有補正率対応） */
function valuateMansion(row){
  const steps=[], warns=[];
  const senyu=num(row.senyuArea);
  const ratio=num(row.shikichiRatio);           // 敷地権割合（小数）
  const siteTotal=num(row.siteValue);           // 敷地全体の自用地評価額
  const shikichiArea=num(row.siteArea)*ratio;   // 敷地利用権面積
  const ks=kubunShoyuHosei({
    chikunen:num(row.chikunen), soukaisu:num(row.soukaisu),
    shozaikai:num(row.shozaikai), chika:!!row.chika,
    senyuArea:senyu, shikichiArea
  });
  if(ks.note) warns.push(ks.note);
  steps.push({label:'① 区分所有補正率の計算',
    text:`評価乖離率 = 築年数×▲0.033(${ks.A}) + 総階数指数×0.239(${ks.B}) + 所在階×0.018(${ks.C}) + 敷地持分狭小度×▲1.195(${ks.D}) + 3.220 = ${ks.K}／評価水準${ks.level?ks.level.toFixed(3):'-'} → 補正率 ${ks.hosei}`});

  // 敷地利用権
  let land=siteTotal*ratio;
  steps.push({label:'② 敷地利用権', text:`敷地全体評価額 ${yen(siteTotal)}円 × 敷地権割合 ${(ratio*100).toFixed(4)}%`, val:land});
  land*=ks.hosei;
  steps.push({label:'③ 敷地利用権 × 区分所有補正率', text:`× ${ks.hosei}`, val:land});

  // 区分所有権（建物）
  let bld=num(row.koteiHyokaBld);
  steps.push({label:'④ 専有部分の建物（固定資産税評価額）', text:`${yen(bld)}円`, val:bld});
  bld*=ks.hosei;
  steps.push({label:'⑤ 建物 × 区分所有補正率', text:`× ${ks.hosei}`, val:bld});

  // 賃貸中の調整
  if(row.rights==='貸家'){
    const kw=num(row.kariwari)||0.6;
    land*=1-kw*SHAKKA; bld*=1-SHAKKA;
    steps.push({label:'⑥ 賃貸中の調整', text:`敷地×(1−${Math.round(kw*100)}%×30%)、建物×(1−30%)`, val:land+bld});
  }
  const value=Math.floor(land)+Math.floor(bld);
  steps.push({label:'⑦ 合計評価額', text:`敷地利用権 ${yen(Math.floor(land))}円 + 区分所有権 ${yen(Math.floor(bld))}円`, val:value});
  return {value, landPart:Math.floor(land), bldPart:Math.floor(bld), ks, steps, warns};
}

/* 不動産1行の評価（特例適用前） */
function valuateRE(row){
  if(row.kind==='mansion') return valuateMansion(row);
  if(row.kind==='building') return valuateBuilding(row);
  if(row.method==='rosenka') return valuateRosenka(row);
  if(row.method==='bairitsu') return valuateBairitsu(row);
  return {value:Math.floor(num(row.value)), steps:[{label:'簡易入力', text:'評価額を直接入力'}], warns:[]};
}

/* 特例適用後の課税評価額 */
function reValue(row){
  const base=valuateRE(row).value;
  const cat=row.tokureiCat||row.tokurei||'none';
  const def=TOKUREI_DEFS[cat];
  if(!def||!def.rate) return base;
  const area=num(row.area)||num(row.senyuArea)||0;
  if(area<=0) return base;
  const applied=Math.min(num(row.tokureiArea??area), area, def.limit);
  const reduction=Math.floor(base*def.rate*(applied/area));
  return Math.max(0, base-reduction);
}

/* ============================================================
   小規模宅地等の特例 最適化
   - 貸付なし: 居住330㎡＋事業400㎡（併用で最大730㎡）
   - 貸付あり: 事業×200/400 + 居住×200/330 + 貸付 ≤ 200㎡（分数ナップサック＝厳密解）
============================================================ */
function optimizeTokurei(reRows){
  const lands=reRows.map(r=>{
    const cat=r.tokureiCat||'none';
    const def=TOKUREI_DEFS[cat];
    if(!def||!def.rate) return null;
    const area=num(r.area)||num(r.senyuArea)||0;
    if(area<=0) return null;
    const base=valuateRE(r).value;
    return {id:r.id, cat, area:Math.min(area,def.limit), fullArea:area,
            perSqm:base/area*def.rate};       // 1㎡あたり減額
  }).filter(Boolean);
  if(!lands.length) return {alloc:{}, total:0, detail:[]};

  // 案1: 貸付を使わない（居住≤330・事業≤400 それぞれ単価順に充当）
  const fill=(items,limit)=>{
    items.sort((a,b)=>b.perSqm-a.perSqm);
    let rest=limit; const use={};
    for(const it of items){ const u=Math.min(it.area,rest); if(u>0){use[it.id]=u; rest-=u;} }
    return use;
  };
  const plan1={...fill(lands.filter(l=>l.cat==='kyoju'),330),
               ...fill(lands.filter(l=>l.cat==='jigyo'),400)};
  const score=plan=>lands.reduce((s,l)=>s+(plan[l.id]||0)*l.perSqm,0);

  // 案2: 貸付を含む（単一制約の分数ナップサック）
  const coef={jigyo:200/400, kyoju:200/330, kashitsuke:1};
  const items2=lands.map(l=>({...l, c:coef[l.cat], eff:l.perSqm/coef[l.cat]}))
                    .sort((a,b)=>b.eff-a.eff);
  let cap=200; const plan2={};
  for(const it of items2){
    if(cap<=0) break;
    const maxByCap=cap/it.c;
    const u=Math.min(it.area, maxByCap);
    if(u>0){ plan2[it.id]=u; cap-=u*it.c; }
  }
  const best = score(plan1)>=score(plan2)? {plan:plan1, mode:'併用（貸付なし・最大730㎡）'} : {plan:plan2, mode:'貸付併用（限度面積の調整計算）'};
  const detail=lands.map(l=>({id:l.id, cat:l.cat, applied:Math.round((best.plan[l.id]||0)*100)/100,
    reduction:Math.floor((best.plan[l.id]||0)*l.perSqm)}));
  return {alloc:best.plan, total:Math.floor(score(best.plan)), mode:best.mode, detail};
}

/* 限度面積の使用状況（色分け表示用） */
function tokureiUsage(reRows){
  let jig=0,kyo=0,kas=0;
  for(const r of reRows){
    const cat=r.tokureiCat||'none';
    if(!TOKUREI_DEFS[cat]||!TOKUREI_DEFS[cat].rate) continue;
    const a=Math.min(num(r.tokureiArea??(num(r.area)||0)), num(r.area)||num(r.senyuArea)||0);
    if(cat==='jigyo')jig+=a; if(cat==='kyoju')kyo+=a; if(cat==='kashitsuke')kas+=a;
  }
  const heiyo=jig*200/400+kyo*200/330+kas;   // 貸付ありの限度式
  return {jigyo:jig, kyoju:kyo, kashitsuke:kas,
          ok: kas>0 ? heiyo<=200.0001 : (jig<=400.0001&&kyo<=330.0001),
          heiyo, usesKashitsuke:kas>0};
}

/* ============================================================
   法定相続人の判定
============================================================ */
function legalHeirs(c){
  const hs=c.heirs.filter(h=>!h.dead);
  const spouse = hs.filter(h=>h.rel==='配偶者');
  const kids   = hs.filter(h=>h.rel==='子');
  const gkids  = hs.filter(h=>h.rel==='孫（代襲）');
  const parents= hs.filter(h=>h.rel==='父'||h.rel==='母'||h.rel==='祖父母');
  const sibs   = hs.filter(h=>h.rel==='兄弟姉妹');
  const nn     = hs.filter(h=>h.rel==='甥姪（代襲）');

  let rank=0, rankHeirs=[];
  if(kids.length||gkids.length){ rank=1; rankHeirs=[...kids,...gkids]; }
  else if(parents.length){ rank=2; rankHeirs=parents; }
  else if(sibs.length||nn.length){ rank=3; rankHeirs=[...sibs,...nn]; }

  const heirs=[...spouse,...rankHeirs];
  const shares={};
  heirs.forEach(h=>shares[h.id]=0);

  const spShare = spouse.length ? (rank===1?1/2: rank===2?2/3: rank===3?3/4: 1) : 0;
  spouse.forEach(h=>shares[h.id]=spShare/spouse.length);
  const rest = spouse.length ? 1-spShare : 1;

  if(rank===1){
    const groups={};
    gkids.forEach(g=>{ const k=g.daishuFrom||('_g'+g.id); (groups[k]=groups[k]||[]).push(g); });
    const branchCount = kids.length + Object.keys(groups).length;
    if(branchCount){
      const per = rest/branchCount;
      kids.forEach(h=>shares[h.id]=per);
      Object.values(groups).forEach(g=>g.forEach(h=>shares[h.id]=per/g.length));
    }
  } else if(rank===2){
    parents.forEach(h=>shares[h.id]=rest/parents.length);
  } else if(rank===3){
    const groups={};
    nn.forEach(g=>{ const k=g.daishuFrom||('_n'+g.id); (groups[k]=groups[k]||[]).push(g); });
    const branchCount = sibs.length + Object.keys(groups).length;
    if(branchCount){
      const per = rest/branchCount;
      sibs.forEach(h=>shares[h.id]=per);
      Object.values(groups).forEach(g=>g.forEach(h=>shares[h.id]=per/g.length));
    }
  }
  return {rank, heirs, shares, spouse};
}
function isKasan(h){ return !['配偶者','子','父','母','孫（代襲）'].includes(h.rel); }

/* ============================================================
   シナリオ・財産アクセス
============================================================ */
function activeScenario(c){
  if(!c.scenarios) migrateCase(c);
  const sid=c.activeScn||c.scenarios[0].id;
  return c.scenarios.find(s=>s.id===sid)||c.scenarios[0];
}
function migrateCase(c){
  if(c.scenarios) return c;
  const assets=c.assets||{deposits:[],securities:[],insurance:[],minashi:[],realestate:[],division:[],others:[],debts:[]};
  // 旧不動産行の変換
  assets.realestate=(assets.realestate||[]).map(r=>{
    if(r.method||r.kind==='building'||r.kind==='mansion') return r;
    return {id:r.id, name:r.name, kind:(r.kind||'').startsWith('建物')?'building':'land',
      method:'kani', value:num(r.value), koteiHyoka:num(r.value), area:num(r.area),
      rights:'自用地', kariwari:0.6, chintaiRatio:'', tokureiCat:r.tokurei||'none',
      tokureiArea:num(r.area)||0, memo:r.memo||'', market:r.market||''};
  });
  c.scenarios=[{id:uid(), name:'現状', type:'現状', assets, alloc:c.alloc||{}}];
  c.activeScn=c.scenarios[0].id;
  delete c.assets; delete c.alloc;
  return c;
}
function rowValue(cat,row){
  if(ASSET_CATS[cat].unitQty) return num(row.unit)*num(row.qty);
  return num(row.value);
}
function taxableRowValue(cat,row){
  if(cat==='realestate') return reValue(row);
  return rowValue(cat,row);
}
/* 対策シナリオでの行の扱い: gift(贈与済み)は除外（giftAdd=生前贈与加算なら含む）、trustは課税対象のまま */
function rowInEstate(row){
  if(row.gift) return !!row.giftAdd;
  return true;
}

/* ============================================================
   相続税計算（シナリオ単位）
============================================================ */
function calcTax(c, scn){
  migrateCase(c);
  const S=scn||activeScenario(c);
  const LH = legalHeirs(c);
  const n = LH.heirs.length;
  const basicDeduction = 30000000 + 6000000*n;

  const people = c.heirs.filter(h=>!h.dead);
  const acquired={}; people.forEach(p=>acquired[p.id]={assets:0, minashiTaxable:0, debts:0, market:{fin:0,ins:0,re:0,gift:0,debt:0}});

  let unallocated=0, totalAssets=0, totalDebts=0, giftExcluded=0;
  const catTotals={};

  for(const cat of Object.keys(ASSET_CATS)){
    if(cat==='minashi') continue;
    catTotals[cat]=0;
    for(const row of S.assets[cat]){
      if(!rowInEstate(row)){ giftExcluded+=taxableRowValue(cat,row); continue; }
      const v = taxableRowValue(cat,row);
      catTotals[cat]+=v;
      const al = S.alloc[row.id]||{};
      let allocated=0;
      for(const [hid,amt] of Object.entries(al)){
        if(!acquired[hid]) continue;
        const a=num(amt); allocated+=a;
        if(cat==='debts'){ acquired[hid].debts+=a; acquired[hid].market.debt+=a; }
        else {
          acquired[hid].assets+=a;
          const mk=(cat==='deposits'||cat==='securities')?'fin':(cat==='realestate')?'re':'ins';
          acquired[hid].market[mk]+=a;
        }
      }
      if(Math.abs(allocated-v)>1) unallocated++;
      if(cat==='debts') totalDebts+=v; else totalAssets+=v;
    }
  }

  let lifeIns=0, lifeInsByHeir={}, retire=0, retireByHeir={};
  const isLegal = hid=>LH.heirs.some(x=>x.id===hid);
  for(const row of S.assets.minashi){
    if(!rowInEstate(row)) continue;
    const v=num(row.value); const r=row.receiver;
    catTotals.minashi=(catTotals.minashi||0)+v;
    if(row.kind==='死亡保険金'){ lifeIns+=v; if(r&&isLegal(r)) lifeInsByHeir[r]=(lifeInsByHeir[r]||0)+v; }
    else if(row.kind==='死亡退職金'){ retire+=v; if(r&&isLegal(r)) retireByHeir[r]=(retireByHeir[r]||0)+v; }
    if(r&&acquired[r]){ acquired[r].minashiTaxable+=v; acquired[r].market.ins+=v; }
  }
  const heirLifeTotal=Object.values(lifeInsByHeir).reduce((a,b)=>a+b,0);
  const heirRetTotal=Object.values(retireByHeir).reduce((a,b)=>a+b,0);
  const lifeExempt=Math.min(5000000*n, heirLifeTotal);
  const retireExempt=Math.min(5000000*n, heirRetTotal);
  for(const [hid,v] of Object.entries(lifeInsByHeir)) acquired[hid].minashiTaxable -= lifeExempt*(heirLifeTotal?v/heirLifeTotal:0);
  for(const [hid,v] of Object.entries(retireByHeir)) acquired[hid].minashiTaxable -= retireExempt*(heirRetTotal?v/heirRetTotal:0);

  const taxBase={}; let taxBaseTotal=0;
  for(const p of people){
    const a=acquired[p.id];
    let tb=a.assets+a.minashiTaxable-a.debts;
    tb=Math.max(0,Math.floor(tb/1000)*1000);
    taxBase[p.id]=tb; taxBaseTotal+=tb;
  }

  const taxableEstate=Math.max(0,taxBaseTotal-basicDeduction);
  let totalTax=0; const hypo={};
  for(const h of LH.heirs){
    const share=LH.shares[h.id]||0;
    const hypoAmt=Math.floor(taxableEstate*share/1000)*1000;
    const [rate,ded]=taxBracket(hypoAmt);
    const t=Math.max(0,hypoAmt*rate-ded);
    hypo[h.id]={hypoAmt,rate,ded,tax:t};
    totalTax+=t;
  }
  totalTax=Math.floor(totalTax/100)*100;

  const result={};
  for(const p of people){
    const ratio=taxBaseTotal?taxBase[p.id]/taxBaseTotal:0;
    let tax=totalTax*ratio;
    const kasan=isKasan(p)?tax*0.2:0;
    tax+=kasan;
    let spouseDed=0;
    if(p.rel==='配偶者'&&LH.spouse.some(s=>s.id===p.id)){
      const spShareAmt=taxBaseTotal*(LH.shares[p.id]||0);
      const limit=Math.max(160000000,spShareAmt);
      const target=Math.min(taxBase[p.id],limit);
      spouseDed=taxBaseTotal?totalTax*(target/taxBaseTotal):0;
      spouseDed=Math.min(spouseDed,tax);
    }
    let soji=0;
    const A=num(c.prev.taxA), B=num(c.prev.assetB);
    if(A>0&&B>0&&c.prev.date&&isLegal(p.id)){
      const E=Math.floor((new Date(c.baseDate)-new Date(c.prev.date))/(365.25*24*3600*1000));
      if(E>=0&&E<10){
        const C=taxBaseTotal, D=taxBase[p.id];
        let f=C/(B-A); if(f>1)f=1;
        soji=A*f*(D/(C||1))*((10-E)/10);
      }
    }
    let pay=Math.max(0,tax-spouseDed-soji);
    pay=Math.floor(pay/100)*100;
    result[p.id]={ratio,tax:totalTax*ratio,kasan,spouseDed,soji,pay};
  }

  return {LH,n,basicDeduction,lifeExempt,retireExempt,taxBase,taxBaseTotal,taxableEstate,
          hypo,totalTax,result,acquired,catTotals,totalAssets,totalDebts,unallocated,people,
          giftExcluded, scenario:S,
          totalPay:Object.values(result).reduce((a,r)=>a+r.pay,0)};
}
function bracketOf(x){ return taxBracket(x); }   // 旧テストとの互換

/* 遺留分 */
function iryubun(c){
  const LH=legalHeirs(c);
  const base=(LH.rank===2&&LH.spouse.length===0)?1/3:1/2;
  return LH.heirs.map(h=>{
    const isSib=h.rel==='兄弟姉妹'||h.rel==='甥姪（代襲）';
    return {h, ratio:isSib?0:base*(LH.shares[h.id]||0)};
  });
}
