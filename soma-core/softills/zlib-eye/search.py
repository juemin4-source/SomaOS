"""Z-Library 搜索 + 定位 + 下载

用法:
  python search.py '{"mode": "search", "query": "..."}'                          # SQLite 搜索
  python search.py '{"mode": "locate", "id": 21073445}'                          # 定位种子
  python search.py '{"mode": "download", "id": 21073445}'                        # BT 下载（aria2c，种源不稳定）
  python search.py '{"mode": "download_http", "title": "...", "author": "..."}'  # HTTP 下载（Playwright，推荐）
"""

from __future__ import annotations

import hashlib
import json
import math
import os
import re
import shutil
import sqlite3
import subprocess
import sys
from datetime import datetime
from pathlib import Path

TORRENT_ROOT = Path("F:/01_资料/三维/资产/杂项/ZLibrary离线种子（约1800万册共10TB）")

DEFAULT_DB = os.path.join(
    os.path.dirname(os.path.abspath(__file__)),
    '..', '..', '..', '..', '..',
    'F:/01_资料/三维/资产/杂项/ZLibrary离线种子（约1800万册共10TB）/zlib-search.db'
)

# 再试试 F 盘根目录
ALT_DB = 'F:/zlib-search.db'


def find_db():
    """找 SQLite 数据库"""
    # 先检查软技能目录附近
    for path in [DEFAULT_DB, ALT_DB]:
        resolved = os.path.realpath(path) if os.path.exists(path) else path
        if os.path.exists(resolved):
            return resolved
    return None


def clean_text(text):
    """清理文本，去除乱码"""
    if not text:
        return ''
    # 去除控制字符但保留换行
    cleaned = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f]', '', text)
    return cleaned.strip()


def search_books(params):
    """搜索书籍"""
    db_path = params.get('db_path') or find_db()
    if not db_path or not os.path.exists(db_path):
        return {
            'result': 'ERROR',
            'summary': '搜索数据库未找到。请先导入 SQL 索引: python import_zlib_index.py',
            'data': {'hits': [], 'total': 0},
            'evidence': [{'type': 'search', 'result': 'ERROR', 'summary': '数据库未找到'}]
        }

    query = params.get('query', '').strip()
    author = params.get('author', '').strip()
    language = params.get('language', '').strip()
    extension = params.get('extension', '').strip()
    year_from = params.get('year_from')
    year_to = params.get('year_to')
    limit = min(int(params.get('limit', 20)), 100)
    offset = int(params.get('offset', 0))

    if not query and not author:
        return {
            'result': 'ERROR',
            'summary': '需要搜索关键词(query)或作者(author)',
            'data': {'hits': [], 'total': 0},
            'evidence': [{'type': 'search', 'result': 'ERROR', 'summary': '缺少查询参数'}]
        }

    try:
        conn = sqlite3.connect(db_path)
        conn.execute('PRAGMA cache_size=-8000000')
        conn.row_factory = sqlite3.Row
        c = conn.cursor()

        # 构建查询
        where_clauses = []
        params_list = []

        if query:
            # 使用 FTS5 全文搜索
            # FTS5 支持前缀搜索: 在词后加 *
            fts_query = ' '.join([f'"{w}"*' for w in query.split() if w])
            if fts_query:
                where_clauses.append('''
                    zlibrary_id IN (
                        SELECT rowid FROM books_fts WHERE books_fts MATCH ?
                    )
                ''')
                params_list.append(fts_query)
            else:
                where_clauses.append('(title LIKE ? OR author LIKE ?)')
                params_list.extend([f'%{query}%', f'%{query}%'])

        if author:
            where_clauses.append('author LIKE ?')
            params_list.append(f'%{author}%')

        if language:
            # 支持模糊匹配
            lang_map = {
                'chinese': ['chinese', 'cn', 'zh'],
                'english': ['english', 'en'],
                'japanese': ['japanese', 'jp', 'ja'],
                'russian': ['russian', 'ru'],
                'french': ['french', 'fr'],
                'german': ['german', 'de'],
                'spanish': ['spanish', 'es'],
                'italian': ['italian', 'it'],
            }
            match_langs = lang_map.get(language.lower(), [language])
            lang_conditions = ' OR '.join(['language LIKE ?' for _ in match_langs])
            where_clauses.append(f'({lang_conditions})')
            params_list.extend(match_langs)

        if extension:
            where_clauses.append('extension = ?')
            params_list.append(extension.lower())

        if year_from:
            where_clauses.append('CAST(year AS INTEGER) >= ?')
            params_list.append(int(year_from))

        if year_to:
            where_clauses.append('CAST(year AS INTEGER) <= ?')
            params_list.append(int(year_to))

        where_sql = ' AND '.join(where_clauses) if where_clauses else '1'

        # 统计总数
        count_sql = f'SELECT COUNT(*) FROM books WHERE {where_sql}'
        c.execute(count_sql, params_list)
        total = c.fetchone()[0]

        # 查数据
        data_sql = f'''
            SELECT zlibrary_id, title, author, extension, filesize,
                   year, language, publisher, pilimi_torrent,
                   substr(description, 1, 200) as description
            FROM books
            WHERE {where_sql}
            ORDER BY zlibrary_id DESC
            LIMIT ? OFFSET ?
        '''
        c.execute(data_sql, params_list + [limit, offset])
        rows = c.fetchall()

        hits = []
        for row in rows:
            hit = {
                'zlibrary_id': row['zlibrary_id'],
                'title': clean_text(row['title'])[:300],
                'author': clean_text(row['author'])[:200],
                'extension': row['extension'],
                'filesize': row['filesize'],
                'file_size_hr': format_size(row['filesize']),
                'year': row['year'],
                'language': row['language'],
                'publisher': clean_text(row['publisher'])[:200] if row['publisher'] else '',
                'pilimi_torrent': row['pilimi_torrent'],
                'description': clean_text(row['description'])[:500] if row['description'] else '',
            }
            # 确定 torrent 文件路径
            if row['pilimi_torrent']:
                hit['torrent_name'] = row['pilimi_torrent']
            hits.append(hit)

        conn.close()

        return {
            'result': 'PASS',
            'summary': f'找到 {total} 条结果，显示 {len(hits)} 条',
            'data': {
                'total': total,
                'offset': offset,
                'limit': limit,
                'query': query,
                'hits': hits,
            },
            'evidence': [
                {'type': 'search_query', 'result': 'PASS',
                 'summary': f'查询 "{query}" 返回 {total} 条结果'},
            ]
        }

    except Exception as e:
        return {
            'result': 'ERROR',
            'summary': f'搜索失败: {str(e)[:200]}',
            'data': {'hits': [], 'total': 0},
            'evidence': [{'type': 'search', 'result': 'ERROR', 'summary': str(e)[:200]}]
        }


def format_size(bytes_val):
    if not bytes_val:
        return 'unknown'
    units = ['B', 'KB', 'MB', 'GB']
    i = 0
    size = float(bytes_val)
    while size >= 1024 and i < len(units) - 1:
        size /= 1024
        i += 1
    return f'{size:.1f} {units[i]}'


# ── Torrent 定位 ──

def locate_torrent(zlibrary_id: int) -> dict:
    """定位书籍所在的种子文件路径和种子内路径。"""
    # 先从数据库查 torrent 名
    db_path = find_db()
    if not db_path:
        return {"status": "ERROR", "error": "数据库未找到"}

    try:
        conn = sqlite3.connect(db_path)
        conn.row_factory = sqlite3.Row
        c = conn.cursor()
        c.execute("SELECT pilimi_torrent FROM books WHERE zlibrary_id = ?", (zlibrary_id,))
        row = c.fetchone()
        conn.close()

        if not row or not row["pilimi_torrent"]:
            return {"status": "NOT_FOUND", "error": f"未找到 ID {zlibrary_id} 的种子信息"}

        torrent_name = row["pilimi_torrent"]
    except Exception as e:
        return {"status": "ERROR", "error": str(e)[:200]}

    # 搜索种子文件在磁盘上的位置
    for part in ["第一部分", "第二部分"]:
        torrent_path = TORRENT_ROOT / part / torrent_name
        if torrent_path.exists():
            # 解析种子，找到该文件
            try:
                import bencoding
                data = torrent_path.read_bytes()
                decoded = bencoding.bdecode(data)
                info = decoded[b"info"]
                files = info[b"files"]

                file_index = None
                file_info = None
                for idx, f in enumerate(files):
                    name_bytes = b"/".join(f[b"path"]) if isinstance(f[b"path"], list) else f[b"path"]
                    name = name_bytes.decode("utf-8", errors="replace")
                    if str(zlibrary_id) in name:
                        file_index = idx
                        file_info = {
                            "name": name,
                            "size": f[b"length"],
                            "size_hr": format_size(f[b"length"]),
                        }
                        break

                return {
                    "status": "FOUND",
                    "zlibrary_id": zlibrary_id,
                    "torrent_name": torrent_name,
                    "torrent_path": str(torrent_path),
                    "torrent_part": part,
                    "torrent_size_mb": round(len(data) / (1024*1024), 1),
                    "total_files_in_torrent": len(files),
                    "file": file_info,
                    "file_index": file_index,
                }
            except ImportError:
                return {"status": "FOUND", "torrent_path": str(torrent_path),
                        "torrent_name": torrent_name, "note": "bencoding 库未安装，无法解析种子内部结构"}
            except Exception as e:
                return {"status": "ERROR", "error": f"种子解析失败: {e}"}

    return {"status": "NOT_FOUND", "error": f"磁盘上未找到种子文件: {torrent_name}"}


# ── 文件下载 ──

DOWNLOAD_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "downloads")

def get_download_info(zlibrary_id: int) -> dict:
    """获取下载所需信息：种子路径、文件索引、大小等。

    不执行实际下载——用户可用这些信息在百度云或其他工具中下载。
    """
    locate = locate_torrent(zlibrary_id)
    if locate["status"] not in ("FOUND",):
        return {"status": "ERROR", "error": f"未找到 ID {zlibrary_id}"}

    file_info = locate.get("file", {})
    return {
        "status": "READY",
        "zlibrary_id": zlibrary_id,
        "file_name": file_info.get("name", f"{zlibrary_id}"),
        "file_size": file_info.get("size_hr", "unknown"),
        "torrent_path": locate.get("torrent_path", ""),
        "torrent_name": locate.get("torrent_name", ""),
        "file_index_in_torrent": locate.get("file_index"),
        "note": "种子文件已定位。将 .torrent 文件拖入百度云离线下载即可获取内容。",
    }


def aria2_download(zlibrary_id: int, output_dir: str = None, timeout: int = 180) -> dict:
    """通过 aria2c BT 下载指定书籍。

    Args:
        zlibrary_id: 书籍 ID
        output_dir: 下载目录（默认 softill 的 downloads/<id>/）
        timeout: 超时秒数（默认 180s）

    Returns:
        dict: 下载结果
    """
    # 1. 定位种子和文件索引
    locate = locate_torrent(zlibrary_id)
    if locate["status"] != "FOUND":
        return {
            "result": "ERROR",
            "summary": f"未找到 ID {zlibrary_id}",
            "data": {"zlibrary_id": zlibrary_id},
        }

    torrent_path = locate["torrent_path"]
    file_index = locate.get("file_index")
    file_info = locate.get("file", {})

    if file_index is None:
        return {
            "result": "ERROR",
            "summary": f"ID {zlibrary_id} 在种子中未找到文件索引",
            "data": {"zlibrary_id": zlibrary_id, "torrent": torrent_path},
        }

    # 2. 输出目录
    if not output_dir:
        output_dir = os.path.join(DOWNLOAD_DIR, str(zlibrary_id))
    os.makedirs(output_dir, exist_ok=True)

    # 3. aria2c: --select-file 是 1-based
    aria2_index = file_index + 1
    cmd = [
        "aria2c",
        "--seed-time=0",            # 下完不做种
        f"--select-file={aria2_index}",
        f"--dir={output_dir}",
        "--summary-interval=0",      # 减少啰嗦输出
        "--console-log-level=warn",
        torrent_path,
    ]

    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=timeout,
        )
    except subprocess.TimeoutExpired:
        return {
            "result": "ERROR",
            "summary": f"下载超时（{timeout}s），种子可能无足够活跃种源",
            "data": {
                "zlibrary_id": zlibrary_id,
                "torrent_path": torrent_path,
                "file_index": file_index,
                "note": "可尝试在 BT 客户端中手动加载该种子继续下载",
            },
        }
    except FileNotFoundError:
        return {
            "result": "ERROR",
            "summary": "aria2c 未安装，请先安装: scoop install aria2 或 choco install aria2",
            "data": {},
        }
    except Exception as e:
        return {
            "result": "ERROR",
            "summary": f"下载进程异常: {str(e)[:200]}",
            "data": {"zlibrary_id": zlibrary_id},
        }

    # 4. 解析结果
    if result.returncode != 0:
        stderr = result.stderr.strip() or result.stdout.strip() or "未知错误"
        return {
            "result": "ERROR",
            "summary": f"aria2c 返回错误: {stderr[:300]}",
            "data": {
                "zlibrary_id": zlibrary_id,
                "return_code": result.returncode,
                "torrent_path": torrent_path,
            },
        }

    # 5. 找已下载文件
    downloaded_files = []
    for root, dirs, files in os.walk(output_dir):
        for f in files:
            fp = os.path.join(root, f)
            # 跳过 aria2 控制文件
            if f.endswith(".aria2"):
                continue
            size = os.path.getsize(fp)
            downloaded_files.append({
                "path": fp,
                "filename": f,
                "size": size,
                "size_hr": format_size(size),
            })

    if not downloaded_files:
        return {
            "result": "PARTIAL",
            "summary": f"aria2c 已执行完毕但未找到下载文件（可能被选中跳过）",
            "data": {"zlibrary_id": zlibrary_id, "output_dir": output_dir},
        }

    file_sizes = [f["size"] for f in downloaded_files]
    total_size = sum(file_sizes)
    primary = downloaded_files[0]

    return {
        "result": "PASS",
        "summary": f"书籍 #{zlibrary_id} 下载完成: {primary['filename']} ({primary['size_hr']})",
        "data": {
            "zlibrary_id": zlibrary_id,
            "output_dir": output_dir,
            "files": downloaded_files,
            "total_size": total_size,
            "primary_file": primary["path"],
        },
        "evidence": [
            {
                "type": "aria2_download",
                "result": "PASS",
                "summary": f"ID {zlibrary_id} → {primary['filename']} ({primary['size_hr']})",
            }
        ],
    }


# ── 书籍信息查询（本地 DB + 网络 API）──

def fetch_book_info(title: str, author: str = "") -> dict:
    """从本地数据库 + 网络 API 查询书籍信息。"""
    result = {"title": title, "author": author, "sources_checked": [], "matches": []}

    # 本地 DB：使用 FTS5 精确匹配
    db_path = find_db()
    if db_path:
        try:
            conn = sqlite3.connect(db_path)
            conn.row_factory = sqlite3.Row
            c = conn.cursor()
            # 先用 ID 查（如果是数字）
            if title.isdigit():
                c.execute("SELECT zlibrary_id, title, author, year, language, extension, "
                          "filesize, publisher, substr(description,1,500) as description "
                          "FROM books WHERE zlibrary_id = ?", (int(title),))
            else:
                # FTS5 精确短语搜索
                fts_q = f'"{title}"'
                if author:
                    fts_q += f' "{author}"'
                c.execute("""
                    SELECT zlibrary_id, title, author, year, language, extension,
                           filesize, publisher, substr(description,1,500) as description
                    FROM books WHERE zlibrary_id IN (
                        SELECT rowid FROM books_fts WHERE books_fts MATCH ?
                    ) LIMIT 5
                """, (fts_q,))
            rows = c.fetchall()
            conn.close()

            for r in rows:
                result["matches"].append({
                    "id": r["zlibrary_id"],
                    "title": clean_text(r["title"])[:200],
                    "author": clean_text(r["author"])[:150],
                    "year": r["year"],
                    "format": r["extension"],
                    "size": format_size(r["filesize"]),
                    "publisher": clean_text(r["publisher"])[:150] if r["publisher"] else "",
                    "description": clean_text(r["description"])[:300] if r["description"] else "",
                })
            if rows:
                result["sources_checked"].append("local_db")
        except Exception as e:
            result["local_db_error"] = str(e)[:100]

    # Open Library API
    try:
        import urllib.request, urllib.parse
        q = urllib.parse.quote(f"{title} {author}")
        req = urllib.request.Request(
            f"https://openlibrary.org/search.json?q={q}&limit=3",
            headers={"User-Agent": "Soma-zlib-eye/0.1"},
        )
        resp = urllib.request.urlopen(req, timeout=8)
        docs = json.loads(resp.read()).get("docs", [])
        if docs:
            result["open_library"] = [{
                "title": d.get("title", ""),
                "author": ", ".join(d.get("author_name", [])),
                "year": d.get("first_publish_year"),
                "subjects": d.get("subject", [])[:6],
            } for d in docs[:2]]
            result["sources_checked"].append("open_library")
    except Exception:
        pass

    return result


# ── HTTP 下载（Playwright 自动化）──

ZLIB_MIRROR = "https://zlib.bz"
DOWNLOAD_DIR_HTTP = os.path.join(os.path.dirname(os.path.abspath(__file__)), "downloads")

def download_http(book: dict, output_dir: str = None, timeout: int = 120) -> dict:
    """通过 Playwright 从 Z-Library 镜像站 HTTP 下载书籍。

    Args:
        book: 书籍信息字典（包含 title, author, md5 等字段）
        output_dir: 下载目录
        timeout: 超时秒数（默认 120s）

    Returns:
        dict: 下载结果
    """
    title = book.get("title", "").strip()
    author = book.get("author", "").strip()
    md5 = book.get("md5", "").strip()
    zlibrary_id = book.get("zlibrary_id")

    if not title:
        return {"result": "ERROR", "summary": "需要书名(title)参数", "data": {}}

    if not output_dir:
        output_dir = os.path.join(DOWNLOAD_DIR_HTTP, str(zlibrary_id or "http"))
    os.makedirs(output_dir, exist_ok=True)

    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        return {"result": "ERROR", "summary": "playwright 未安装: pip install playwright && python -m playwright install chromium", "data": {}}

    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            page = browser.new_page()

            # 1. 访问首页过 Cloudflare
            page.goto(ZLIB_MIRROR, timeout=30000, wait_until="networkidle")
            page.wait_for_timeout(2000)

            # 2. 构建搜索关键词
            search_query = title
            if author:
                search_query = f'"{title}" {author}'

            # 优先用 md5 搜索（精确匹配）
            search_url = f"{ZLIB_MIRROR}/s/{md5}" if md5 and len(md5) == 32 else ""
            if not search_url:
                import urllib.parse
                search_url = f"{ZLIB_MIRROR}/s/{urllib.parse.quote(search_query)}"

            page.goto(search_url, timeout=30000, wait_until="networkidle")
            page.wait_for_timeout(3000)

            # 3. 检查结果
            results = page.locator('a[href*="/book/"]')
            result_count = results.count()

            if result_count == 0:
                browser.close()
                return {"result": "ERROR", "summary": f"在 Z-Library 上未找到匹配的书籍: {title}", "data": {}}

            # 4. 点击第一个结果
            book_url = results.first.get_attribute("href")
            results.first.click()
            page.wait_for_timeout(3000)

            # 5. 找下载链接
            dl_link = page.locator('a[href*="/dl/"]').first
            if dl_link.count() == 0:
                browser.close()
                return {"result": "ERROR", "summary": "未找到下载链接", "data": {"book_url": book_url}}

            dl_url = dl_link.get_attribute("href")
            dl_text = dl_link.inner_text().strip()

            # 6. 下载文件
            with page.expect_download(timeout=timeout * 1000) as download_info:
                dl_link.click()
                page.wait_for_timeout(2000)

            download = download_info.value
            filename = download.suggested_filename or f"{zlibrary_id or 'book'}"
            save_path = os.path.join(output_dir, filename)
            download.save_as(save_path)

            file_size = os.path.getsize(save_path)
            browser.close()

            return {
                "result": "PASS",
                "summary": f"下载成功: {filename} ({format_size(file_size)})",
                "data": {
                    "zlibrary_id": zlibrary_id,
                    "title": title,
                    "filename": filename,
                    "file_size": file_size,
                    "file_size_hr": format_size(file_size),
                    "save_path": save_path,
                    "source": "zlib.bz",
                },
                "evidence": [{
                    "type": "http_download",
                    "result": "PASS",
                    "summary": f"{title} → {filename} ({format_size(file_size)})",
                }],
            }

    except Exception as e:
        err_msg = str(e)[:300]
        if "Timeout" in err_msg:
            return {"result": "ERROR", "summary": f"下载超时（{timeout}s）: {err_msg}", "data": {}}
        return {"result": "ERROR", "summary": f"下载失败: {err_msg}", "data": {}}


def main():
    if len(sys.argv) > 1 and sys.argv[1] != '--':
        input_str = sys.argv[1]
    else:
        input_str = sys.stdin.read()

    try:
        params = json.loads(input_str)
    except json.JSONDecodeError as e:
        print(json.dumps({'result': 'ERROR', 'summary': f'JSON 解析失败: {e}', 'data': {}, 'evidence': []}))
        sys.exit(1)

    mode = params.get("mode", "search")

    if mode == "info":
        result_data = fetch_book_info(
            params.get("title", ""),
            params.get("author", ""),
        )
        result = {
            "result": "PASS" if result_data.get("matches") or result_data.get("open_library") else "ERROR",
            "summary": f"查询 \"{params.get('title')}\": {len(result_data.get('sources_checked', []))} 个来源",
            "data": result_data,
            "evidence": [{"type": "book_info", "result": "PASS", "summary": f"来源: {result_data['sources_checked']}"}],
        }

    elif mode == "stats":
        result_data = {"status": "OK", "db_path": find_db(), "torrents": len(os.listdir(TORRENT_ROOT / "第一部分")) + len(os.listdir(TORRENT_ROOT / "第二部分")) if TORRENT_ROOT.exists() else 0}
        result = {"result": "PASS", "summary": "zlib-eye 就绪", "data": result_data, "evidence": []}

    elif mode == "locate":
        result_data = locate_torrent(params.get("id", 0))
        result = {
            "result": "PASS" if result_data["status"] in ("FOUND", "SUCCESS") else "ERROR",
            "summary": result_data.get("error", f"已定位 ID {params.get('id')}"),
            "data": result_data,
            "evidence": [{"type": "locate", "result": result_data["status"], "summary": result_data.get("error", "ok")}],
        }
    elif mode == "download":
        # 实际通过 aria2c 下载
        out_dir = params.get("output_dir")
        dl_timeout = int(params.get("timeout", 180))
        result = aria2_download(params.get("id", 0), output_dir=out_dir, timeout=dl_timeout)
    elif mode == "download_info":
        # 只返回信息不下
        result_data = get_download_info(params.get("id", 0))
        result = {
            "result": "PASS" if result_data["status"] == "READY" else "ERROR",
            "summary": result_data.get("error", f"已定位: {result_data.get('file_name')}"),
            "data": result_data,
            "evidence": [{"type": "download", "result": result_data["status"], "summary": "下载信息已就绪"}],
        }
    elif mode == "download_http":
        # 通过 Playwright 从 Z-Library 镜像站下载
        result = download_http(
            {"title": params.get("title", ""), "author": params.get("author", ""),
             "md5": params.get("md5", ""), "zlibrary_id": params.get("id")},
            output_dir=params.get("output_dir"),
            timeout=int(params.get("timeout", 120)),
        )
    else:
        # 默认搜索模式
        result = search_books(params)

    print(json.dumps(result, ensure_ascii=False))
    sys.exit(0 if result.get("result") in ("PASS",) else 1)


if __name__ == '__main__':
    main()
