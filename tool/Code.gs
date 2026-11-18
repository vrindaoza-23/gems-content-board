/**
 * GEMS Content Review: personal logins, reviews and an activity log, all kept in this Sheet.
 * @OnlyCurrentDoc   (Google lets this script touch only the Sheet it lives in)
 *
 * Tabs (created automatically):
 *   Users     email | name | active | pass_hash | salt | created | last_login
 *             You add email, name and active = yes. People set their own password on first login.
 *             To reset someone's password, clear their pass_hash cell. To remove access, set active = no.
 *   Reviews   every approval, change request, comment and "seen"
 *   Activity  every login, failed login, password set and logout
 *   Config    optional; the content key and API secret are kept in Script Properties (set once by the Content Studio)
 *
 * People create their own account on the sign-in screen if their email is a GEMS / alignd address (see ALLOWED_*).
 * Anyone else can still be let in by adding their email to the Users tab with active = yes.
 */
const ACTIONS = ['Approved', 'Changes requested', 'Comment', 'Seen'];
// Who may create an account from the sign-in screen. Anyone else needs a row in the Users tab.
const ALLOWED_DOMAINS = ['gemsedu.in', 'gemseducation.com', 'alignd.in'];
const ALLOWED_EMAILS = [];
const SESSION_SECONDS = 6 * 60 * 60;   // logins last 6 hours
const MAX_FAILS = 5, LOCK_SECONDS = 15 * 60;
const HEADS = {
  Users: ['email', 'name', 'active', 'pass_hash', 'salt', 'created', 'last_login'],
  Reviews: ['time', 'post_id', 'post_school', 'post_title', 'reviewer', 'reviewer_email', 'action', 'comment', 'quote'],
  Activity: ['time', 'email', 'name', 'event', 'detail'],
  Config: ['content_key', 'api_secret'],
};

function ss_() {
  const ss = SpreadsheetApp.getActive();
  if (!ss) throw new Error('Open this script from the Google Sheet (Extensions > Apps Script).');
  return ss;
}

function tab_(name) {
  const ss = ss_();
  let s = ss.getSheetByName(name);
  if (!s) {
    s = ss.insertSheet(name);
    if (name === 'Config') { s.getRange('A1:A2').setValues([['content_key'], ['api_secret']]); }
    else { s.appendRow(HEADS[name]); s.setFrozenRows(1); }
  }
  if (name !== 'Config') {           // add any missing columns to older tabs
    const have = s.getRange(1, 1, 1, Math.max(1, s.getLastColumn())).getValues()[0].map(String);
    HEADS[name].filter(h => have.indexOf(h) < 0).forEach(h => s.getRange(1, have.push(h)).setValue(h));
  }
  return s;
}

function rows_(name) {
  const v = tab_(name).getDataRange().getValues();
  const head = v.shift().map(String);
  return v.map((r, i) => {
    const o = { _row: i + 2 };
    head.forEach((k, j) => { o[k] = r[j] instanceof Date ? r[j].toISOString() : String(r[j]).replace(/^'/, ''); });
    return o;
  });
}

function append_(name, obj) {
  const s = tab_(name);
  const head = s.getRange(1, 1, 1, s.getLastColumn()).getValues()[0].map(String);
  s.appendRow(head.map(h => (h in obj ? obj[h] : '')));
}

function out_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

// cut to length and stop text being read as a spreadsheet formula
function clean_(v, n) {
  const s = String(v == null ? '' : v).trim().slice(0, n);
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}

function hash_(password, salt) {
  let h = salt + ':' + password;
  for (let i = 0; i < 1000; i++) {
    h = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, h, Utilities.Charset.UTF_8)
      .map(b => ('0' + (b & 255).toString(16)).slice(-2)).join('');
  }
  return h;
}

function config_(cell) {
  const props = PropertiesService.getScriptProperties();
  const v = props.getProperty(cell === 'B1' ? 'CONTENT_KEY' : 'API_SECRET');
  if (v) return v;
  const s = SpreadsheetApp.getActive().getSheetByName('Config');
  return s ? String(s.getRange(cell).getValue() || '').trim() : '';
}

function allowedToSignUp_(email) {
  const dom = email.split('@')[1] || '';
  return ALLOWED_EMAILS.indexOf(email) >= 0 || ALLOWED_DOMAINS.indexOf(dom) >= 0;
}

function log_(email, name, event, detail) {
  append_('Activity', { time: new Date(), email: email, name: name, event: event, detail: clean_(detail, 300) });
}

function user_(email) {
  return rows_('Users').find(u => u.email.trim().toLowerCase() === email && /^y/i.test(u.active));
}

function anyUser_(email) {
  return rows_('Users').find(u => u.email.trim().toLowerCase() === email);
}

function session_(token) {
  if (!token || !/^[a-f0-9-]{36}$/.test(token)) return null;
  const raw = CacheService.getScriptCache().get('s_' + token);
  if (!raw) return null;
  const s = JSON.parse(raw);
  return user_(s.email) ? s : null;     // access removed? the session stops at once
}

function doGet() {
  return out_({ ok: false, error: 'login required' });
}

function doPost(e) {
  let d;
  try { d = JSON.parse(e.postData.contents); } catch (x) { return out_({ ok: false, error: 'bad request' }); }
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try { return out_(handle_(d)); }
  catch (x) { return out_({ ok: false, error: String(x.message || x) }); }
  finally { lock.releaseLock(); }
}

function handle_(d) {   // eslint-disable-line no-param-reassign
  const cache = CacheService.getScriptCache();

  // the Content Studio stores the content key and API secret once; after that they can't be changed from outside
  if (d.op === 'init') {
    const props = PropertiesService.getScriptProperties();
    const k = props.getProperty('CONTENT_KEY'), sec = props.getProperty('API_SECRET');
    if (k && sec) return (k === d.key && sec === d.secret) ? { ok: true, already: true } : { ok: false, error: 'already set' };
    if (!/^[a-f0-9]{64}$/.test(String(d.key || '')) || !/^[a-f0-9]{48}$/.test(String(d.secret || ''))) return { ok: false, error: 'bad keys' };
    props.setProperties({ CONTENT_KEY: d.key, API_SECRET: d.secret });
    return { ok: true };
  }

  if (d.op === 'signup') {
    const email = String(d.email || '').trim().toLowerCase().slice(0, 120);
    const name = clean_(d.name, 80);
    const password = String(d.password || '');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok: false, error: 'Enter a valid email address.' };
    if (!name) return { ok: false, error: 'Enter your name.' };
    if (password.length < 8) return { ok: false, error: 'Choose a password of at least 8 characters.' };
    const existing = anyUser_(email);
    if (existing && existing.pass_hash) return { ok: false, error: 'This email already has an account. Sign in instead.' };
    if (existing && !/^y/i.test(existing.active)) return { ok: false, error: 'This email does not have access. Ask Vrinda.' };
    if (!existing && !allowedToSignUp_(email)) { log_(email, name, 'Sign-up refused', 'email domain not allowed'); return { ok: false, error: 'Please use your GEMS or alignd email address.' }; }
    if (!existing) append_('Users', { email: email, name: name, active: 'yes', created: new Date() });
    log_(email, name, 'Account created', existing ? 'added by Vrinda' : 'self sign-up');
    if (existing && !existing.name) {
      const s = tab_('Users'); const head = s.getRange(1, 1, 1, s.getLastColumn()).getValues()[0].map(String);
      s.getRange(existing._row, head.indexOf('name') + 1).setValue(name);
    }
    d = { op: 'login', email: email, password: password };   // continue as a first login, which saves the password
  }

  if (d.op === 'login') {
    const email = String(d.email || '').trim().toLowerCase().slice(0, 120);
    const password = String(d.password || '');
    const failKey = 'f_' + email;
    const fails = Number(cache.get(failKey) || 0);
    if (fails >= MAX_FAILS) return { ok: false, error: 'Too many attempts. Try again in 15 minutes.' };
    const u = user_(email);
    if (!u) { cache.put(failKey, String(fails + 1), LOCK_SECONDS); log_(email, '', 'Login refused', 'no account or not active'); return { ok: false, error: 'No account for this email yet. Choose "Create account".' }; }
    const s = tab_('Users');
    if (!u.pass_hash) {                 // first login: the person sets their own password
      if (password.length < 8) return { ok: false, firstTime: true, error: 'Choose a password of at least 8 characters.' };
      if (d.op !== 'login') return { ok: false, error: 'unexpected' };
      const salt = Utilities.getUuid();
      const head = s.getRange(1, 1, 1, s.getLastColumn()).getValues()[0].map(String);
      s.getRange(u._row, head.indexOf('pass_hash') + 1).setValue(hash_(password, salt));
      s.getRange(u._row, head.indexOf('salt') + 1).setValue(salt);
      if (!u.created) s.getRange(u._row, head.indexOf('created') + 1).setValue(new Date());
      log_(email, u.name, 'Password set', '');
    } else if (hash_(password, u.salt) !== u.pass_hash) {
      cache.put(failKey, String(fails + 1), LOCK_SECONDS);
      log_(email, u.name, 'Login failed', 'wrong password');
      return { ok: false, error: 'Wrong password.' };
    }
    cache.remove(failKey);
    const token = Utilities.getUuid();
    cache.put('s_' + token, JSON.stringify({ email: email, name: u.name }), SESSION_SECONDS);
    const head = s.getRange(1, 1, 1, s.getLastColumn()).getValues()[0].map(String);
    s.getRange(u._row, head.indexOf('last_login') + 1).setValue(new Date());
    log_(email, u.name, 'Logged in', '');
    const key = config_('B1');
    if (!key) return { ok: false, error: 'The site is not set up yet (missing content key). Ask Vrinda.' };
    return { ok: true, token: token, name: u.name || email, email: email, key: key };
  }

  if (d.op === 'check') {               // does this email have an account / a password yet?
    const u = user_(String(d.email || '').trim().toLowerCase());
    return { ok: true, exists: !!(u && u.pass_hash), firstTime: !!(u && !u.pass_hash) };
  }

  // the Content Studio reads reviews with its own secret
  if (d.op === 'list' && d.secret) {
    const secret = config_('B2');
    if (!secret || d.secret !== secret) return { ok: false, error: 'bad secret' };
    return { ok: true, rows: rows_('Reviews') };
  }

  const me = session_(d.token);
  if (!me) return { ok: false, error: 'login required' };

  if (d.op === 'list') return { ok: true, rows: rows_('Reviews').map(r => { delete r._row; return r; }) };

  if (d.op === 'logout') { cache.remove('s_' + d.token); log_(me.email, me.name, 'Logged out', ''); return { ok: true }; }

  if (d.op === 'review' || d.op === 'bulk') {
    const action = String(d.action || '');
    if (ACTIONS.indexOf(action) < 0) return { ok: false, error: 'unknown action' };
    const items = d.op === 'bulk' ? (d.items || []).slice(0, 60) : [d];
    if (d.op === 'bulk' && action !== 'Approved') return { ok: false, error: 'bulk is for approvals only' };
    const comment = clean_(d.comment, 3000);
    if ((action === 'Changes requested' || action === 'Comment') && !comment) return { ok: false, error: 'comment is required' };
    for (const it of items) {
      if (!/^[A-Za-z0-9-]{3,40}$/.test(String(it.post_id || ''))) return { ok: false, error: 'unknown post' };
    }
    items.forEach(it => append_('Reviews', {
      time: new Date(), post_id: String(it.post_id), post_school: clean_(it.post_school, 80), post_title: clean_(it.post_title, 300),
      reviewer: me.name, reviewer_email: me.email, action: action, comment: comment, quote: clean_(d.quote, 500),
    }));
    return { ok: true, saved: items.length };
  }

  return { ok: false, error: 'unknown request' };
}

// Run once from the editor (choose "setup" next to Run, then click Run) to create all four tabs.
function setup() {
  Object.keys(HEADS).forEach(tab_);
}
