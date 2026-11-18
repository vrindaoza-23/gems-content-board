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
    url = pipeline.load(os.path.join(ROOT, 'data', 'review-config.json'), {}).get('review_url')
    if not url:
        sys.exit('No review_url in data/review-config.json yet.')
    # curl, not urllib: python's SSL store fails on this machine
    raw = subprocess.run(['curl', '-sL', url + '?action=list'], capture_output=True, text=True, check=True).stdout
    rows = json.loads(raw)['rows']
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
