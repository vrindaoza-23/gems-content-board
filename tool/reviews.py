#!/usr/bin/env python3
"""Pull GEMS's approvals, change requests and comments from the review Sheet.

  reviews.py          fetch, save to state/gems-reviews.json, print a summary per post
  reviews.py --todo   only posts where GEMS asked for changes (with their comments)

The review site (GitHub Pages) writes to a Google Sheet via the Apps Script URL in data/review-config.json.
"""
import json, os, subprocess, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import pipeline

ROOT = pipeline.ROOT
OUT = os.path.join(ROOT, 'state', 'gems-reviews.json')


def fetch():
    cfg = pipeline.load(os.path.join(ROOT, 'data', 'review-config.json'), {})
    if not cfg.get('review_url') or not cfg.get('api_secret'):
        sys.exit('review_url / api_secret missing in data/review-config.json.')
    # curl, not urllib: python's SSL store fails on this machine
    raw = subprocess.run(['curl', '-sL', '-H', 'Content-Type: text/plain', '-d', json.dumps({'op': 'list', 'secret': cfg['api_secret']}),
                          cfg['review_url']], capture_output=True, text=True, check=True).stdout
    res = json.loads(raw)
    if not res.get('ok'):
        sys.exit('Sheet said: ' + res.get('error', 'error') + ' (is the api_secret in Config!B2?)')
    rows = res['rows']
    json.dump(rows, open(OUT, 'w'), indent=1, ensure_ascii=False)
    return rows


def summary(rows, todo_only):
    by = {}
    for r in sorted(rows, key=lambda r: r['time']):
        by.setdefault(r['post_id'], []).append(r)
    for pid, rs in sorted(by.items()):
        decisions = [r for r in rs if r['action'] != 'Comment']
        status = decisions[-1]['action'] if decisions else 'Comments only'
        if todo_only and status != 'Changes requested':
            continue
        print(f'{pid}  [{status}]')
        for r in rs:
            if r['comment']:
                print(f"    {r['time'][:16]}  {r['reviewer']} ({r['reviewer_school']}): {r['comment']}")


if __name__ == '__main__':
    rows = fetch()
    print(f'{len(rows)} review entries saved to {os.path.relpath(OUT, ROOT)}\n')
    summary(rows, '--todo' in sys.argv)
