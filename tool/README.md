# GEMS Content Review tool

The page the GEMS central team uses to read, approve, request changes and comment on blogs and playbooks.

- `board.html`: the review page template. `publish_board.py` fills in the posts and the Sheet URL, then pushes it to GitHub Pages.
- `Code.gs`: the Google Apps Script inside the "GEMS Content Reviews" Sheet (hello@alignd.in) that stores every review. Setup: `SETUP.md`.
- `reviews.py`: pulls the reviews back into the Content Studio (`python3 tools/reviews.py --todo`).
- To publish an update, run `.venv/bin/python tools/publish_board.py` from the Content Studio folder.
