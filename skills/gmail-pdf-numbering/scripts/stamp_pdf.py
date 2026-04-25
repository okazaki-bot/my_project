#!/usr/bin/env python3
"""
PDF 1ページ目右上に丸付き番号を挿入するスクリプト

【依存】
pip install pypdf reportlab
"""

import sys
import io
import json
import random
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


def _output_filename(stem: str, number: int, naming_rule: str) -> str:
    if naming_rule == 'number':
        return f"{stem}_number{number:02d}.pdf"
    circled_char = CIRCLED.get(number, f'({number})')
    return f"{stem}_{circled_char}.pdf"


def process_manifest(manifest_path: str, naming_rule: str = 'circled') -> list:
    """
    _manifest.json を読み込み、全PDFにランダムな番号を挿入する。
    結果を _report.json として保存し、records リストを返す。
    """
    manifest_path = Path(manifest_path)
    output_dir = manifest_path.parent

    with open(manifest_path, encoding='utf-8') as f:
        records = json.load(f)

    if not records:
        print("添付PDFが0件です。処理をスキップします。")
        return []

    n = len(records)
    numbers = list(range(1, n + 1))
    random.shuffle(numbers)

    results = []

    for rec, number in zip(records, numbers):
        src = Path(rec['saved_path'])
        circled_char = CIRCLED.get(number, f'({number})')
        stem = src.stem
        out_name = _output_filename(stem, number, naming_rule)
        out_path = output_dir / out_name

        # 出力ファイル名衝突回避
        if out_path.exists():
            ts = datetime.now().strftime('%Y%m%d_%H%M%S')
            out_path = output_dir / f"{stem}_{ts}_{out_name}"

        result = {
            'subject': rec.get('subject', ''),
            'original_filename': rec.get('original_filename', ''),
            'saved_filename': rec.get('saved_filename', ''),
            'output_filename': out_name,
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
            actual = stamp_pdf(src, out_path, number)
            result['output_filename'] = out_path.name
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
            print(f"  [成功] {out_path.name}  ({circled_char})")

        results.append(result)

    report_path = output_dir / '_report.json'
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
    batch.add_argument('--naming', default='circled',
                       choices=['circled', 'number'],
                       help='ファイル命名規則: circled=①付き / number=number01付き')

    # 単体モード
    single = sub.add_parser('single', help='単一PDFに番号を挿入')
    single.add_argument('--input', required=True, help='入力PDFパス')
    single.add_argument('--output', required=True, help='出力PDFパス')
    single.add_argument('--number', type=int, required=True, help='付与する番号（1以上）')

    args = parser.parse_args()

    if args.mode == 'batch':
        process_manifest(args.manifest, args.naming)
    elif args.mode == 'single':
        result = stamp_pdf(Path(args.input), Path(args.output), args.number)
        print(f"完了: {args.output}  ({result})")
    else:
        parser.print_help()
