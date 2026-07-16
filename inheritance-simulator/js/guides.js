"use strict";
/* ============================================================
   書類ビジュアルガイド
   登記簿・固定資産評価証明書・路線価図などの「どこを見るか」を
   オリジナルのSVG図解で表示する
============================================================ */

const GUIDE_DEFS = {
  touki_land: {
    title:'登記事項証明書（土地）の見方',
    doc:'法務局で取得：全部事項証明書（土地）',
    note:'「表題部」に土地の基本情報が記載されています。オンライン請求（登記ねっと）や法務局窓口で1通600円程度で取得できます。',
    fields:[
      ['地番','「住所（住居表示）」とは異なります。固定資産税の課税明細書でも確認できます'],
      ['地目','宅地・田・畑・山林・雑種地など。現況と異なる場合は現況を優先します'],
      ['地積','登記上の面積（㎡）。この数値を「地積」欄に入力します'],
    ],
    svg:`<svg viewBox="0 0 560 300" xmlns="http://www.w3.org/2000/svg" style="width:100%;background:#fff;border:1px solid #ccc;border-radius:6px">
      <rect x="10" y="10" width="540" height="280" fill="#fdfdf8" stroke="#999"/>
      <text x="280" y="34" text-anchor="middle" font-size="15" font-weight="bold" fill="#333">全部事項証明書（土地）</text>
      <rect x="25" y="48" width="510" height="24" fill="#e8e8e0" stroke="#999"/>
      <text x="35" y="65" font-size="12" fill="#333">表題部（土地の表示）</text>
      <line x1="25" y1="72" x2="535" y2="72" stroke="#999"/>
      <text x="35" y="95" font-size="12" fill="#555">所在　　○○市○○町一丁目</text>
      <rect x="25" y="105" width="240" height="30" fill="#fff3cd" stroke="#e6a700" stroke-width="2" rx="3"/>
      <text x="35" y="125" font-size="12" fill="#333">① 地番　　12番3</text>
      <rect x="275" y="105" width="120" height="30" fill="#d9f2e6" stroke="#2a9d8f" stroke-width="2" rx="3"/>
      <text x="285" y="125" font-size="12" fill="#333">② 地目　宅地</text>
      <rect x="405" y="105" width="130" height="30" fill="#fde2e0" stroke="#c0392b" stroke-width="2" rx="3"/>
      <text x="415" y="125" font-size="12" fill="#333">③ 地積　165.28㎡</text>
      <text x="35" y="160" font-size="11" fill="#888">原因及びその日付〔登記の日付〕 ……</text>
      <rect x="25" y="175" width="510" height="24" fill="#e8e8e0" stroke="#999"/>
      <text x="35" y="192" font-size="12" fill="#333">権利部（甲区）（所有権に関する事項）</text>
      <text x="35" y="220" font-size="11" fill="#888">順位番号／登記の目的／受付年月日／権利者その他の事項 ……</text>
      <text x="35" y="255" font-size="12" font-weight="bold" fill="#c0392b">→ ③地積の数字を「地積(㎡)」欄へそのまま入力</text>
      <text x="35" y="275" font-size="11" fill="#666">※ ①地番は路線価図・評価証明書と照合するために使います</text>
    </svg>`
  },
  touki_building: {
    title:'登記事項証明書（建物）の見方',
    doc:'法務局で取得：全部事項証明書（建物）',
    note:'建物の相続税評価は「固定資産税評価額×1.0」なので、金額は評価証明書から転記します。登記簿は構造・床面積の確認用です。',
    fields:[
      ['家屋番号','建物を特定する番号（通常は地番と同じ系列）'],
      ['種類・構造','居宅／木造かわらぶき2階建 など'],
      ['床面積','各階の床面積。マンションは専有部分の面積'],
    ],
    svg:`<svg viewBox="0 0 560 270" xmlns="http://www.w3.org/2000/svg" style="width:100%;background:#fff;border:1px solid #ccc;border-radius:6px">
      <rect x="10" y="10" width="540" height="250" fill="#fdfdf8" stroke="#999"/>
      <text x="280" y="34" text-anchor="middle" font-size="15" font-weight="bold" fill="#333">全部事項証明書（建物）</text>
      <rect x="25" y="48" width="510" height="24" fill="#e8e8e0" stroke="#999"/>
      <text x="35" y="65" font-size="12" fill="#333">表題部（主である建物の表示）</text>
      <rect x="25" y="82" width="220" height="30" fill="#fff3cd" stroke="#e6a700" stroke-width="2" rx="3"/>
      <text x="35" y="102" font-size="12" fill="#333">① 家屋番号　12番3</text>
      <rect x="25" y="120" width="300" height="30" fill="#d9f2e6" stroke="#2a9d8f" stroke-width="2" rx="3"/>
      <text x="35" y="140" font-size="12" fill="#333">② 種類・構造　居宅／木造かわらぶき2階建</text>
      <rect x="25" y="158" width="260" height="42" fill="#fde2e0" stroke="#c0392b" stroke-width="2" rx="3"/>
      <text x="35" y="175" font-size="12" fill="#333">③ 床面積　1階 52.17㎡</text>
      <text x="88" y="192" font-size="12" fill="#333">2階 48.55㎡</text>
      <text x="35" y="228" font-size="12" font-weight="bold" fill="#c0392b">→ 金額は登記簿ではなく「固定資産評価証明書」の価格を入力</text>
      <text x="35" y="246" font-size="11" fill="#666">※ 床面積は貸家割合や小規模宅地特例の確認に使用します</text>
    </svg>`
  },
  hyoka: {
    title:'固定資産評価証明書／課税明細書の見方',
    doc:'市区町村役場（東京23区は都税事務所）で取得。毎年春の固定資産税納税通知書に同封の「課税明細書」でも確認可',
    note:'「価格（評価額）」の欄の金額を使います。「課税標準額」ではないので注意してください（課税標準額は住宅用地特例などで小さくなっている場合があります）。',
    fields:[
      ['価格（評価額）','これを入力。建物はこの金額がそのまま相続税評価額（×1.0）'],
      ['課税標準額','×使いません。価格より小さいことが多い欄です'],
    ],
    svg:`<svg viewBox="0 0 560 300" xmlns="http://www.w3.org/2000/svg" style="width:100%;background:#fff;border:1px solid #ccc;border-radius:6px">
      <rect x="10" y="10" width="540" height="280" fill="#fdfdf8" stroke="#999"/>
      <text x="280" y="34" text-anchor="middle" font-size="15" font-weight="bold" fill="#333">固定資産評価証明書</text>
      <line x1="25" y1="48" x2="535" y2="48" stroke="#999"/>
      <text x="35" y="70" font-size="12" fill="#555">所在地　○○市○○町一丁目12番3</text>
      <text x="35" y="92" font-size="12" fill="#555">地目・種類　宅地　　地積・床面積　165.28㎡</text>
      <rect x="25" y="110" width="510" height="46" fill="#fde2e0" stroke="#c0392b" stroke-width="3" rx="4"/>
      <text x="40" y="130" font-size="13" font-weight="bold" fill="#333">価格（評価額）</text>
      <text x="490" y="140" font-size="16" font-weight="bold" fill="#c0392b" text-anchor="end">18,540,320 円</text>
      <text x="40" y="148" font-size="10" fill="#c0392b">★ この欄を入力します</text>
      <rect x="25" y="168" width="510" height="36" fill="#f0f0f0" stroke="#aaa" rx="4"/>
      <text x="40" y="190" font-size="12" fill="#666">課税標準額　12,360,210 円</text>
      <text x="490" y="190" font-size="11" fill="#c0392b" text-anchor="end">✕ こちらは使いません</text>
      <text x="35" y="232" font-size="12" font-weight="bold" fill="#c0392b">→ 土地（倍率方式）：価格 × 倍率</text>
      <text x="35" y="252" font-size="12" font-weight="bold" fill="#c0392b">→ 建物：価格がそのまま相続税評価額</text>
      <text x="35" y="274" font-size="11" fill="#666">※ 取得には相続人であることが分かる戸籍等が必要な場合があります</text>
    </svg>`
  },
  rosenka: {
    title:'路線価図の見方',
    doc:'国税庁「路線価図・評価倍率表」https://www.rosenka.nta.go.jp で住所検索（無料）',
    note:'道路に書かれた「数字＋アルファベット」が路線価です。数字は千円単位／㎡。アルファベットは借地権割合を表します。',
    fields:[
      ['数字（例:215）','1㎡あたり215,000円。入力欄には円単位（215000）で入力'],
      ['記号（例:D）','借地権割合 A=90% B=80% C=70% D=60% E=50% F=40% G=30%'],
      ['地区区分','数字を囲む図形で表示。無印は普通住宅地区。凡例は路線価図の上部にあります'],
      ['倍率地域','路線価図に「倍率地域」と書かれていたら倍率方式で評価します（評価倍率表で倍率を確認）'],
    ],
    svg:`<svg viewBox="0 0 560 320" xmlns="http://www.w3.org/2000/svg" style="width:100%;background:#fff;border:1px solid #ccc;border-radius:6px">
      <rect x="10" y="10" width="540" height="300" fill="#f8f9f4" stroke="#999"/>
      <text x="280" y="32" text-anchor="middle" font-size="15" font-weight="bold" fill="#333">路線価図（イメージ）</text>
      <rect x="60" y="60" width="200" height="90" fill="#fff" stroke="#888"/>
      <rect x="300" y="60" width="200" height="90" fill="#fff" stroke="#888"/>
      <rect x="60" y="190" width="200" height="90" fill="#fff" stroke="#888"/>
      <rect x="300" y="190" width="200" height="90" fill="#fff" stroke="#888"/>
      <rect x="40" y="155" width="480" height="30" fill="#ddd"/>
      <rect x="270" y="50" width="24" height="240" fill="#ddd"/>
      <ellipse cx="160" cy="170" rx="42" ry="14" fill="#fff" stroke="#c0392b" stroke-width="2"/>
      <text x="160" y="175" text-anchor="middle" font-size="14" font-weight="bold" fill="#c0392b">215D</text>
      <text x="420" y="175" text-anchor="middle" font-size="13" fill="#333">180E</text>
      <line x1="160" y1="184" x2="120" y2="235" stroke="#c0392b" stroke-width="1.5"/>
      <text x="70" y="255" font-size="12" font-weight="bold" fill="#c0392b">路線価 215,000円/㎡</text>
      <text x="70" y="272" font-size="12" font-weight="bold" fill="#c0392b">借地権割合 D＝60%</text>
      <rect x="330" y="200" width="180" height="72" fill="#fffbe8" stroke="#c9a227" rx="4"/>
      <text x="340" y="218" font-size="11" fill="#333">借地権割合の記号</text>
      <text x="340" y="236" font-size="11" fill="#555">A=90% B=80% C=70%</text>
      <text x="340" y="252" font-size="11" fill="#555">D=60% E=50% F=40%</text>
      <text x="340" y="268" font-size="11" fill="#555">G=30%</text>
      <text x="35" y="303" font-size="11" fill="#666">※ 数字を囲む図形が地区区分（無印＝普通住宅地区）。図の上部凡例で確認できます</text>
    </svg>`
  },
  maguchi: {
    title:'間口・奥行の測り方',
    doc:'地積測量図（法務局）・実測・住宅地図などで確認',
    note:'間口＝道路に接している長さ、奥行＝道路から反対側までの距離。不整形地の場合、奥行は「地積÷間口」と実際の奥行のいずれか短い方を使うのが原則です。',
    fields:[
      ['間口距離','正面路線に接する部分の長さ（m）'],
      ['奥行距離','不整形地は「地積÷間口距離」を上限とした平均的な奥行'],
      ['想定整形地','不整形地を囲む長方形。かげ地割合の計算に使用'],
    ],
    svg:`<svg viewBox="0 0 560 300" xmlns="http://www.w3.org/2000/svg" style="width:100%;background:#fff;border:1px solid #ccc;border-radius:6px">
      <rect x="10" y="10" width="540" height="280" fill="#f8f9f4" stroke="#999"/>
      <rect x="40" y="220" width="480" height="36" fill="#ddd"/>
      <text x="280" y="243" text-anchor="middle" font-size="12" fill="#555">道　路（正面路線）</text>
      <rect x="120" y="60" width="220" height="160" fill="none" stroke="#c9a227" stroke-width="2" stroke-dasharray="6 4"/>
      <text x="345" y="72" font-size="11" fill="#9a7708">想定整形地（点線）</text>
      <polygon points="120,220 340,220 340,110 240,60 120,110" fill="#d9f2e6" stroke="#2a9d8f" stroke-width="2"/>
      <text x="215" y="165" font-size="13" fill="#1f7a70" text-anchor="middle">評価する土地</text>
      <line x1="120" y1="262" x2="340" y2="262" stroke="#c0392b" stroke-width="2" marker-start="url(#ar1)" marker-end="url(#ar1)"/>
      <text x="230" y="280" text-anchor="middle" font-size="12" font-weight="bold" fill="#c0392b">間口距離（道路に接する長さ）</text>
      <line x1="90" y1="60" x2="90" y2="220" stroke="#c0392b" stroke-width="2"/>
      <text x="80" y="140" font-size="12" font-weight="bold" fill="#c0392b" transform="rotate(-90 80 140)">奥行距離</text>
      <text x="360" y="120" font-size="11" fill="#666">かげ地割合 =</text>
      <text x="360" y="138" font-size="11" fill="#666">(想定整形地の面積−土地の面積)</text>
      <text x="360" y="156" font-size="11" fill="#666">÷ 想定整形地の面積</text>
      <defs><marker id="ar1" markerWidth="8" markerHeight="8" refX="4" refY="4"><circle cx="4" cy="4" r="2.5" fill="#c0392b"/></marker></defs>
    </svg>`
  },
  mansion: {
    title:'マンション（区分所有）の登記の見方',
    doc:'全部事項証明書（区分建物）＋ 固定資産評価証明書（土地・家屋）',
    note:'令和6年からマンションの相続税評価には「区分所有補正率」が適用されます。築年数・総階数・所在階・敷地権割合・専有面積から自動計算します。',
    fields:[
      ['専有部分の床面積','登記簿の「専有部分の建物の表示」欄（壁芯でなく内法面積）'],
      ['敷地権の割合','「敷地権の表示」欄の分数（例: 1234567分の6789）'],
      ['総階数・所在階','パンフレットや登記簿の「一棟の建物の表示」で確認'],
      ['建物の評価額','固定資産評価証明書（家屋・専有部分）の価格'],
    ],
    svg:`<svg viewBox="0 0 560 320" xmlns="http://www.w3.org/2000/svg" style="width:100%;background:#fff;border:1px solid #ccc;border-radius:6px">
      <rect x="10" y="10" width="540" height="300" fill="#fdfdf8" stroke="#999"/>
      <text x="280" y="34" text-anchor="middle" font-size="15" font-weight="bold" fill="#333">全部事項証明書（区分建物）</text>
      <rect x="25" y="48" width="510" height="22" fill="#e8e8e0" stroke="#999"/>
      <text x="35" y="64" font-size="11" fill="#333">表題部（一棟の建物の表示）</text>
      <rect x="25" y="76" width="280" height="28" fill="#d9f2e6" stroke="#2a9d8f" stroke-width="2" rx="3"/>
      <text x="35" y="95" font-size="12" fill="#333">① 構造　鉄筋コンクリート造 14階建</text>
      <rect x="25" y="112" width="510" height="22" fill="#e8e8e0" stroke="#999"/>
      <text x="35" y="128" font-size="11" fill="#333">表題部（専有部分の建物の表示）</text>
      <rect x="25" y="140" width="250" height="28" fill="#fde2e0" stroke="#c0392b" stroke-width="2" rx="3"/>
      <text x="35" y="159" font-size="12" fill="#333">② 床面積　7階部分 70.25㎡</text>
      <rect x="25" y="176" width="510" height="22" fill="#e8e8e0" stroke="#999"/>
      <text x="35" y="192" font-size="11" fill="#333">表題部（敷地権の表示）</text>
      <rect x="25" y="204" width="300" height="28" fill="#fff3cd" stroke="#e6a700" stroke-width="2" rx="3"/>
      <text x="35" y="223" font-size="12" fill="#333">③ 敷地権の割合　1234567分の6789</text>
      <text x="35" y="255" font-size="12" font-weight="bold" fill="#c0392b">→ ①から総階数、②から所在階と専有面積、③から敷地権割合</text>
      <text x="35" y="275" font-size="11" fill="#666">※ 敷地権割合は「6789 ÷ 1234567」を小数で入力欄に自動計算できます</text>
      <text x="35" y="293" font-size="11" fill="#666">※ 築年数は建築年月日（一棟の建物の表示）から計算</text>
    </svg>`
  },
  zosei: {
    title:'宅地造成費の確認方法',
    doc:'国税庁「路線価図・評価倍率表」の各都道府県ページ →「宅地造成費の金額表」',
    note:'市街地農地・雑種地などを宅地並みに評価する際、造成にかかる費用を控除できます。金額は都道府県・年度ごとに国税局が定めています（例：整地費○円/㎡、土盛り○円/m³）。該当ページの金額を転記してください。通常の宅地では使いません。',
    fields:[
      ['整地費','おおむね数百円/㎡台。面積×単価'],
      ['伐採・抜根費','樹木がある場合。面積×単価'],
      ['地盤改良費','軟弱地盤の場合。面積×単価'],
      ['土盛費','低地の場合。体積(m³)×単価'],
      ['土止費','擁壁が必要な場合。面積(㎡)×単価'],
    ],
    svg:`<svg viewBox="0 0 560 200" xmlns="http://www.w3.org/2000/svg" style="width:100%;background:#fff;border:1px solid #ccc;border-radius:6px">
      <rect x="10" y="10" width="540" height="180" fill="#fdfdf8" stroke="#999"/>
      <text x="280" y="34" text-anchor="middle" font-size="14" font-weight="bold" fill="#333">宅地造成費の金額表（国税局が毎年公表）</text>
      <rect x="25" y="50" width="510" height="26" fill="#e8e8e0" stroke="#999"/>
      <text x="35" y="68" font-size="12" fill="#333">平坦地の宅地造成費（○○国税局・令和○年分）</text>
      <rect x="25" y="76" width="510" height="26" fill="#fff" stroke="#bbb"/>
      <text x="35" y="94" font-size="12" fill="#555">整地費　　1㎡あたり　○○○円</text>
      <rect x="25" y="102" width="510" height="26" fill="#fde2e0" stroke="#c0392b" stroke-width="2"/>
      <text x="35" y="120" font-size="12" fill="#333">土盛費　　1m³あたり　○,○○○円 ★該当する項目の単価を転記</text>
      <rect x="25" y="128" width="510" height="26" fill="#fff" stroke="#bbb"/>
      <text x="35" y="146" font-size="12" fill="#555">土止費　　1㎡あたり　○○,○○○円</text>
      <text x="35" y="178" font-size="11" fill="#666">※ rosenka.nta.go.jp → 都道府県選択 → 「この都道府県の宅地造成費等の金額表」</text>
    </svg>`
  },
};

/* ガイドモーダルを開く */
function openGuide(key){
  const g=GUIDE_DEFS[key]; if(!g) return;
  openModal('📖 '+g.title, `
    <div class="notice" style="margin-bottom:10px"><b>入手先:</b> ${esc(g.doc)}</div>
    ${g.svg}
    <p style="font-size:12px;color:var(--muted);margin:10px 0">${esc(g.note)}</p>
    <table class="list" style="margin-top:6px">
      <tr><th>項目</th><th>ポイント</th></tr>
      ${g.fields.map(f=>`<tr><td style="white-space:nowrap"><b>${esc(f[0])}</b></td><td>${esc(f[1])}</td></tr>`).join('')}
    </table>`,
    `<button class="btn primary" onclick="closeModal()">閉じる</button>`);
}
/* フィールド横の「どこを見る？」ボタン */
function guideBtn(key){
  return `<button type="button" class="btn sm ghost guide-btn" onclick="openGuide('${key}')">📖 どこを見る？</button>`;
}
