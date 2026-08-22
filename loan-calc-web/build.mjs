// build.mjs — ES module群を1つの index.html に inline して自己完結ファイルを作る。
// file:// ダブルクリック / WordPress貼り付け / XServer直置き のいずれでも動く dist/index.html を生成。
import fs from "node:fs";
import path from "node:path";

const ROOT = path.dirname(new URL(import.meta.url).pathname);
const order = ["js/calc.js", "js/app.js"];

function strip(src) {
  // import文（複数行対応）を除去し、export キーワードを外す
  return src
    .replace(/import\b[\s\S]*?from\s*["'][^"']+["'];?/g, "")
    .replace(/^\s*export\s+/gm, "");
}

let bundle = "// === 自動生成バンドル（build.mjs） 編集しないこと ===\n";
for (const f of order) {
  bundle += `\n// ---- ${f} ----\n` + strip(fs.readFileSync(path.join(ROOT, f), "utf8")) + "\n";
}

const css = fs.readFileSync(path.join(ROOT, "css/style.css"), "utf8");
let html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
// 置換値に関数を使う（文字列だと $$ が $ に化けるため）
html = html.replace(
  /<link rel="stylesheet" href="css\/style.css">/,
  () => `<style>\n${css}\n</style>`
);
html = html.replace(
  /<script type="module" src="js\/app.js"><\/script>/,
  () => `<script>\n${bundle}\n</script>`
);

const DIST = path.join(ROOT, "dist");
fs.mkdirSync(DIST, { recursive: true });
fs.writeFileSync(path.join(DIST, "index.html"), html);
console.log("wrote dist/index.html", Math.round(html.length / 1024) + "KB");

// モジュール版でも動くよう js/ css/ も同梱
for (const dir of ["js", "css"]) {
  const src = path.join(ROOT, dir);
  const dst = path.join(DIST, dir);
  fs.rmSync(dst, { recursive: true, force: true });
  fs.cpSync(src, dst, { recursive: true });
  console.log("copied", dir, "-> dist/" + dir);
}
