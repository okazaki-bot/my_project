"use strict";
/* ============================================================
   計算ロジック仕様書ビューア
   SPEC_MD（js/spec-doc.js）を簡易Markdownレンダラーで表示
============================================================ */

function mdToHtml(md){
  const lines=md.split('\n');
  let html='', i=0, listStack=null;
  const inline=s=>{
    s=esc(s);
    s=s.replace(/`([^`]+)`/g,'<code>$1</code>');
    s=s.replace(/\*\*([^*]+)\*\*/g,'<b>$1</b>');
    s=s.replace(/(https?:\/\/[^\s)）」]+)/g,'<a href="$1" target="_blank" rel="noopener">$1</a>');
    return s;
  };
  const closeList=()=>{ if(listStack){ html+=`</${listStack}>`; listStack=null; } };
  while(i<lines.length){
    const L=lines[i];
    // コードブロック
    if(L.startsWith('```')){
      closeList();
      let code=''; i++;
      while(i<lines.length&&!lines[i].startsWith('```')){ code+=lines[i]+'\n'; i++; }
      i++;
      html+=`<pre class="spec-code">${esc(code)}</pre>`;
      continue;
    }
    // テーブル
    if(L.trim().startsWith('|')&&i+1<lines.length&&/^\s*\|[\s:|-]+\|\s*$/.test(lines[i+1])){
      closeList();
      const parseRow=r=>r.trim().replace(/^\||\|$/g,'').split('|').map(c=>inline(c.trim()));
      const head=parseRow(L);
      i+=2;
      let body='';
      while(i<lines.length&&lines[i].trim().startsWith('|')){
        body+='<tr>'+parseRow(lines[i]).map(c=>`<td>${c}</td>`).join('')+'</tr>';
        i++;
      }
      html+=`<div style="overflow-x:auto"><table class="spec-table"><tr>${head.map(h=>`<th>${h}</th>`).join('')}</tr>${body}</table></div>`;
      continue;
    }
    // 見出し
    const h=L.match(/^(#{1,4})\s+(.*)/);
    if(h){ closeList(); const lv=h[1].length; html+=`<h${lv+1} class="spec-h${lv}">${inline(h[2])}</h${lv+1}>`; i++; continue; }
    // 引用
    if(L.startsWith('>')){ closeList(); html+=`<div class="spec-quote">${inline(L.replace(/^>\s?/,''))}</div>`; i++; continue; }
    // 区切り線
    if(/^\s*---+\s*$/.test(L)){ closeList(); html+='<hr class="spec-hr">'; i++; continue; }
    // リスト
    const ul=L.match(/^\s*[-・]\s+(.*)/), ol=L.match(/^\s*\d+\.\s+(.*)/);
    if(ul||ol){
      const tag=ul?'ul':'ol';
      if(listStack!==tag){ closeList(); html+=`<${tag} class="spec-list">`; listStack=tag; }
      html+=`<li>${inline((ul||ol)[1])}</li>`; i++; continue;
    }
    // 空行
    if(!L.trim()){ closeList(); i++; continue; }
    // 段落
    closeList();
    html+=`<p class="spec-p">${inline(L)}</p>`; i++;
  }
  closeList();
  return html;
}

function openSpec(){
  view.innerHTML=`
    <div class="no-print toolbar" style="margin-bottom:6px">
      <button class="btn" onclick="closeSpec()">← アプリに戻る</button>
      <button class="btn navy" onclick="window.print()">🖨 印刷 / PDF保存</button>
    </div>
    <div class="report spec-doc">${mdToHtml(typeof SPEC_MD!=='undefined'?SPEC_MD:'# 仕様書が見つかりません')}</div>`;
  document.getElementById('stepper').innerHTML='';
  window.scrollTo(0,0);
}
function closeSpec(){ render(); }
