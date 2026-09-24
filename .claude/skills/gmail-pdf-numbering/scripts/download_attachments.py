#!/usr/bin/env python3
"""
Gmail PDF添付ファイルダウンローダー

【初回セットアップ】
1. Google Cloud Console でプロジェクトを作成し Gmail API を有効化
2. OAuth2 クライアントID（デスクトップアプリ）を作成しJSONをダウンロード
3. ダウンロードしたJSONを ~/.gmail_credentials.json として保存
4. 初回実行時にブラウザでOAuth認証を行うと ~/.gmail_token.json が生成される

【依存】
pip install google-api-python-client google-auth-httplib2 google-auth-oauthlib
"""

import os
import sys
import base64
import json
import argparse
from pathlib import Path
from datetime import datetime, timedelta
from email.utils import parseaddr
from email.header import decode_header, make_header

SCOPES = ['https://www.googleapis.com/auth/gmail.readonly']
TOKEN_PATH = Path.home() / '.gmail_token.json'
CREDS_PATH = Path.home() / '.gmail_credentials.json'


def get_service():
    from google.oauth2.credentials import Credentials
    from google_auth_oauthlib.flow import InstalledAppFlow
    from google.auth.transport.requests import Request
    from googleapiclient.discovery import build

    creds = None
    if TOKEN_PATH.exists():
        creds = Credentials.from_authorized_user_file(str(TOKEN_PATH), SCOPES)

    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            if not CREDS_PATH.exists():
                print(f"ERROR: {CREDS_PATH} が見つかりません。")
                print("Google Cloud Console でOAuth認証情報を作成し、")
                print(f"{CREDS_PATH} として保存してください。")
                sys.exit(1)
            flow = InstalledAppFlow.from_client_secrets_file(str(CREDS_PATH), SCOPES)
            creds = flow.run_local_server(port=0)
        with open(TOKEN_PATH, 'w') as f:
            f.write(creds.to_json())

    return build('gmail', 'v1', credentials=creds)


def get_label_id(service, label_name):
    labels = service.users().labels().list(userId='me').execute()
    for lbl in labels.get('labels', []):
        if lbl['name'] == label_name:
            return lbl['id']
    return None


def build_query(label_name, filter_condition, pdf_only=False):
    # 既定では PDF に加えて Word（.docx / .doc）添付も対象（GmailのORは {} で表現）。
    # pdf_only=True のときは PDF だけに絞る（同じ人がWordとPDFの両方を送っている場合の重複回避）。
    kinds = 'filename:pdf' if pdf_only else '{filename:pdf filename:docx filename:doc}'
    parts = [f'label:"{label_name}"', 'has:attachment', kinds]

    fc = filter_condition.strip().lower()
    if fc == 'unread':
        parts.append('is:unread')
    elif fc.startswith('days:'):
        days = int(fc.split(':', 1)[1])
        after = (datetime.now() - timedelta(days=days)).strftime('%Y/%m/%d')
        parts.append(f'after:{after}')
    elif fc.startswith('month:'):
        # month:YYYY-MM 形式 → after/before のGmailクエリに変換
        ym = filter_condition.split(':', 1)[1].strip()
        year, month = (int(x) for x in ym.replace('/', '-').split('-')[:2])
        after = datetime(year, month, 1)
        before = datetime(year + (month // 12), (month % 12) + 1, 1)
        parts.append(f'after:{after.strftime("%Y/%m/%d")}')
        parts.append(f'before:{before.strftime("%Y/%m/%d")}')
    elif fc.startswith('from:') or fc.startswith('subject:'):
        parts.append(filter_condition)
    elif 'after:' in fc or 'before:' in fc:
        # 生のGmail日付クエリをそのまま透過（例: "after:2026/06/01 before:2026/07/01"）
        parts.append(filter_condition)
    # 'all' は追加条件なし

    return ' '.join(parts)


def extract_sender(from_value: str):
    """Fromヘッダーから表示名とアドレスを取り出す。表示名がなければアドレスのローカル部を使う。"""
    name, addr = parseaddr(from_value or '')
    if name and '=?' in name:
        try:
            name = str(make_header(decode_header(name)))
        except Exception:
            pass
    name = name.strip().strip('"')
    if not name:
        name = addr.split('@')[0] if addr else '不明'
    return name, addr


PDF_MIMES = {'application/pdf'}
WORD_MIMES = {
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword',
}
WORD_EXTS = ('.docx', '.doc')


def is_pdf_part(mime: str, fname: str) -> bool:
    return mime in PDF_MIMES or fname.lower().endswith('.pdf')


def is_word_part(mime: str, fname: str) -> bool:
    # 一時ファイル（~$foo.docx）は除外
    if Path(fname).name.startswith('~$'):
        return False
    return mime in WORD_MIMES or fname.lower().endswith(WORD_EXTS)


def find_pdf_parts(parts, pdf_only=False):
    """PDF と Word（.docx/.doc）の添付パートを収集する。

    pdf_only=True のときは Word を除外して PDF だけを返す。
    """
    results = []
    for part in parts:
        mime = part.get('mimeType', '')
        fname = part.get('filename', '')
        match = is_pdf_part(mime, fname) or (
            not pdf_only and is_word_part(mime, fname))
        if match and part['body'].get('attachmentId'):
            results.append(part)
        if 'parts' in part:
            results.extend(find_pdf_parts(part['parts'], pdf_only))
    return results


def convert_word_to_pdf(src: Path) -> Path:
    """Word添付をLibreOffice(headless)でPDFに変換し、生成されたPDFのパスを返す。

    元のWordファイルは保持する（変換のみ）。変換に失敗した場合は例外を送出する。
    """
    import subprocess
    import shutil

    soffice = shutil.which('soffice') or '/Applications/LibreOffice.app/Contents/MacOS/soffice'
    if not Path(soffice).exists() and not shutil.which('soffice'):
        raise RuntimeError('LibreOffice(soffice)が見つかりません。変換できません。')

    # 起動中のLibreOfficeとプロファイルが衝突しないよう専用プロファイルを使う
    profile = src.parent / '.lo_profile'
    cmd = [
        soffice,
        f'-env:UserInstallation=file://{profile}',
        '--headless', '--norestore',
        '--convert-to', 'pdf:writer_pdf_Export',
        '--outdir', str(src.parent),
        str(src),
    ]
    proc = subprocess.run(cmd, capture_output=True, text=True, timeout=180)
    produced = src.with_suffix('.pdf')
    if not produced.exists():
        raise RuntimeError(
            f'PDF変換に失敗しました: {src.name} / stdout={proc.stdout.strip()} '
            f'stderr={proc.stderr.strip()}'
        )
    return produced


def safe_save_path(output_dir: Path, filename: str) -> Path:
    target = output_dir / filename
    if not target.exists():
        return target
    stem = Path(filename).stem
    suffix = Path(filename).suffix
    ts = datetime.now().strftime('%Y%m%d_%H%M%S_%f')[:20]
    return output_dir / f"{stem}_{ts}{suffix}"


def download_pdfs(label_name: str, filter_condition: str, output_dir: str,
                  pdf_only: bool = False):
    service = get_service()
    out = Path(output_dir)
    out.mkdir(parents=True, exist_ok=True)

    # 書込権限チェック
    test_file = out / '.write_check'
    try:
        test_file.touch()
        test_file.unlink()
    except PermissionError:
        print(f"ERROR: 保存先フォルダへの書込権限がありません: {out}")
        sys.exit(1)

    # ラベル確認
    label_id = get_label_id(service, label_name)
    if not label_id:
        print(f"ERROR: 指定ラベルが存在しません: '{label_name}'")
        print("利用可能なラベル一覧:")
        labels = service.users().labels().list(userId='me').execute()
        for lbl in labels.get('labels', []):
            print(f"  - {lbl['name']}")
        sys.exit(1)

    query = build_query(label_name, filter_condition, pdf_only)
    print(f"検索クエリ: {query}")
    if pdf_only:
        print("モード: PDF添付のみ（Word添付は対象外）")

    # メッセージ一覧取得
    messages = []
    page_token = None
    while True:
        resp = service.users().messages().list(
            userId='me', q=query, pageToken=page_token
        ).execute()
        messages.extend(resp.get('messages', []))
        page_token = resp.get('nextPageToken')
        if not page_token:
            break

    print(f"対象メール件数: {len(messages)}")
    if not messages:
        print("対象メールが0件です。処理を終了します。")
        _save_manifest(out, [])
        return []

    records = []

    for msg_info in messages:
        msg = service.users().messages().get(
            userId='me', id=msg_info['id'], format='full'
        ).execute()

        headers = msg['payload'].get('headers', [])
        subject = next(
            (h['value'] for h in headers if h['name'] == 'Subject'),
            '(件名なし)'
        )
        from_value = next(
            (h['value'] for h in headers if h['name'] == 'From'),
            ''
        )
        sender_name, sender_email = extract_sender(from_value)

        all_parts = msg['payload'].get('parts', [])
        if not all_parts:
            all_parts = [msg['payload']]

        pdf_parts = find_pdf_parts(all_parts, pdf_only)
        if not pdf_parts:
            continue

        for part in pdf_parts:
            filename = part.get('filename') or f"attachment_{msg_info['id']}.pdf"
            attachment_id = part['body']['attachmentId']

            try:
                att = service.users().messages().attachments().get(
                    userId='me', messageId=msg_info['id'], id=attachment_id
                ).execute()
                data = base64.urlsafe_b64decode(att['data'])
            except Exception as e:
                print(f"WARN: 添付取得失敗 [{filename}]: {e}")
                continue

            save_path = safe_save_path(out, filename)
            with open(save_path, 'wb') as f:
                f.write(data)

            # Word添付はPDFへ変換する（元のWordファイルは残す）
            note = ''
            pdf_path = save_path
            if is_word_part(part.get('mimeType', ''), filename):
                try:
                    pdf_path = convert_word_to_pdf(save_path)
                    note = f'Word({Path(filename).suffix})をPDFに変換'
                    print(f"  変換: {save_path.name} → {pdf_path.name}")
                except Exception as e:
                    print(f"WARN: PDF変換失敗 [{filename}]: {e}")
                    continue

            records.append({
                'subject': subject,
                'sender_name': sender_name,
                'sender_email': sender_email,
                'original_filename': filename,
                'saved_filename': pdf_path.name,
                'saved_path': str(pdf_path),
                'message_id': msg_info['id'],
                'note': note,
            })
            print(f"  保存: {pdf_path.name}（送信者: {sender_name}）")

    print(f"\nダウンロード完了: {len(records)}件")

    if not records:
        print("添付PDFが0件です。処理を終了します。")

    _save_manifest(out, records)
    return records


def _save_manifest(out: Path, records: list):
    manifest_path = out / '_manifest.json'
    with open(manifest_path, 'w', encoding='utf-8') as f:
        json.dump(records, f, ensure_ascii=False, indent=2)
    print(f"マニフェスト保存: {manifest_path}")


if __name__ == '__main__':
    parser = argparse.ArgumentParser(
        description='Gmail添付ダウンローダー（PDF / Word添付はPDFへ自動変換）')
    parser.add_argument('--label', required=True, help='Gmailラベル名')
    parser.add_argument('--filter', default='all',
                        help='抽出条件: all / unread / days:N / from:addr / subject:text')
    parser.add_argument('--output', required=True, help='保存先フォルダ')
    parser.add_argument('--pdf-only', action='store_true',
                        help='PDF添付のみを対象にする（Word添付を除外）')
    args = parser.parse_args()

    download_pdfs(args.label, args.filter, args.output, args.pdf_only)
