import { simulateLoan, maxBorrowable } from './calc.js';

const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
const yen = (n) => n.toLocaleString('ja-JP') + '円';
const man = (n) => (n / 10000).toLocaleString('ja-JP', { maximumFractionDigits: 1 }) + '万円';

const THIS_YEAR = new Date().getFullYear();
const NEXT_MONTH = new Date().getMonth() + 2; // 来月（1-12超過は年繰上げ）
const START_Y = NEXT_MONTH > 12 ? THIS_YEAR + 1 : THIS_YEAR;
const START_M = NEXT_MONTH > 12 ? 1 : NEXT_MONTH;

// ---------- プラン入力UIの生成 ----------

function monthOptions(selected) {
  let h = '';
  for (let m = 1; m <= 12; m++) h += `<option value="${m}" ${m === selected ? 'selected' : ''}>${m}月</option>`;
  return h;
}

function planTemplate(letter) {
  const isB = letter === 'B';
  return `
  <div class="plan-box plan-${letter.toLowerCase()}">
    <div class="plan-head">
      <h3>プラン${letter}</h3>
      ${isB ? `
        <span>
          <label class="chk"><input type="checkbox" id="useB" checked> 比較する</label>
          <button class="sub-btn" id="copyA">プランAをコピー</button>
        </span>` : ''}
    </div>
    <div class="plan-body" id="body${letter}">
      <div class="field inline">
        <div>
          <label class="fname">借入額</label>
          <input type="number" id="principal${letter}" value="3000" min="1" step="10"><span class="unit">万円</span>
        </div>
        <div>
          <label class="fname">うちボーナス返済分</label>
          <input type="number" id="bonus${letter}" value="0" min="0" step="10"><span class="unit">万円</span>
        </div>
      </div>
      <div class="field inline">
        <div>
          <label class="fname">ボーナス月</label>
          <select id="bonusM1${letter}">${monthOptions(1)}</select>
          <select id="bonusM2${letter}">${monthOptions(8)}</select>
        </div>
      </div>
      <div class="field inline">
        <div>
          <label class="fname">返済期間</label>
          <input type="number" id="years${letter}" value="35" min="1" max="50">
          <span class="unit">年</span>
          <input type="number" id="extraM${letter}" value="0" min="0" max="11">
          <span class="unit">ヶ月</span>
        </div>
        <div>
          <label class="fname">返済方法</label>
          <select id="method${letter}">
            <option value="level">元利均等</option>
            <option value="principal">元金均等</option>
          </select>
        </div>
      </div>
      <div class="field inline">
        <div>
          <label class="fname">返済開始</label>
          <input type="number" id="startY${letter}" value="${START_Y}" min="1990" max="2100">
          <span class="unit">年</span>
          <select id="startM${letter}">${monthOptions(START_M)}</select>
        </div>
      </div>

      <div class="subsec">
        <p class="subsec-title">金利（段階金利は行を追加）</p>
        <div class="row-list" id="rates${letter}"></div>
        <button class="sub-btn add-rate" data-plan="${letter}">＋ 金利変更を追加</button>
      </div>

      <div class="subsec">
        <p class="subsec-title">繰上げ返済（何回でも追加可）</p>
        <div class="row-list" id="preps${letter}"></div>
        <button class="sub-btn add-prep" data-plan="${letter}">＋ 繰上げ返済を追加</button>
      </div>
    </div>
  </div>`;
}

function rateRow(plan, fromYear = 11, pct = 1.5, first = false) {
  const div = document.createElement('div');
  div.className = 'rrow rate-row';
  div.innerHTML = first
    ? `当初から <input type="number" class="r-pct" value="${pct}" step="0.01" min="0"><span class="unit">％</span>`
    : `<input type="number" class="r-from" value="${fromYear}" min="2" max="50"><span class="unit">年目から</span>
       <input type="number" class="r-pct" value="${pct}" step="0.01" min="0"><span class="unit">％</span>
       <button class="del-btn">削除</button>`;
  return div;
}

function prepRow(plan, y = 5, m = 1, amount = 100, type = 'shorten') {
  const div = document.createElement('div');
  div.className = 'rrow prep-row';
  div.innerHTML = `
    <input type="number" class="p-year" value="${y}" min="1" max="50"><span class="unit">年目</span>
    <input type="number" class="p-month" value="${m}" min="1" max="12"><span class="unit">ヶ月目に</span>
    <input type="number" class="p-amount" value="${amount}" min="1" step="10"><span class="unit">万円</span>
    <select class="p-type">
      <option value="shorten" ${type === 'shorten' ? 'selected' : ''}>期間短縮型</option>
      <option value="reduce" ${type === 'reduce' ? 'selected' : ''}>返済額軽減型</option>
    </select>
    <button class="del-btn">削除</button>`;
  return div;
}

// ---------- プラン入力の読み取り ----------

function readPlan(letter) {
  const v = (id) => parseFloat($('#' + id + letter).value) || 0;
  const principal = Math.round(v('principal') * 10000);
  const bonusPrincipal = Math.round(v('bonus') * 10000);
  const months = Math.round(v('years') * 12 + v('extraM'));
  if (principal <= 0 || months <= 0) return null;

  const rates = [];
  $$('#rates' + letter + ' .rate-row').forEach((row, i) => {
    const pct = parseFloat($('.r-pct', row).value) || 0;
    const fromY = i === 0 ? 1 : (parseInt($('.r-from', row).value) || 1);
    rates.push({ fromMonth: i === 0 ? 1 : (fromY - 1) * 12 + 1, annual: pct / 100 });
  });
  rates.sort((a, b) => a.fromMonth - b.fromMonth);

  const prepayments = [];
  $$('#preps' + letter + ' .prep-row').forEach((row) => {
    const y = parseInt($('.p-year', row).value) || 1;
    const m = parseInt($('.p-month', row).value) || 1;
    const amount = Math.round((parseFloat($('.p-amount', row).value) || 0) * 10000);
    if (amount > 0) {
      prepayments.push({ month: (y - 1) * 12 + m, amount, type: $('.p-type', row).value });
    }
  });

  const bonusMonths = bonusPrincipal > 0
    ? [...new Set([parseInt($('#bonusM1' + letter).value), parseInt($('#bonusM2' + letter).value)])]
    : [];

  return {
    principal, bonusPrincipal, months,
    method: $('#method' + letter).value,
    rates,
    startYear: Math.round(v('startY')),
    startMonth: parseInt($('#startM' + letter).value),
    bonusMonths, prepayments,
  };
}

// ---------- 結果表示 ----------

let resultA = null;
let resultB = null;
const cfgCache = { A: null, B: null };

function fmtTerm(m) {
  const y = Math.floor(m / 12), r = m % 12;
  return r === 0 ? `${y}年` : `${y}年${r}ヶ月`;
}

function renderSummary() {
  const el = $('#summary');
  if (!resultA) { el.innerHTML = '<p class="hint">プランAの条件を入力してください。</p>'; return; }
  const a = resultA.summary;
  const b = resultB ? resultB.summary : null;

  const diffCell = (va, vb, lowerIsBetter = true, fmt = yen) => {
    if (vb == null) return '';
    const d = vb - va;
    const cls = d === 0 ? '' : (d < 0) === lowerIsBetter ? 'diff-good' : 'diff-bad';
    const sign = d > 0 ? '+' : d < 0 ? '−' : '±';
    return `<td class="${cls}">${sign}${fmt(Math.abs(d))}</td>`;
  };

  const rows = [
    ['借入額', man(a.principal), b ? man(b.principal) : null, diffCell(a.principal, b?.principal, true, man)],
    ['毎月返済額（当初）', `<span class="big-num">${yen(a.firstPayment)}</span>`, b ? `<span class="big-num">${yen(b.firstPayment)}</span>` : null, diffCell(a.firstPayment, b?.firstPayment)],
    ['実際の返済期間', fmtTerm(a.months), b ? fmtTerm(b.months) : null, diffCell(a.months, b?.months, true, (n) => fmtTerm(n))],
    ['完済時期', `${a.endYear}年${a.endMonth}月`, b ? `${b.endYear}年${b.endMonth}月` : null, b ? '<td></td>' : ''],
    ['繰上げ返済額 合計', yen(a.totalPrepaid), b ? yen(b.totalPrepaid) : null, b ? '<td></td>' : ''],
    ['利息 合計', yen(a.totalInterest), b ? yen(b.totalInterest) : null, diffCell(a.totalInterest, b?.totalInterest)],
    ['総返済額', `<span class="big-num">${yen(a.totalPaid)}</span>`, b ? `<span class="big-num">${yen(b.totalPaid)}</span>` : null, diffCell(a.totalPaid, b?.totalPaid)],
  ];

  let h = `<div class="table-wrap"><table class="result"><tr><th></th><th class="col-a">プランA</th>${b ? '<th class="col-b">プランB</th><th>差（B−A）</th>' : ''}</tr>`;
  for (const [name, va, vb, dc] of rows) {
    h += `<tr><td class="rowname">${name}</td><td class="col-a">${va}</td>${b ? `<td class="col-b">${vb}</td>${dc || '<td></td>'}` : ''}</tr>`;
  }
  h += '</table></div>';

  if (b) {
    const saved = a.totalInterest - b.totalInterest;
    const shortened = a.months - b.months;
    if (saved !== 0 || shortened !== 0) {
      const better = saved >= 0 ? 'B' : 'A';
      const savedAbs = Math.abs(saved);
      h += `<div class="effect-box">プラン${better}のほうが利息が <strong>${yen(savedAbs)}</strong> 少なく、`
        + (shortened !== 0 ? `返済期間は <strong>${fmtTerm(Math.abs(shortened))}</strong> ${(shortened > 0 ? '短く' : '長く')}なります（B基準）。` : '返済期間は同じです。')
        + '</div>';
    }
  }
  el.innerHTML = h;
}

// ---------- プラン比較表（年次・Excel住宅ローン比較表と同形式） ----------

function rateLabel(cfg) {
  if (!cfg || !cfg.rates || cfg.rates.length === 0) return '';
  const pct = (r) => (r.annual * 100).toFixed(3).replace(/0+$/, '').replace(/\.$/, '') + '%';
  if (cfg.rates.length === 1) return `${pct(cfg.rates[0])}（固定）`;
  return `当初${pct(cfg.rates[0])}〜（段階${cfg.rates.length}区分）`;
}

// 各年の代表値（返済額・利息・元金は「その年の初回月」の月額、残高は年末残高）
function yearlyRows(res) {
  const out = [];
  for (let i = 0; i < res.rows.length; i += 12) {
    const chunk = res.rows.slice(i, i + 12);
    const first = chunk[0];
    const last = chunk[chunk.length - 1];
    const prepaid = chunk.reduce((s, r) => s + r.prepaid, 0);
    out.push({
      year: i / 12 + 1,
      rate: first.rate,
      payment: first.payment,
      interest: first.interest,
      principal: first.principal,
      balance: last.balance,
      prepaid,
    });
  }
  return out;
}

function renderCompareTable() {
  const el = $('#compare');
  const panel = $('#compare-panel');
  if (!resultA || !resultB) {
    panel.classList.add('hidden');
    el.innerHTML = '';
    return;
  }
  panel.classList.remove('hidden');

  const a = resultA.summary, b = resultB.summary;
  const ya = yearlyRows(resultA), yb = yearlyRows(resultB);
  const maxY = Math.max(ya.length, yb.length);

  // 上部：条件・合計の対比ブロック
  let h = `<div class="table-wrap"><table class="result cmp-head">
    <tr><th></th><th class="col-a">プランA</th><th class="col-b">プランB</th></tr>
    <tr><td class="rowname">借入額合計</td><td class="col-a">${yen(a.principal)}</td><td class="col-b">${yen(b.principal)}</td></tr>
    <tr><td class="rowname">金利</td><td class="col-a">${rateLabel(cfgCache.A)}</td><td class="col-b">${rateLabel(cfgCache.B)}</td></tr>
    <tr><td class="rowname">期間</td><td class="col-a">${fmtTerm(a.plannedMonths)}</td><td class="col-b">${fmtTerm(b.plannedMonths)}</td></tr>
    <tr><td class="rowname">返済方法</td><td class="col-a">${cfgCache.A.method === 'level' ? '元利均等' : '元金均等'}</td><td class="col-b">${cfgCache.B.method === 'level' ? '元利均等' : '元金均等'}</td></tr>
    <tr><td class="rowname">返済額合計</td><td class="col-a"><b>${yen(a.totalPaid)}</b></td><td class="col-b"><b>${yen(b.totalPaid)}</b></td></tr>
    <tr><td class="rowname">利息合計</td><td class="col-a">${yen(a.totalInterest)}</td><td class="col-b">${yen(b.totalInterest)}</td></tr>
  </table></div>`;

  // 年次の横並び表
  h += `<div class="table-wrap cmp-wrap"><table class="sched cmp">
    <thead>
      <tr>
        <th rowspan="2">年</th>
        <th colspan="5" class="grp-a">プランA</th>
        <th colspan="5" class="grp-b">プランB</th>
        <th rowspan="2">月額差<br>(B−A)</th>
      </tr>
      <tr>
        <th class="grp-a">金利</th><th class="grp-a">返済額</th><th class="grp-a">利息</th><th class="grp-a">元金</th><th class="grp-a">元金残高</th>
        <th class="grp-b">金利</th><th class="grp-b">返済額</th><th class="grp-b">利息</th><th class="grp-b">元金</th><th class="grp-b">元金残高</th>
      </tr>
    </thead><tbody>`;

  const cell = (r) => r
    ? `<td>${(r.rate * 100).toFixed(3)}%</td><td>${r.payment.toLocaleString()}</td>
       <td>${r.interest.toLocaleString()}</td><td>${r.principal.toLocaleString()}</td>
       <td>${r.balance.toLocaleString()}${r.prepaid ? `<br><span class="prep-tag">繰上${(r.prepaid / 10000).toLocaleString()}万</span>` : ''}</td>`
    : '<td>-</td><td>-</td><td>-</td><td>-</td><td>0</td>';

  for (let i = 0; i < maxY; i++) {
    const ra = ya[i], rb = yb[i];
    const diff = (rb ? rb.payment : 0) - (ra ? ra.payment : 0);
    const dcls = diff < 0 ? 'diff-good' : diff > 0 ? 'diff-bad' : '';
    const dtxt = (!ra || !rb) ? '' : (diff === 0 ? '±0' : (diff > 0 ? '+' : '−') + Math.abs(diff).toLocaleString());
    const rowCls = (ra && ra.prepaid) || (rb && rb.prepaid) ? 'prepay-row' : '';
    h += `<tr class="${rowCls}"><td>${i + 1}</td>${cell(ra)}${cell(rb)}<td class="${dcls}">${dtxt}</td></tr>`;
  }
  h += '</tbody></table></div>';

  // 差額サマリー
  const diffTotal = b.totalPaid - a.totalPaid;
  const diffInt = b.totalInterest - a.totalInterest;
  const better = diffTotal < 0 ? 'B' : diffTotal > 0 ? 'A' : null;
  if (better) {
    h += `<div class="effect-box">総返済額はプラン${better}のほうが <strong>${yen(Math.abs(diffTotal))}</strong> 少なくなります`
      + `（利息差 ${yen(Math.abs(diffInt))}）。`
      + (Math.abs(a.months - b.months) > 0 ? `返済期間の差は ${fmtTerm(Math.abs(a.months - b.months))} です。` : '')
      + '</div>';
  }
  el.innerHTML = h;
}

// ---------- グラフ ----------

function renderChart() {
  const canvas = $('#chart');
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!resultA) return;

  const series = [{ rows: resultA.rows, color: '#1976d2', name: 'プランA' }];
  if (resultB) series.push({ rows: resultB.rows, color: '#e65100', name: 'プランB' });

  const maxMonths = Math.max(...series.map((s) => s.rows.length));
  const maxBal = Math.max(...series.map((s) => Math.max(...s.rows.map((r) => r.balance))));
  const padL = 70, padR = 20, padT = 16, padB = 34;
  const W = canvas.width - padL - padR, H = canvas.height - padT - padB;

  // 目盛り
  ctx.strokeStyle = '#e2e8f0';
  ctx.fillStyle = '#6b7280';
  ctx.font = '12px sans-serif';
  ctx.textAlign = 'right';
  const ySteps = 5;
  for (let i = 0; i <= ySteps; i++) {
    const val = (maxBal / ySteps) * i;
    const y = padT + H - (H / ySteps) * i;
    ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(padL + W, y); ctx.stroke();
    ctx.fillText(Math.round(val / 10000).toLocaleString() + '万', padL - 6, y + 4);
  }
  ctx.textAlign = 'center';
  const yearStep = Math.max(5, Math.ceil(maxMonths / 12 / 8) * 5);
  for (let yr = 0; yr * 12 <= maxMonths; yr += yearStep) {
    const x = padL + (W * yr * 12) / maxMonths;
    ctx.fillText(yr + '年', x, padT + H + 20);
  }

  for (const s of series) {
    ctx.strokeStyle = s.color;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(padL, padT + H - (H * (s.rows[0] ? s.rows[0].balance + s.rows[0].principal + s.rows[0].bonusPrincipal : 0)) / maxBal);
    s.rows.forEach((r, i) => {
      const x = padL + (W * (i + 1)) / maxMonths;
      const y = padT + H - (H * r.balance) / maxBal;
      ctx.lineTo(x, y);
    });
    ctx.stroke();
  }

  $('#chart-legend').innerHTML = series
    .map((s) => `<span><span class="sw" style="background:${s.color}"></span>${s.name}</span>`)
    .join('');
}

// ---------- 償還表 ----------

function currentScheduleResult() {
  const plan = $('input[name="sched-plan"]:checked').value;
  return plan === 'B' ? resultB : resultA;
}

function renderSchedule() {
  const el = $('#schedule');
  const res = currentScheduleResult();
  if (!res) { el.innerHTML = '<p class="hint">選択したプランは計算されていません。</p>'; return; }
  const mode = $('input[name="sched-mode"]:checked').value;

  if (mode === 'month') {
    let h = `<table class="sched"><tr>
      <th>回</th><th>年月</th><th>金利</th><th>返済額</th><th>うち元金</th><th>うち利息</th>
      <th>ボーナス加算</th><th>繰上げ返済</th><th>残高</th></tr>`;
    for (const r of res.rows) {
      const cls = r.prepaid > 0 ? 'prepay-row' : '';
      h += `<tr class="${cls}"><td>${r.no}</td><td>${r.year}/${String(r.month).padStart(2, '0')}</td>
        <td>${(r.rate * 100).toFixed(3)}%</td><td>${r.payment.toLocaleString()}</td>
        <td>${r.principal.toLocaleString()}</td><td>${r.interest.toLocaleString()}</td>
        <td class="bonus">${r.bonusPayment ? r.bonusPayment.toLocaleString() : ''}</td>
        <td>${r.prepaid ? r.prepaid.toLocaleString() + (r.prepayType === 'reduce' ? '（軽減）' : '（短縮）') : ''}</td>
        <td>${r.balance.toLocaleString()}</td></tr>`;
    }
    el.innerHTML = h + '</table>';
  } else {
    let h = `<table class="sched"><tr>
      <th>年目</th><th>年</th><th>返済額 計</th><th>うち元金</th><th>うち利息</th>
      <th>ボーナス返済 計</th><th>繰上げ返済</th><th>年末残高</th></tr>`;
    for (let i = 0; i < res.rows.length; i += 12) {
      const chunk = res.rows.slice(i, i + 12);
      const sum = (f) => chunk.reduce((s, r) => s + f(r), 0);
      const last = chunk[chunk.length - 1];
      const prepaid = sum((r) => r.prepaid);
      h += `<tr class="${prepaid > 0 ? 'prepay-row' : ''}"><td>${i / 12 + 1}</td><td>${chunk[0].year}〜</td>
        <td>${sum((r) => r.payment).toLocaleString()}</td>
        <td>${sum((r) => r.principal).toLocaleString()}</td>
        <td>${sum((r) => r.interest).toLocaleString()}</td>
        <td class="bonus">${sum((r) => r.bonusPayment).toLocaleString()}</td>
        <td>${prepaid ? prepaid.toLocaleString() : ''}</td>
        <td>${last.balance.toLocaleString()}</td></tr>`;
    }
    el.innerHTML = h + '</table>';
  }
}

function downloadCSV() {
  const res = currentScheduleResult();
  if (!res) return;
  const plan = $('input[name="sched-plan"]:checked').value;
  const lines = ['回,年,月,金利(%),返済額,うち元金,うち利息,ボーナス加算,繰上げ返済,残高'];
  for (const r of res.rows) {
    lines.push([r.no, r.year, r.month, (r.rate * 100).toFixed(3), r.payment, r.principal, r.interest, r.bonusPayment, r.prepaid, r.balance].join(','));
  }
  const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv' });
  const aEl = document.createElement('a');
  aEl.href = URL.createObjectURL(blob);
  aEl.download = `償還表_プラン${plan}.csv`;
  aEl.click();
  URL.revokeObjectURL(aEl.href);
}

// ---------- 借入可能額 ----------

function renderBorrowable() {
  $('#borrowable').innerHTML = `
    <div class="field inline">
      <div>
        <label class="fname">試算方法</label>
        <select id="bw-mode">
          <option value="income">年収から</option>
          <option value="monthly">希望の毎月返済額から</option>
        </select>
      </div>
      <div id="bw-income-fields">
        <label class="fname">年収 / 返済負担率</label>
        <input type="number" id="bw-income" value="600" min="0" step="10"><span class="unit">万円</span>
        <select id="bw-ratio">
          <option value="0.20">20%</option>
          <option value="0.25">25%</option>
          <option value="0.30">30%</option>
          <option value="0.35" selected>35%</option>
        </select>
      </div>
      <div id="bw-monthly-fields" class="hidden">
        <label class="fname">毎月返済額</label>
        <input type="number" id="bw-monthly" value="10" min="0" step="0.5"><span class="unit">万円</span>
      </div>
      <div>
        <label class="fname">審査金利</label>
        <input type="number" id="bw-rate" value="3.5" step="0.01" min="0"><span class="unit">％</span>
      </div>
      <div>
        <label class="fname">期間</label>
        <input type="number" id="bw-years" value="35" min="1" max="50"><span class="unit">年</span>
      </div>
    </div>
    <div class="effect-box" id="bw-result"></div>`;

  const update = () => {
    const mode = $('#bw-mode').value;
    $('#bw-income-fields').classList.toggle('hidden', mode !== 'income');
    $('#bw-monthly-fields').classList.toggle('hidden', mode !== 'monthly');
    const annual = (parseFloat($('#bw-rate').value) || 0) / 100;
    const months = (parseInt($('#bw-years').value) || 35) * 12;
    let amt;
    if (mode === 'income') {
      const income = (parseFloat($('#bw-income').value) || 0) * 10000;
      const ratio = parseFloat($('#bw-ratio').value);
      amt = maxBorrowable({ annualIncome: income, ratio, annual, months });
      $('#bw-result').innerHTML = `年収の${Math.round(ratio * 100)}%を返済に充てる場合の借入可能額（概算）: <strong>${man(Math.floor(amt / 10000) * 10000)}</strong>（毎月返済額 約${yen(Math.round((income * ratio) / 12))}）`;
    } else {
      const monthly = (parseFloat($('#bw-monthly').value) || 0) * 10000;
      amt = maxBorrowable({ desiredMonthly: monthly, annual, months });
      $('#bw-result').innerHTML = `毎月${man(monthly)}の返済で借りられる金額（概算）: <strong>${man(Math.floor(amt / 10000) * 10000)}</strong>`;
    }
  };
  $('#borrowable').addEventListener('input', update);
  update();
}

// ---------- 再計算・初期化 ----------

function recalc() {
  resultA = null;
  resultB = null;
  cfgCache.A = readPlan('A');
  cfgCache.B = null;
  if (cfgCache.A) resultA = simulateLoan(cfgCache.A);
  if ($('#useB').checked) {
    cfgCache.B = readPlan('B');
    if (cfgCache.B) resultB = simulateLoan(cfgCache.B);
  }
  $('#bodyB').style.opacity = $('#useB').checked ? '1' : '0.4';
  renderSummary();
  renderChart();
  renderSchedule();
  renderCompareTable();
}

function copyPlanAtoB() {
  ['principal', 'bonus', 'years', 'extraM', 'startY'].forEach((id) => {
    $('#' + id + 'B').value = $('#' + id + 'A').value;
  });
  ['method', 'bonusM1', 'bonusM2', 'startM'].forEach((id) => {
    $('#' + id + 'B').value = $('#' + id + 'A').value;
  });
  // 金利行
  const ratesB = $('#ratesB');
  ratesB.innerHTML = '';
  $$('#ratesA .rate-row').forEach((row, i) => {
    const pct = parseFloat($('.r-pct', row).value) || 0;
    const fromY = i === 0 ? 1 : parseInt($('.r-from', row).value) || 2;
    ratesB.appendChild(rateRow('B', fromY, pct, i === 0));
  });
  // 繰上げ返済行
  const prepsB = $('#prepsB');
  prepsB.innerHTML = '';
  $$('#prepsA .prep-row').forEach((row) => {
    prepsB.appendChild(prepRow('B',
      parseInt($('.p-year', row).value), parseInt($('.p-month', row).value),
      parseFloat($('.p-amount', row).value), $('.p-type', row).value));
  });
  recalc();
}

function init() {
  $('#planA').innerHTML = planTemplate('A');
  $('#planB').innerHTML = planTemplate('B');
  $('#ratesA').appendChild(rateRow('A', 1, 1.5, true));
  $('#ratesB').appendChild(rateRow('B', 1, 1.5, true));
  // デモ用の初期値: プランBに繰上げ返済を1件入れて比較が見える状態にする
  $('#prepsB').appendChild(prepRow('B', 5, 1, 100, 'shorten'));

  document.body.addEventListener('input', (e) => {
    if (e.target.closest('#borrowable')) return;
    recalc();
  });
  document.body.addEventListener('click', (e) => {
    const t = e.target;
    if (t.classList.contains('add-rate')) {
      $('#rates' + t.dataset.plan).appendChild(rateRow(t.dataset.plan));
      recalc();
    } else if (t.classList.contains('add-prep')) {
      $('#preps' + t.dataset.plan).appendChild(prepRow(t.dataset.plan));
      recalc();
    } else if (t.classList.contains('del-btn')) {
      t.closest('.rrow').remove();
      recalc();
    } else if (t.id === 'copyA') {
      copyPlanAtoB();
    } else if (t.id === 'csv-btn') {
      downloadCSV();
    } else if (t.name === 'sched-plan' || t.name === 'sched-mode') {
      renderSchedule();
    } else if (t.id === 'useB') {
      recalc();
    }
  });

  renderBorrowable();
  recalc();
}

init();
