// R8 行政書士 記述式120問アプリ
(function(){
"use strict";

var QUESTIONS = [];
(window.QUESTION_SETS || []).forEach(function(set){ QUESTIONS = QUESTIONS.concat(set); });

var STORAGE_KEY = "r8kijutsu_history_v1";
var MODE_KEY = "r8kijutsu_mode_v1"; // "practice" | "exam"
var SUBJECT_KEY = "r8kijutsu_subject_v1"; // "" | "行政法" | "民法"
var app = document.getElementById("app");

function getFlowMode(){
  var m = localStorage.getItem(MODE_KEY);
  return (m === "exam") ? "exam" : "practice";
}
window.setFlowMode = function(m){
  localStorage.setItem(MODE_KEY, m);
  renderHome();
};

// ---------- 科目選択（トップで絞り込み） ----------
function getSubject(){
  var s = localStorage.getItem(SUBJECT_KEY);
  return (s === "行政法" || s === "民法") ? s : "";
}
window.setSubject = function(s){
  localStorage.setItem(SUBJECT_KEY, s);
  renderHome();
};
// 選択中の科目に絞った問題（未選択なら全問）
function activeQuestions(){
  var s = getSubject();
  return s ? QUESTIONS.filter(function(q){ return q.sub === s; }) : QUESTIONS.slice();
}

// ---------- 履歴ストレージ ----------
function loadHistory(){
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"); }
  catch(e){ return []; }
}
function saveAttempt(qid, score, ans, hits, mode){
  var h = loadHistory();
  h.push({qid:qid, date:new Date().toISOString(), score:score, ans:ans, hits:hits, mode:mode || "practice"});
  localStorage.setItem(STORAGE_KEY, JSON.stringify(h));
}
function attemptsOf(qid){
  return loadHistory().filter(function(a){ return a.qid === qid; });
}
function lastAttempt(qid){
  var a = attemptsOf(qid);
  return a.length ? a[a.length-1] : null;
}
function bestScore(qid){
  var a = attemptsOf(qid);
  return a.length ? Math.max.apply(null, a.map(function(x){return x.score;})) : null;
}

// ---------- 反復（間隔反復）ロジック ----------
// 直近得点 16点以上→7日後 / 10〜15点→3日後 / 10点未満→翌日 / 未回答→常に対象
function intervalDays(score){ return score >= 16 ? 7 : (score >= 10 ? 3 : 1); }
function dueDate(qid){
  var la = lastAttempt(qid);
  if(!la) return null; // 未回答
  var d = new Date(la.date);
  d.setDate(d.getDate() + intervalDays(la.score));
  return d;
}
function isDue(qid){
  var la = lastAttempt(qid);
  if(!la) return true;
  return new Date() >= dueDate(qid);
}
function dueQuestions(){
  return activeQuestions().filter(function(q){ return isDue(q.id); })
    .sort(function(a,b){
      var la = lastAttempt(a.id), lb = lastAttempt(b.id);
      var sa = la ? la.score : -1, sb = lb ? lb.score : -1;
      return sa - sb; // 未回答・低得点を先に
    });
}

// ---------- ユーティリティ ----------
function esc(s){
  return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}
function fmtDate(iso){
  var d = new Date(iso);
  return d.getFullYear() + "/" + (d.getMonth()+1) + "/" + d.getDate() + " " +
         ("0"+d.getHours()).slice(-2) + ":" + ("0"+d.getMinutes()).slice(-2);
}
function scoreClass(s){ return s >= 16 ? "score-good" : (s >= 10 ? "score-mid" : "score-bad"); }
function subBadge(q){
  return '<span class="badge ' + (q.sub === "行政法" ? "sub-g" : "sub-m") + '">' + q.sub + '</span>';
}
function rankBadge(q){ return '<span class="badge ' + q.rank + '">' + q.rank + '</span>'; }
// 全角スペース等を除去して照合
function normalize(s){
  return String(s).replace(/[\s　]/g,"")
    .replace(/[０-９]/g, function(c){ return String.fromCharCode(c.charCodeAt(0) - 0xFEE0); });
}
function normForMatch(s){
  // 照合用: ユーザー答案と照合語の両方に適用
  return normalize(s).replace(/[Ａ-Ｚａ-ｚ]/g, function(c){ return String.fromCharCode(c.charCodeAt(0) - 0xFEE0); });
}
function kwMatched(kw, ans){
  var a = normForMatch(ans);
  return (kw.m || []).some(function(frag){ return frag && a.indexOf(normForMatch(frag)) !== -1; });
}

// ---------- 画面遷移 ----------
var state = { queue: [], idx: 0, step: 1, mode: "", userAns: "", checks: [], flow: "practice" };

// モード別のステップ表示
function stepNav(active){
  var steps = (state.flow === "exam")
    ? ["STEP1 出題", "STEP2 答案作成", "STEP3 採点・解説"]
    : ["STEP1 出題", "STEP2 模範解答・解説", "STEP3 答案作成", "STEP4 採点・解説"];
  return '<div class="stepnav">' + steps.map(function(s, i){
    return (i === active) ? "<b>" + s + "</b>" : s;
  }).join(" → ") + '　<span class="badge ' + (state.flow === "exam" ? "A" : "sub-m") + '">' +
  (state.flow === "exam" ? "本番モード" : "練習モード") + '</span></div>';
}

window.go = function(view){
  if(view === "home") renderHome();
  else if(view === "list") renderList();
  else if(view === "history") renderHistory();
  window.scrollTo(0,0);
};

// ---------- ホーム ----------
function renderHome(){
  var pool = activeQuestions();
  var subj = getSubject();
  var due = dueQuestions();
  var answered = pool.filter(function(q){ return lastAttempt(q.id); }).length;
  var avg = "-";
  var lastScores = pool.map(function(q){ var la = lastAttempt(q.id); return la ? la.score : null; })
                       .filter(function(s){ return s !== null; });
  if(lastScores.length){
    avg = (lastScores.reduce(function(a,b){return a+b;},0) / lastScores.length).toFixed(1);
  }
  var weak = pool.filter(function(q){ var la = lastAttempt(q.id); return la && la.score < 10; }).length;
  var subjName = subj || "全科目";

  var nAll = QUESTIONS.length;
  var nG = QUESTIONS.filter(function(q){ return q.sub === "行政法"; }).length;
  var nM = QUESTIONS.filter(function(q){ return q.sub === "民法"; }).length;
  app.innerHTML =
    '<div class="qbox">' +
      '<h2>科目を選ぶ</h2>' +
      '<div class="subj-toggle">' +
        '<button class="subj-btn' + (subj === "" ? " active" : "") + '" onclick="setSubject(\'\')">全科目<small>' + nAll + '問</small></button>' +
        '<button class="subj-btn subj-g' + (subj === "行政法" ? " active" : "") + '" onclick="setSubject(\'行政法\')">行政法<small>' + nG + '問</small></button>' +
        '<button class="subj-btn subj-m' + (subj === "民法" ? " active" : "") + '" onclick="setSubject(\'民法\')">民法<small>' + nM + '問</small></button>' +
      '</div>' +
    '</div>' +
    '<div class="cards">' +
      '<div class="card"><div class="num">' + pool.length + '</div><div class="lbl">' + subjName + 'の問題数</div></div>' +
      '<div class="card"><div class="num">' + answered + '</div><div class="lbl">回答済み</div></div>' +
      '<div class="card"><div class="num">' + avg + '</div><div class="lbl">直近平均点 /20</div></div>' +
      '<div class="card"><div class="num">' + due.length + '</div><div class="lbl">今日の復習対象</div></div>' +
      '<div class="card"><div class="num">' + weak + '</div><div class="lbl">要強化（10点未満）</div></div>' +
    '</div>' +
    '<div class="qbox">' +
      '<h2>モード選択</h2>' +
      '<div class="mode-toggle">' +
        '<button class="mode-btn' + (getFlowMode() === "practice" ? " active" : "") + '" onclick="setFlowMode(\'practice\')">📖 練習モード<small>①出題 → ②模範解答・解説を先に確認 → ③答案作成 → ④採点・解説</small></button>' +
        '<button class="mode-btn' + (getFlowMode() === "exam" ? " active" : "") + '" onclick="setFlowMode(\'exam\')">🔥 本番モード<small>①出題 → ②いきなり答案作成 → ③採点・解説（本試験と同じ流れ）</small></button>' +
      '</div>' +
    '</div>' +
    '<div class="qbox">' +
      '<h2>学習を始める（' + subjName + '・' + (getFlowMode() === "exam" ? "本番" : "練習") + 'モード）</h2>' +
      '<button class="btn btn-accent" onclick="startReview()">🔁 今日の復習（' + due.length + '問）</button>' +
      '<button class="btn btn-primary" onclick="startNew()">▶ 未回答から順に解く</button>' +
      '<button class="btn btn-primary" onclick="startRandom()">🎲 ランダム10問</button>' +
      '<button class="btn btn-sub" onclick="go(\'list\')">📋 一覧から選ぶ</button>' +
      '<p class="progress" style="margin-top:10px">復習対象＝未回答＋間隔反復の期日到来分（16点以上→7日後／10〜15点→3日後／10点未満→翌日に再出題）。おすすめ：1周目は練習モード、2周目以降・復習は本番モード。</p>' +
    '</div>';
}

// ---------- 出題キュー ----------
window.startReview = function(){
  var due = dueQuestions();
  if(!due.length){ alert("復習対象はありません。お疲れさまでした！"); return; }
  startQuiz(due, "復習");
};
window.startNew = function(){
  var list = activeQuestions().filter(function(q){ return !lastAttempt(q.id); });
  if(!list.length){ alert("全問回答済みです！復習モードをご利用ください。"); return; }
  startQuiz(list, "未回答");
};
window.startRandom = function(){
  var pool = activeQuestions();
  pool.sort(function(){ return Math.random() - 0.5; });
  startQuiz(pool.slice(0,10), "ランダム");
};
window.startOne = function(qid){
  var q = QUESTIONS.filter(function(x){ return x.id === qid; });
  if(q.length) startQuiz(q, "個別");
};
function startQuiz(list, mode){
  state.queue = list; state.idx = 0; state.mode = mode;
  state.flow = getFlowMode();
  renderStep1();
}
function cur(){ return state.queue[state.idx]; }
function progressLabel(){
  return '<span class="progress">［' + state.mode + '］ ' + (state.idx+1) + ' / ' + state.queue.length + ' 問目</span>';
}

// ---------- STEP1 出題 ----------
function renderStep1(){
  var q = cur();
  state.step = 1; state.userAns = "";
  var nextBtn = (state.flow === "exam")
    ? '<button class="btn btn-accent" onclick="renderStep3()">✍ 答案を書く →</button>'
    : '<button class="btn btn-primary" onclick="renderStep2()">解答・解説を見る →</button>';
  app.innerHTML =
    '<div class="qbox">' +
      stepNav(0) +
      '<div class="qmeta">' + subBadge(q) + rankBadge(q) + '<span>' + q.id + '</span>' + progressLabel() + '</div>' +
      '<h2>【問題】</h2>' +
      '<div class="qtext">' + esc(q.q) + '</div>' +
      '<div style="margin-top:14px">' +
        nextBtn +
        '<button class="btn btn-sub" onclick="go(\'home\')">中断してホームへ</button>' +
      '</div>' +
    '</div>';
  window.scrollTo(0,0);
}

// ---------- STEP2 模範解答＋得点ポイント解説 ----------
window.renderStep2 = function(){
  var q = cur();
  state.step = 2;
  var kwHtml = q.kw.map(function(k){
    return '<div class="kwitem"><span class="pts">＋' + k.p + '点</span> 「' + esc(k.t) + '」' +
           '<div class="note">' + esc(k.n) + '</div></div>';
  }).join("");
  app.innerHTML =
    '<div class="qbox">' +
      stepNav(1) +
      '<div class="qmeta">' + subBadge(q) + rankBadge(q) + '<span>' + q.id + '　' + esc(q.theme) + '</span>' + progressLabel() + '</div>' +
      '<div class="qtext" style="font-size:13px;color:#556">' + esc(q.q) + '</div>' +
      '<div class="section-title">■ 模範解答（' + q.model.length + '字）</div>' +
      '<div class="model">' + esc(q.model) + '</div>' +
      '<div class="section-title">■ 採点キーワード（この要素を書けば得点。合計20点）</div>' +
      kwHtml +
      '<div class="section-title">■ 出題根拠（なぜR8に出るか）</div>' +
      '<div class="basis">' + esc(q.basis) + '</div>' +
      '<div class="basis" style="background:#f6f0ff">' + esc(q.expl) + '</div>' +
      '<div style="margin-top:14px">' +
        '<button class="btn btn-accent" onclick="renderStep3()">✍ 解答・解説を隠して自分で書く →</button>' +
      '</div>' +
    '</div>';
  window.scrollTo(0,0);
};

// ---------- STEP3 答案作成（模範解答は非表示） ----------
window.renderStep3 = function(){
  var q = cur();
  state.step = 3;
  var isExam = (state.flow === "exam");
  var backBtn = isExam
    ? '<button class="btn btn-sub" onclick="go(\'home\')">中断してホームへ</button>'
    : '<button class="btn btn-sub" onclick="renderStep2()">← もう一度解説を見る（採点は記録されます）</button>';
  app.innerHTML =
    '<div class="qbox">' +
      stepNav(isExam ? 1 : 2) +
      '<div class="qmeta">' + subBadge(q) + rankBadge(q) + '<span>' + q.id + '</span>' + progressLabel() + '</div>' +
      '<h2>【問題】' + (isExam ? "（本番と同じく、初見の状態で書く）" : "（模範解答を思い出しながら、見ずに書く）") + '</h2>' +
      '<div class="qtext">' + esc(q.q) + '</div>' +
      '<div class="section-title">■ あなたの答案（40字程度）</div>' +
      '<textarea id="ansInput" placeholder="ここに40字程度で記述..."></textarea>' +
      '<div id="charCount">0 字</div>' +
      '<div style="margin-top:10px">' +
        '<button class="btn btn-primary" onclick="submitAns()">採点する →</button>' +
        backBtn +
      '</div>' +
    '</div>';
  var ta = document.getElementById("ansInput");
  ta.addEventListener("input", function(){
    var len = normalize(ta.value).length;
    var cc = document.getElementById("charCount");
    cc.textContent = len + " 字";
    cc.className = (len > 50) ? "over" : "";
  });
  ta.focus();
  window.scrollTo(0,0);
};

// ---------- STEP4 採点・解説 ----------
window.submitAns = function(){
  var q = cur();
  state.userAns = document.getElementById("ansInput").value || "";
  state.checks = q.kw.map(function(k){ return kwMatched(k, state.userAns); });
  renderStep4();
};
function calcScore(){
  var q = cur(), total = 0;
  q.kw.forEach(function(k,i){ if(state.checks[i]) total += k.p; });
  return total;
}
function renderStep4(){
  var q = cur();
  state.step = 4;
  var score = calcScore();
  var kwHtml = q.kw.map(function(k,i){
    var cls = state.checks[i] ? "hit" : "miss";
    return '<div class="kwitem ' + cls + '"><label>' +
      '<input type="checkbox" data-i="' + i + '" ' + (state.checks[i] ? "checked" : "") + ' onchange="toggleKw(this)">' +
      '<span><span class="pts">' + (state.checks[i] ? "＋" + k.p : "0/" + k.p) + '点</span> 「' + esc(k.t) + '」' +
      '<div class="note">' + esc(k.n) + '</div></span></label></div>';
  }).join("");
  app.innerHTML =
    '<div class="qbox">' +
      stepNav(state.flow === "exam" ? 2 : 3) +
      '<div class="qmeta">' + subBadge(q) + rankBadge(q) + '<span>' + q.id + '　' + esc(q.theme) + '</span>' + progressLabel() + '</div>' +
      '<div class="scorebig ' + scoreClass(score) + '" id="scoreDisp">' + score + '<small> / 20点</small></div>' +
      '<div class="section-title">■ あなたの答案（' + normalize(state.userAns).length + '字）</div>' +
      '<div class="myans">' + (esc(state.userAns) || "（無記入）") + '</div>' +
      '<div class="section-title">■ 模範解答</div>' +
      '<div class="model">' + esc(q.model) + '</div>' +
      '<div class="section-title">■ キーワード採点（自動判定です。表現が違っても同趣旨ならチェックを入れて修正してください）</div>' +
      kwHtml +
      '<div class="section-title">■ 解説</div>' +
      '<div class="basis" style="background:#f6f0ff">' + esc(q.expl) + '</div>' +
      '<div class="basis">' + esc(q.basis) + '</div>' +
      '<div style="margin-top:14px">' +
        '<button class="btn btn-primary" onclick="recordAndNext()">💾 この得点を記録して次へ</button>' +
        '<button class="btn btn-sub" onclick="renderStep3()">← 書き直す</button>' +
      '</div>' +
    '</div>';
  window.scrollTo(0,0);
}
window.toggleKw = function(el){
  var i = parseInt(el.getAttribute("data-i"), 10);
  state.checks[i] = el.checked;
  renderStep4();
};
window.recordAndNext = function(){
  var q = cur();
  saveAttempt(q.id, calcScore(), state.userAns, state.checks.slice(), state.flow);
  if(state.idx + 1 < state.queue.length){
    state.idx++;
    renderStep1();
  } else {
    renderSessionEnd();
  }
};
function renderSessionEnd(){
  var hist = loadHistory();
  var recent = hist.slice(-state.queue.length);
  var sum = recent.reduce(function(a,b){ return a + b.score; }, 0);
  var avg = (sum / recent.length).toFixed(1);
  app.innerHTML =
    '<div class="qbox" style="text-align:center">' +
      '<h2>🎉 セッション完了！</h2>' +
      '<div class="scorebig ' + scoreClass(avg) + '">' + avg + '<small> / 20点（平均）</small></div>' +
      '<p style="font-size:14px;color:#556">' + state.queue.length + '問を記録しました。低得点の問題は明日以降の復習に自動で再登場します。</p>' +
      '<button class="btn btn-accent" onclick="startReview()">続けて復習する</button>' +
      '<button class="btn btn-primary" onclick="go(\'home\')">ホームへ</button>' +
    '</div>';
}

// ---------- 一覧 ----------
var listFilter = { sub: "", rank: "", status: "" };
function renderList(){
  var rows = QUESTIONS.filter(function(q){
    if(listFilter.sub && q.sub !== listFilter.sub) return false;
    if(listFilter.rank && q.rank !== listFilter.rank) return false;
    var la = lastAttempt(q.id);
    if(listFilter.status === "new" && la) return false;
    if(listFilter.status === "due" && !isDue(q.id)) return false;
    if(listFilter.status === "weak" && !(la && la.score < 10)) return false;
    return true;
  }).map(function(q){
    var la = lastAttempt(q.id);
    var best = bestScore(q.id);
    var n = attemptsOf(q.id).length;
    var dueMark = isDue(q.id) ? '<span class="badge due">復習</span>' : "";
    return '<tr class="clickable" onclick="startOne(\'' + q.id + '\')">' +
      '<td>' + q.id + '</td><td>' + subBadge(q) + '</td><td>' + rankBadge(q) + '</td>' +
      '<td>' + esc(q.theme) + '</td>' +
      '<td>' + n + '回</td>' +
      '<td>' + (la ? '<b class="' + scoreClass(la.score) + '">' + la.score + '</b>' : "－") + '</td>' +
      '<td>' + (best !== null ? best : "－") + '</td>' +
      '<td>' + dueMark + '</td></tr>';
  }).join("");
  app.innerHTML =
    '<div class="filterbar">' +
      '<label>科目 <select onchange="setFilter(\'sub\',this.value)">' +
        opt("", "すべて", listFilter.sub) + opt("行政法","行政法",listFilter.sub) + opt("民法","民法",listFilter.sub) +
      '</select></label>' +
      '<label>ランク <select onchange="setFilter(\'rank\',this.value)">' +
        opt("","すべて",listFilter.rank) + opt("A","A（本命）",listFilter.rank) + opt("B","B（有力）",listFilter.rank) + opt("C","C（保険）",listFilter.rank) +
      '</select></label>' +
      '<label>状態 <select onchange="setFilter(\'status\',this.value)">' +
        opt("","すべて",listFilter.status) + opt("new","未回答",listFilter.status) + opt("due","復習対象",listFilter.status) + opt("weak","要強化(10点未満)",listFilter.status) +
      '</select></label>' +
    '</div>' +
    '<table class="qlist"><thead><tr>' +
    '<th>No</th><th>科目</th><th>ランク</th><th>テーマ</th><th>回数</th><th>直近</th><th>ベスト</th><th></th>' +
    '</tr></thead><tbody>' + (rows || '<tr><td colspan="8" class="empty">該当なし</td></tr>') + '</tbody></table>' +
    '<p class="progress" style="margin-top:8px">行をクリックするとその問題を開始します（テーマ名が見えるため、初見演習には「未回答から順に」を推奨）。</p>';
}
function opt(v, label, cur){ return '<option value="' + v + '"' + (v === cur ? " selected" : "") + '>' + label + '</option>'; }
window.setFilter = function(k, v){ listFilter[k] = v; renderList(); };

// ---------- 履歴 ----------
function renderHistory(){
  var hist = loadHistory().slice().reverse();
  if(!hist.length){
    app.innerHTML = '<div class="qbox"><div class="empty">まだ回答履歴がありません。ホームから学習を始めましょう。</div></div>';
    return;
  }
  // 日別平均の簡易チャート（直近14日）
  var byDay = {};
  hist.forEach(function(a){
    var d = a.date.slice(0,10);
    (byDay[d] = byDay[d] || []).push(a.score);
  });
  var days = Object.keys(byDay).sort().slice(-14);
  var bars = days.map(function(d){
    var arr = byDay[d];
    var avg = arr.reduce(function(x,y){return x+y;},0) / arr.length;
    var h = Math.max(4, avg / 20 * 60);
    return '<div class="bar" style="height:' + h + 'px" title="' + d + ' 平均' + avg.toFixed(1) + '点/' + arr.length + '問"><span>' + avg.toFixed(0) + '</span></div>';
  }).join("");

  var rows = hist.slice(0, 100).map(function(a){
    var q = QUESTIONS.filter(function(x){ return x.id === a.qid; })[0];
    if(!q) return "";
    var modeBadge = (a.mode === "exam")
      ? '<span class="badge A">本番</span>'
      : '<span class="badge sub-m">練習</span>';
    return '<tr class="clickable" onclick="startOne(\'' + q.id + '\')">' +
      '<td style="white-space:nowrap">' + fmtDate(a.date) + '</td>' +
      '<td>' + q.id + '</td><td>' + esc(q.theme) + '</td>' +
      '<td>' + modeBadge + '</td>' +
      '<td><b class="' + scoreClass(a.score) + '">' + a.score + '</b>/20</td></tr>';
  }).join("");
  app.innerHTML =
    '<div class="qbox"><h2>日別平均点（直近14日）</h2><div class="hist-chart">' + bars + '</div></div>' +
    '<table class="qlist"><thead><tr><th>日時</th><th>No</th><th>テーマ</th><th>モード</th><th>得点</th></tr></thead>' +
    '<tbody>' + rows + '</tbody></table>' +
    '<p class="progress" style="margin-top:8px">直近100件を表示。行クリックで再挑戦できます。</p>';
}

// ---------- 起動 ----------
if(!QUESTIONS.length){
  app.innerHTML = '<div class="qbox"><div class="empty">問題データの読み込みに失敗しました。</div></div>';
} else {
  // 問題数をタイトル・ヘッダーに動的反映（問題追加時の更新漏れ防止）
  document.title = "令和8年度 行政書士 記述式" + QUESTIONS.length + "問";
  var h1 = document.querySelector("#header h1");
  if(h1) h1.textContent = "📝 R8 記述式" + QUESTIONS.length + "問";
  renderHome();
}
})();
