#!/usr/bin/env python3
"""
重複スライド/ページを検出する。

スライドはページをコピーして作ることが多く、「直して使うつもりでコピーした
古いページが消し忘れで残っている」「同じページが二重に入っている」という
事故が起きやすい。ここではユニット（スライド/ページ）全体のテキストを
正規化して総当たりで比較し、完全一致・ほぼ一致のペアを洗い出す。

注意: あくまでテキスト類似度ベース。画像だけ違う/レイアウトだけ違うケースは
拾えないので、最終判断は人が行う前提のヒント出しに徹する。

出力(JSON, stdout):
{
  "type": "...",
  "threshold": 0.9,
  "pairs": [
    {"a": 3, "b": 7, "similarity": 1.0, "kind": "exact|near",
     "a_label": "スライド3", "b_label": "スライド7",
     "preview": "先頭80文字..."}
  ]
}

docx の場合はページ概念が無いため、段落単位で同一テキストの繰り返しを検出する。
"""
import json
import sys
import os
import re
from difflib import SequenceMatcher


def normalize(s):
    # 空白・改行・全半角スペースをならし、比較を安定させる
    s = s.replace("　", " ")
    s = re.sub(r"\s+", "", s)
    return s.strip()


def extract_units(path):
    # extract.py を再利用せず軽量に full_text だけ取る
    here = os.path.dirname(os.path.abspath(__file__))
    sys.path.insert(0, here)
    import extract as ex
    ext = os.path.splitext(path)[1].lower()
    if ext == ".pptx":
        return ex.extract_pptx(path)
    if ext == ".docx":
        return ex.extract_docx(path)
    if ext == ".pdf":
        return ex.extract_pdf(path)
    raise SystemExit(f"未対応の形式です: {ext}")


def dup_units(data, threshold):
    units = data["units"]
    pairs = []
    norm = [(u, normalize(u["full_text"])) for u in units]
    for i in range(len(norm)):
        ua, na = norm[i]
        if not na:
            continue
        for j in range(i + 1, len(norm)):
            ub, nb = norm[j]
            if not nb:
                continue
            if na == nb:
                sim = 1.0
            else:
                # 長さが極端に違うものは早期スキップ
                if min(len(na), len(nb)) / max(len(na), len(nb)) < threshold - 0.1:
                    continue
                sim = SequenceMatcher(None, na, nb).ratio()
            if sim >= threshold:
                pairs.append({
                    "a": ua["index"], "b": ub["index"],
                    "a_label": ua["label"], "b_label": ub["label"],
                    "similarity": round(sim, 3),
                    "kind": "exact" if sim == 1.0 else "near",
                    "preview": ua["full_text"].strip()[:80],
                })
    return pairs


def dup_paragraphs(data, threshold):
    # docx 用: 同一/ほぼ同一の段落の繰り返しを検出
    blocks = data["units"][0]["blocks"]
    pairs = []
    norm = [(b, normalize(b["text"])) for b in blocks]
    for i in range(len(norm)):
        ba, na = norm[i]
        if len(na) < 8:  # 短い見出しや定型語は除外
            continue
        for j in range(i + 1, len(norm)):
            bb, nb = norm[j]
            if len(nb) < 8:
                continue
            sim = 1.0 if na == nb else SequenceMatcher(None, na, nb).ratio()
            if sim >= threshold:
                pairs.append({
                    "a": ba["id"], "b": bb["id"],
                    "a_label": f"段落 {ba['id']}", "b_label": f"段落 {bb['id']}",
                    "similarity": round(sim, 3),
                    "kind": "exact" if sim == 1.0 else "near",
                    "preview": ba["text"].strip()[:80],
                })
    return pairs


def main():
    if len(sys.argv) < 2:
        print("usage: find_duplicates.py <file> [threshold]", file=sys.stderr)
        sys.exit(2)
    path = sys.argv[1]
    threshold = float(sys.argv[2]) if len(sys.argv) > 2 else 0.9
    data = extract_units(path)
    if data["type"] == "docx":
        pairs = dup_paragraphs(data, threshold)
    else:
        pairs = dup_units(data, threshold)
    pairs.sort(key=lambda p: -p["similarity"])
    print(json.dumps({
        "type": data["type"],
        "threshold": threshold,
        "count": len(pairs),
        "pairs": pairs,
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
