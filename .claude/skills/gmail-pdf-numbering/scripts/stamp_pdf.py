#!/usr/bin/env python3
"""
PDFを「第N回」フォルダに振り分け、匿名化PDFの1ページ目右上に丸付き番号を挿入するスクリプト

base_dir 直下に「第N回」（省略時は既存を検出して自動採番）を作り、その中に:
  - 提出/   元PDFを <送信者名>_<アラビア数字>.pdf にコピー（元ファイルは保持）
  - 匿名化/ 番号スタンプ済みPDFを <丸数字>.pdf で保存（名前なし＝匿名）
  - 送付用/ 空フォルダ（手動運用用）

番号はダウンロード総数 N から 1〜N をランダムに重複なく割り当てる。

【依存】
pip install pypdf reportlab
"""

import sys
import io
import re
import json
import random
import shutil
import argparse
from pathlib import Path
from datetime import datetime

# Unicode丸付き数字マップ（1〜50）
CIRCLED = {
    1: '①',  2: '②',  3: '③',  4: '④',  5: '⑤',
    6: '⑥',  7: '⑦',  8: '⑧',  9: '⑨', 10: '⑩',
    11: '⑪', 12: '⑫', 13: '⑬', 14: '⑭', 15: '⑮',
    16: '⑯', 17: '⑰', 18: '⑱', 19: '⑲', 20: '⑳',
    21: '㉑', 22: '㉒', 23: '㉓', 24: '㉔', 25: '㉕',
    26: '㉖', 27: '㉗', 28: '㉘', 29: '㉙', 30: '㉚',
    31: '㉛', 32: '㉜', 33: '㉝', 34: '㉞', 35: '㉟',
    36: '㊱', 37: '㊲', 38: '㊳', 39: '㊴', 40: '㊵',
    41: '㊶', 42: '㊷', 43: '㊸', 44: '㊹', 45: '㊺',
    46: '㊻', 47: '㊼', 48: '㊽', 49: '㊾', 50: '㊿',
}


def _create_stamp_overlay(page_width: float, page_height: float, number: int) -> io.BytesIO:
    """reportlabで丸付き番号のPDFオーバーレイを生成する。"""
    from reportlab.pdfgen import canvas
    from reportlab.lib.units import mm
    from reportlab.lib.colors import black, white

    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=(page_width, page_height))

    margin = 7 * mm      # 上端・右端からの余白
    radius = 5 * mm      # 半径5mm → 直径1cm

    cx = page_width - margin - radius
    cy = page_height - margin - radius

    # 白地の円（視認性確保のため背景を塗りつぶす）
    c.setFillColor(white)
    c.setStrokeColor(black)
    c.setLineWidth(1.5)
    c.circle(cx, cy, radius, fill=1, stroke=1)

    # 数字（2桁以上は文字を小さくする）
    font_size = 12 if number < 10 else 9
    c.setFillColor(black)
    c.setFont('Helvetica-Bold', font_size)
    c.drawCentredString(cx, cy - font_size * 0.35, str(number))

    c.save()
    buf.seek(0)
    return buf


def stamp_pdf(input_path: Path, output_path: Path, number: int) -> str:
    """
    PDFの1ページ目右上に番号を挿入して output_path に保存する。
    戻り値: 使用した丸付き文字（ファイル名用）
    """
    from pypdf import PdfReader, PdfWriter

    reader = PdfReader(str(input_path))

    if reader.is_encrypted:
        raise ValueError('パスワード保護PDF')

    page0 = reader.pages[0]
    width = float(page0.mediabox.width)
    height = float(page0.mediabox.height)

    overlay_buf = _create_stamp_overlay(width, height, number)

    from pypdf import PdfReader as _PR
    overlay_reader = _PR(overlay_buf)
    overlay_page = overlay_reader.pages[0]

    page0.merge_page(overlay_page)

    writer = PdfWriter()
    writer.add_page(page0)
    for p in reader.pages[1:]:
        writer.add_page(p)

    with open(str(output_path), 'wb') as f:
        writer.write(f)

    return CIRCLED.get(number, f'({number})')


def _sanitize_name(name: str) -> str:
    """フォルダ名・ファイル名に使えない文字を除去する。"""
    name = re.sub(r'[\\/:*?"<>|\r\n\t]', '', name or '').strip()
    return name or '不明'


def _unique_path(path: Path) -> Path:
    """同名ファイルがあればタイムスタンプを付与して衝突を回避する。"""
    if not path.exists():
        return path
    ts = datetime.now().strftime('%Y%m%d_%H%M%S_%f')[:22]
    return path.with_name(f"{path.stem}_{ts}{path.suffix}")


def _next_kai(base: Path) -> int:
    """base 直下の「第N回」フォルダを検出し、最大値+1を返す（無ければ1）。"""
    pat = re.compile(r'^第(\d+)回$')
    maxn = 0
    if base.exists():
        for child in base.iterdir():
            if child.is_dir():
                m = pat.match(child.name)
                if m:
                    maxn = max(maxn, int(m.group(1)))
    return maxn + 1


def process_manifest(manifest_path: str, base_dir: str, kai: int = 0) -> list:
    """
    _manifest.json を読み込み、ダウンロード総数 N から 1〜N のランダムな番号を
    重複なしで割り当てる。base_dir 直下に「第N回」フォルダ（kai=0なら自動採番）を作り、
    その中に以下を生成する。第1回フォルダと同じ構成。
      - 提出/   … 元PDFを「<送信者名>_<アラビア数字>.pdf」にコピー（元ファイルは保持）
      - 匿名化/ … 番号スタンプ済みPDFを「<丸数字>.pdf」で保存（名前なし＝匿名）
      - 送付用/ … 空フォルダ（手動運用用）
    結果を 第N回/_report.json として保存し、results リストを返す。
    """
    manifest_path = Path(manifest_path)
    base = Path(base_dir)
    base.mkdir(parents=True, exist_ok=True)

    with open(manifest_path, encoding='utf-8') as f:
        records = json.load(f)

    if not records:
        print("添付PDFが0件です。処理をスキップします。")
        return []

    kai_num = kai if kai > 0 else _next_kai(base)
    kai_dir = base / f'第{kai_num}回'
    submit_dir = kai_dir / '提出'
    anon_dir = kai_dir / '匿名化'
    send_dir = kai_dir / '送付用'
    for d in (submit_dir, anon_dir, send_dir):
        d.mkdir(parents=True, exist_ok=True)
    print(f"対象回フォルダ: {kai_dir.name}")

    n = len(records)
    numbers = list(range(1, n + 1))
    random.shuffle(numbers)

    results = []

    for rec, number in zip(records, numbers):
        src = Path(rec['saved_path'])
        circled_char = CIRCLED.get(number, f'({number})')
        name = _sanitize_name(rec.get('sender_name', ''))

        # 提出: <送信者名>_<アラビア数字>.pdf  / 匿名化: <丸数字>.pdf（名前なし）
        submit_name = f"{name}_{number}.pdf"
        anon_name = f"{circled_char}.pdf"

        result = {
            'subject': rec.get('subject', ''),
            'sender_name': name,
            'sender_email': rec.get('sender_email', ''),
            'original_filename': rec.get('original_filename', ''),
            'submit_path': '',
            'anon_path': '',
            'number': number,
            'circled': circled_char,
            'status': '',
            'note': '',
        }

        if not src.exists():
            result['status'] = 'エラー'
            result['note'] = 'ファイルが見つかりません'
            results.append(result)
            print(f"  [エラー] {src.name}: ファイルが見つかりません")
            continue

        try:
            # 提出: 元PDFをリネームしてコピー（元ファイルは保持）
            submit_path = _unique_path(submit_dir / submit_name)
            shutil.copy2(src, submit_path)
            result['submit_path'] = str(submit_path)

            # 匿名化: 番号スタンプ済みPDFを丸数字名で保存
            anon_path = _unique_path(anon_dir / anon_name)
            actual = stamp_pdf(src, anon_path, number)
            result['anon_path'] = str(anon_path)
            result['status'] = '成功'
            if actual != circled_char:
                result['note'] = '代替描画使用（丸数字フォント未対応）'
        except ValueError as e:
            result['status'] = 'スキップ'
            result['note'] = str(e)
            print(f"  [スキップ] {src.name}: {e}")
        except Exception as e:
            result['status'] = 'エラー'
            result['note'] = str(e)
            print(f"  [エラー] {src.name}: {e}")
        else:
            print(f"  [成功] 提出/{submit_name}  →  匿名化/{anon_name}")

        results.append(result)

    report_path = kai_dir / '_report.json'
    with open(report_path, 'w', encoding='utf-8') as f:
        json.dump(results, f, ensure_ascii=False, indent=2)

    success = sum(1 for r in results if r['status'] == '成功')
    skip = sum(1 for r in results if r['status'] == 'スキップ')
    error = sum(1 for r in results if r['status'] == 'エラー')

    print(f"\n番号挿入完了: 成功={success} / スキップ={skip} / エラー={error}")
    print(f"レポート保存: {report_path}")

    return results


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='PDF丸付き番号挿入スクリプト')
    sub = parser.add_subparsers(dest='mode')

    # バッチモード（_manifest.json から一括処理）
    batch = sub.add_parser('batch', help='マニフェストから一括処理')
    batch.add_argument('--manifest', required=True, help='_manifest.json のパス')
    batch.add_argument('--base-dir', required=True,
                       help='振り分け先ベースフォルダ（この中に 第N回/提出・匿名化・送付用 を作成）')
    batch.add_argument('--kai', type=int, default=0,
                       help='回数（省略時は既存「第N回」を検出して自動採番）')

    # 単体モード
    single = sub.add_parser('single', help='単一PDFに番号を挿入')
    single.add_argument('--input', required=True, help='入力PDFパス')
    single.add_argument('--output', required=True, help='出力PDFパス')
    single.add_argument('--number', type=int, required=True, help='付与する番号（1以上）')

    args = parser.parse_args()

    if args.mode == 'batch':
        process_manifest(args.manifest, args.base_dir, args.kai)
    elif args.mode == 'single':
        result = stamp_pdf(Path(args.input), Path(args.output), args.number)
        print(f"完了: {args.output}  ({result})")
    else:
        parser.print_help()
