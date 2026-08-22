// 住宅ローン計算エンジン（アイローンカルク同等機能）
// 金額はすべて「円」、金利は年利（小数: 1.5% → 0.015）、期間は「ヶ月」で扱う。

/**
 * 元利均等返済の毎回返済額を計算する
 * @param {number} balance 残高（円）
 * @param {number} monthlyRate 月利
 * @param {number} n 残り回数
 * @returns {number} 毎回返済額（円・四捨五入）
 */
export function levelPayment(balance, monthlyRate, n) {
  if (n <= 0) return 0;
  if (monthlyRate === 0) return Math.round(balance / n);
  const k = Math.pow(1 + monthlyRate, n);
  return Math.round((balance * monthlyRate * k) / (k - 1));
}

/**
 * 指定回（1始まり）に適用される年利を金利セグメントから求める
 * @param {Array<{fromMonth:number, annual:number}>} rates
 */
export function rateAt(rates, month) {
  let r = rates[0].annual;
  for (const seg of rates) {
    if (month >= seg.fromMonth) r = seg.annual;
  }
  return r;
}

/**
 * ローンを1本シミュレーションする
 * @param {object} cfg
 *   principal      総借入額（円）
 *   bonusPrincipal うちボーナス返済分（円）
 *   months         返済期間（ヶ月）
 *   method         'level'（元利均等） | 'principal'（元金均等）
 *   rates          [{fromMonth: 1, annual: 0.015}, ...] fromMonthは回数（1始まり）
 *   startYear/startMonth 返済開始年月（完済時期・ボーナス月判定用）
 *   bonusMonths    ボーナス返済月 [1,7] など（カレンダー月）
 *   prepayments    [{month: 回数, amount: 円, type: 'shorten'|'reduce'}]
 * @returns {object} { rows, summary }
 */
export function simulateLoan(cfg) {
  let {
    principal,
    bonusPrincipal = 0,
    months,
    method = 'level',
    rates = [{ fromMonth: 1, annual: 0.01 }],
    startYear = new Date().getFullYear(),
    startMonth = 1,
    bonusMonths = [],
    prepayments = [],
  } = cfg;

  // ボーナス返済月が未指定ならボーナス分は毎月分に合算する
  if (bonusMonths.length === 0) bonusPrincipal = 0;
  const monthlyPrincipalTotal = principal - bonusPrincipal;

  // ---- ボーナス分を先に半年賦として計算 ----
  const bonusSchedule = new Map(); // 回数 -> {payment, principal, interest, balance}
  const bonusBalanceAt = new Array(months + 1).fill(bonusPrincipal); // 各回終了時点のボーナス分残高
  let bonusTotalPaid = 0;
  if (bonusPrincipal > 0 && bonusMonths.length > 0) {
    // ボーナス支払が発生する回数（ローン回数ベース）の一覧
    const bonusHits = [];
    for (let m = 1; m <= months; m++) {
      const calMonth = ((startMonth - 1 + (m - 1)) % 12) + 1;
      if (bonusMonths.includes(calMonth)) bonusHits.push(m);
    }
    if (bonusHits.length > 0) {
      let bal = bonusPrincipal;
      const nb = bonusHits.length;
      // 半年賦の1回あたり利率 = 年利/2（段階金利は各時点の利率を使用）
      let pay = null;
      let prevRate = null;
      for (let i = 0; i < nb; i++) {
        const m = bonusHits[i];
        const annual = rateAt(rates, m);
        const halfRate = annual / 2;
        if (pay === null || annual !== prevRate) {
          // 金利変更時は残回数で再計算（元利均等ベース）
          const remain = nb - i;
          if (halfRate === 0) pay = Math.round(bal / remain);
          else {
            const k = Math.pow(1 + halfRate, remain);
            pay = Math.round((bal * halfRate * k) / (k - 1));
          }
          prevRate = annual;
        }
        const interest = Math.floor(bal * halfRate);
        let prin = pay - interest;
        let payment = pay;
        if (i === nb - 1 || prin >= bal) {
          prin = bal;
          payment = prin + interest;
        }
        bal -= prin;
        bonusTotalPaid += payment;
        bonusSchedule.set(m, { payment, principal: prin, interest, balance: bal });
        for (let j = m; j <= months; j++) bonusBalanceAt[j] = bal;
        if (bal <= 0) break;
      }
    }
  }

  // ---- 毎月分のシミュレーション ----
  const prepayMap = new Map();
  for (const p of prepayments) {
    if (!p || !p.amount || p.amount <= 0) continue;
    const list = prepayMap.get(p.month) || [];
    list.push(p);
    prepayMap.set(p.month, list);
  }

  const rows = [];
  let balance = monthlyPrincipalTotal;
  let payment = null; // 元利均等の毎回返済額
  let fixedPrincipal = null; // 元金均等の毎回元金
  let prevAnnual = null;
  let totalPaid = 0;
  let totalPrepaid = 0;
  let totalInterest = 0;
  let lastMonth = 0;

  for (let m = 1; m <= months && balance > 0; m++) {
    const annual = rateAt(rates, m);
    const mr = annual / 12;
    const remaining = months - m + 1;

    if (method === 'level') {
      if (payment === null || annual !== prevAnnual) {
        payment = levelPayment(balance, mr, remaining);
      }
    } else {
      if (fixedPrincipal === null) {
        fixedPrincipal = Math.round(monthlyPrincipalTotal / months);
      }
    }
    prevAnnual = annual;

    const interest = Math.floor(balance * mr);
    let prin, pay;
    if (method === 'level') {
      prin = payment - interest;
      pay = payment;
    } else {
      prin = fixedPrincipal;
      pay = prin + interest;
    }
    if (m === months || prin >= balance) {
      prin = balance;
      pay = prin + interest;
    }
    balance -= prin;
    totalPaid += pay;
    totalInterest += interest;

    // 繰上げ返済（当該回の返済後に実行）
    let prepaidThis = 0;
    let prepayType = null;
    const preps = prepayMap.get(m);
    if (preps && balance > 0) {
      for (const p of preps) {
        const amt = Math.min(p.amount, balance);
        balance -= amt;
        prepaidThis += amt;
        totalPrepaid += amt;
        prepayType = p.type;
        if (balance > 0 && p.type === 'reduce') {
          // 返済額軽減: 期間は維持し返済額を再計算
          if (method === 'level') {
            payment = levelPayment(balance, mr, months - m);
          } else {
            fixedPrincipal = Math.round(balance / (months - m));
          }
        }
        // 期間短縮: 返済額を維持 → ループが早く終わる
      }
    }

    const bonus = bonusSchedule.get(m) || null;
    const calMonthIdx = startMonth - 1 + (m - 1);
    rows.push({
      no: m,
      year: startYear + Math.floor(calMonthIdx / 12),
      month: (calMonthIdx % 12) + 1,
      rate: annual,
      payment: pay,
      principal: prin,
      interest,
      prepaid: prepaidThis,
      prepayType,
      bonusPayment: bonus ? bonus.payment : 0,
      bonusPrincipal: bonus ? bonus.principal : 0,
      bonusInterest: bonus ? bonus.interest : 0,
      balance: balance + bonusBalanceAt[m],
      monthlyBalance: balance,
    });
    lastMonth = m;
  }

  // ボーナス分利息合計
  let bonusInterestTotal = 0;
  for (const b of bonusSchedule.values()) bonusInterestTotal += b.interest;

  const firstRow = rows[0] || { payment: 0 };
  const grandTotal = totalPaid + totalPrepaid + bonusTotalPaid;
  const endIdx = startMonth - 1 + (lastMonth - 1);

  return {
    rows,
    summary: {
      principal,
      bonusPrincipal,
      months: lastMonth,
      plannedMonths: months,
      firstPayment: firstRow.payment,
      totalPaid: grandTotal,
      totalInterest: totalInterest + bonusInterestTotal,
      totalPrepaid,
      endYear: startYear + Math.floor(endIdx / 12),
      endMonth: (endIdx % 12) + 1,
    },
  };
}

/**
 * 借入可能額の試算
 * @param {object} p { annualIncome?, ratio?, desiredMonthly?, annual, months }
 *   annualIncome: 年収（円）・ratio: 返済負担率（0.35など） または desiredMonthly: 希望月返済額（円）
 *   annual: 審査金利（年利小数）、months: 期間
 * @returns {number} 借入可能額（円）
 */
export function maxBorrowable(p) {
  const monthly = p.desiredMonthly != null
    ? p.desiredMonthly
    : (p.annualIncome * p.ratio) / 12;
  const mr = p.annual / 12;
  if (mr === 0) return Math.floor(monthly * p.months);
  const k = Math.pow(1 + mr, p.months);
  return Math.floor((monthly * (k - 1)) / (mr * k));
}
