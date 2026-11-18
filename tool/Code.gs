/**
 * GEMS Content Review: stores approvals and comments from the review site in this Sheet.
 * @OnlyCurrentDoc   (Google lets this script touch only the Sheet it lives in)
 */
const SHEET = 'Reviews';
const HEAD = ['time', 'post_id', 'post_school', 'post_title', 'reviewer', 'reviewer_school', 'action', 'comment'];
const ACTIONS = ['Approved', 'Changes requested', 'Comment'];

function sheet_() {
  const ss = SpreadsheetApp.getActive();
  let s = ss.getSheetByName(SHEET);
  if (!s) { s = ss.insertSheet(SHEET); s.appendRow(HEAD); s.setFrozenRows(1); }
  return s;
}

function out_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

// cut to length and stop text being read as a spreadsheet formula
function clean_(v, n) {
  const s = String(v == null ? '' : v).trim().slice(0, n);
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}

function doGet() {
  const v = sheet_().getDataRange().getValues();
  const head = v.shift();
  const rows = v.map(r => {
    const o = {};
    head.forEach((k, i) => { o[k] = r[i] instanceof Date ? r[i].toISOString() : String(r[i]).replace(/^'/, ''); });
    return o;
  });
  return out_({ rows: rows });
}

function doPost(e) {
  let d;
  try { d = JSON.parse(e.postData.contents); } catch (x) { return out_({ ok: false, error: 'bad request' }); }
  const action = String(d.action || '');
  const postId = String(d.post_id || '');
  const name = clean_(d.reviewer, 80);
  const comment = clean_(d.comment, 3000);
  if (ACTIONS.indexOf(action) < 0) return out_({ ok: false, error: 'unknown action' });
  if (!/^[A-Za-z0-9-]{3,40}$/.test(postId)) return out_({ ok: false, error: 'unknown post' });
  if (!name) return out_({ ok: false, error: 'name is required' });
  if (action !== 'Approved' && !comment) return out_({ ok: false, error: 'comment is required' });
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    sheet_().appendRow([new Date(), postId, clean_(d.post_school, 80), clean_(d.post_title, 300), name,
                        clean_(d.reviewer_school, 80), action, comment]);
  } finally { lock.releaseLock(); }
  return out_({ ok: true });
}
