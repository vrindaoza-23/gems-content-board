#!/usr/bin/env python3
"""Build the read-only client board (no agent notes, no buttons) and push it to GitHub Pages.

  publish_board.py           build site/ and push
  publish_board.py --build   build site/ only

Repo: vrindaoza-23/gems-content-board  ->  https://vrindaoza-23.github.io/gems-content-board/
"""
import json, os, re, sys, subprocess, time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SITE = os.path.join(ROOT, 'site')
REPO = 'vrindaoza-23/gems-content-board'
TOOL_FILES = ['dashboard/board.html', 'review/Code.gs', 'review/SETUP.md', 'tools/publish_board.py', 'tools/reviews.py', 'review/README.md']
sys.path.insert(0, os.path.join(ROOT, 'tools'))
import pipeline


def front(text):
    m = re.match(r'^---\n(.*?)\n---\n(.*)$', text, flags=re.S)
    if not m:
        return {}, text
    meta = {}
    for line in m.group(1).splitlines():
        if ':' in line:
            k, v = line.split(':', 1); meta[k.strip()] = v.strip().strip('"').strip('"')
    return meta, m.group(2)


CFG = os.path.join(ROOT, 'data', 'review-config.json')


def config():
    # content_key locks the posts (only logged-in reviewers get it); api_secret lets reviews.py read the Sheet.
    # Both stay on this Mac and in the Sheet's Config tab; neither is pushed to GitHub.
    cfg = pipeline.load(CFG, {})
    changed = False
    for k, n in (('content_key', 32), ('api_secret', 24)):
        if not cfg.get(k):
            cfg[k] = os.urandom(n).hex(); changed = True
    if changed:
        json.dump(cfg, open(CFG, 'w'), indent=1)
    return cfg


def encrypt(text, key_hex):
    # AES-256-CBC via openssl; the page decrypts it with WebCrypto after login
    iv = os.urandom(16).hex()
    out = subprocess.run(['openssl', 'enc', '-aes-256-cbc', '-K', key_hex, '-iv', iv, '-base64', '-A'],
                         input=text.encode('utf-8'), capture_output=True, check=True).stdout.decode().strip()
    return {'iv': iv, 'data': out}


def build():
    posts = []
    for p in pipeline.load(pipeline.PIPE, {'posts': []})['posts']:
        if p['stage'] in ('topic', 'topic_ok', 'topic_rework', 'drafting'):
            continue  # reviewers only see written posts
        meta, body = {}, ''
        path = os.path.join(ROOT, p['file']) if p.get('file') else ''
        if path and os.path.isfile(path) and p['stage'] not in ('drafting', 'topic', 'topic_ok', 'topic_rework'):
            meta, body = front(open(path, encoding='utf-8').read())
        asks = sorted(set(a.strip() for a in re.findall(r'\[ASK GEMS:\s*([^\]]+)\]', body)))
        posts.append({'id': p['id'], 'month': p['month'], 'school': p['school'], 'title': meta.get('h1') or p['title'],
                      'keyword': p['keyword'], 'stage': p['stage'], 'publish_date': meta.get('publish_date', ''),
                      'url': meta.get('url', ''), 'seo_title': meta.get('seo_title', ''),
                      'meta_description': meta.get('meta_description', ''), 'asks': asks, 'body': body.strip(),
                      'image_notes': meta.get('image_notes', ''),
                      'updated': time.strftime('%Y-%m-%dT%H:%M:%S', time.gmtime(os.path.getmtime(path))) + 'Z' if path and os.path.isfile(path) else '',
                      'revision_note': (p.get('notes') or [{}])[-1].get('note', '') if p.get('notes') else ''})
    data = {'updated': time.strftime('%d %b %Y, %H:%M'), 'posts': posts,
            'schools': [{'slug': s['slug'], 'name': s['name']} for s in pipeline.load(os.path.join(ROOT, 'data', 'schools.json'), [])]}
    html = open(os.path.join(ROOT, 'dashboard', 'board.html'), encoding='utf-8').read()
    cfg = config()
    html = html.replace('/*ENC*/null', json.dumps(encrypt(json.dumps(data, ensure_ascii=False), cfg['content_key'])))
    html = html.replace("/*REVIEW_URL*/''", json.dumps(cfg.get('review_url', '')))
    os.makedirs(SITE, exist_ok=True)
    open(os.path.join(SITE, 'index.html'), 'w', encoding='utf-8').write(html)
    open(os.path.join(SITE, 'robots.txt'), 'w').write('User-agent: *\nDisallow: /\n')
    open(os.path.join(SITE, '.nojekyll'), 'w').write('')
    # keep a copy of the review tool's own code in the repo (no content, no data)
    import shutil
    os.makedirs(os.path.join(SITE, 'tool'), exist_ok=True)
    for src in TOOL_FILES:
        shutil.copy(os.path.join(ROOT, src), os.path.join(SITE, 'tool', os.path.basename(src)))
    print(f'built site/index.html with {len(posts)} posts')


def init_sheet():
    # hand the content key and API secret to the review Sheet once (it refuses to change them afterwards)
    cfg = config()
    if not cfg.get('review_url'):
        return
    body = json.dumps({'op': 'init', 'key': cfg['content_key'], 'secret': cfg['api_secret']})
    raw = subprocess.run(['curl', '-sL', '-H', 'Content-Type: text/plain', '-d', body, cfg['review_url']],
                         capture_output=True, text=True).stdout
    try:
        r = json.loads(raw)
    except ValueError:
        print('review Sheet: no answer (check the Apps Script deployment)'); return
    print('review Sheet keys:', 'ok' if r.get('ok') else r.get('error'))


def sh(*cmd):
    return subprocess.run(cmd, cwd=SITE, check=True, capture_output=True, text=True).stdout


def push():
    if not os.path.isdir(os.path.join(SITE, '.git')):
        sh('git', 'init', '-b', 'main')
        sh('git', 'remote', 'add', 'origin', f'https://github.com/{REPO}.git')
    sh('git', 'add', '-A')
    if subprocess.run(['git', 'diff', '--cached', '--quiet'], cwd=SITE).returncode == 0:
        print('no changes'); return
    sh('git', 'commit', '-m', f'Board update {time.strftime("%Y-%m-%d %H:%M")}')
    sh('git', 'push', '-u', 'origin', 'main')
    print(f'pushed -> https://github.com/{REPO} (Pages link works once the repo is public with Pages on)')


if __name__ == '__main__':
    build()
    if '--build' not in sys.argv:
        push()
        init_sheet()
