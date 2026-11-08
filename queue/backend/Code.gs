/**
 * Magnus Forever edit queue: backend.
 *
 * Paste this into Extensions > Apps Script on your private Google Sheet,
 * then deploy it as a web app (see queue/SETUP.md).
 *
 * The sheet stays private. Clients only ever get back:
 *   - the top 3 reference codes in line (no names), and
 *   - their own job, after the right reference code + password.
 * The full list, the count and the passwords (so you can re-send a login)
 * are only returned with the admin key.
 */

var SHEET_NAME = 'Jobs';
var HEAD = ['ref', 'hash', 'salt', 'business', 'project', 'stage', 'order', 'rush', 'draftDue', 'created', 'updated', 'password'];
var STAGES = ['Booked', 'In queue', 'Editing', 'Draft sent', 'Revisions', 'Final ready', 'Delivered'];
var REF_PREFIX = 'MF-';
var MAX_FAILS = 8;          // wrong passwords allowed per reference code...
var FAIL_WINDOW_S = 900;    // ...in this many seconds (15 min)

function doGet(e) {
  return respond_(handle_((e && e.parameter) || {}));
}

function doPost(e) {
  var req = {};
  try { req = JSON.parse(e.postData.contents); } catch (err) { req = {}; }
  return respond_(handle_(req));
}

function respond_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function handle_(req) {
  try {
    switch (req.action) {
      case 'board': return board_();
      case 'job': return job_(req.ref, req.password);
    }
    if (!isAdmin_(req.adminKey)) return { ok: false, error: 'not_admin' };
    switch (req.action) {
      case 'adminList': return adminList_();
      case 'adminJob': return adminJob_(req.ref);
      case 'add': return withLock_(function () { return add_(req); });
      case 'update': return withLock_(function () { return update_(req); });
      case 'reorder': return withLock_(function () { return reorder_(req.refs); });
      case 'resetPassword': return withLock_(function () { return resetPassword_(req.ref); });
      case 'remove': return withLock_(function () { return remove_(req.ref); });
    }
    return { ok: false, error: 'unknown_action' };
  } catch (err) {
    return { ok: false, error: 'server', message: String(err && err.message || err) };
  }
}

/* ---------- client actions ---------- */

function board_() {
  var line = queue_(readJobs_());
  return {
    ok: true,
    updated: lastUpdated_(),
    top: line.slice(0, 3).map(function (j) { return { ref: j.ref, stage: j.stage, rush: j.rush }; })
  };
}

function job_(ref, password) {
  ref = normRef_(ref);
  if (!ref || !password) return { ok: false, error: 'bad_login' };
  var cache = CacheService.getScriptCache();
  var failKey = 'fail:' + ref;
  var fails = Number(cache.get(failKey) || 0);
  if (fails >= MAX_FAILS) return { ok: false, error: 'locked' };

  var jobs = readJobs_();
  var me = null;
  for (var i = 0; i < jobs.length; i++) if (jobs[i].ref === ref) me = jobs[i];
  if (!me || hash_(String(password), me.salt) !== me.hash) {
    cache.put(failKey, String(fails + 1), FAIL_WINDOW_S);
    return { ok: false, error: 'bad_login' };
  }
  cache.remove(failKey);
  return jobView_(me, jobs);
}

// Lets you open any client's page from the admin page without their password.
function adminJob_(ref) {
  ref = normRef_(ref);
  var jobs = readJobs_();
  for (var i = 0; i < jobs.length; i++) if (jobs[i].ref === ref) return jobView_(jobs[i], jobs);
  return { ok: false, error: 'not_found' };
}

function jobView_(me, jobs) {
  var ref = me.ref;
  var line = queue_(jobs);
  var idx = -1;
  for (var k = 0; k < line.length; k++) if (line[k].ref === ref) idx = k;
  return {
    ok: true,
    updated: lastUpdated_(),
    job: {
      ref: me.ref,
      business: me.business,
      project: me.project,
      stage: me.stage,
      draftDue: me.draftDue,
      rush: me.rush,
      place: idx >= 0 ? idx + 1 : null,
      ahead: idx > 0 ? line.slice(Math.max(0, idx - 2), idx).map(function (j) { return j.ref; }) : [],
      behind: idx >= 0 ? line.slice(idx + 1, idx + 3).map(function (j) { return j.ref; }) : []
    }
  };
}

/* ---------- admin actions ---------- */

function adminList_() {
  var jobs = readJobs_();
  var line = queue_(jobs);
  var placeOf = {};
  line.forEach(function (j, i) { placeOf[j.ref] = i + 1; });
  var others = jobs.filter(function (j) { return !placeOf[j.ref]; })
    .sort(function (a, b) { return a.stage - b.stage || a.order - b.order; });
  return {
    ok: true,
    updated: lastUpdated_(),
    inLine: line.length,
    jobs: line.concat(others).map(function (j) {
      return { ref: j.ref, business: j.business, project: j.project, stage: j.stage, rush: j.rush,
               draftDue: j.draftDue, place: placeOf[j.ref] || null, created: j.created,
               password: j.password || '' };
    })
  };
}

function add_(req) {
  var business = clean_(req.business, 120);
  if (!business) return { ok: false, error: 'business_required' };
  var jobs = readJobs_();
  var taken = {};
  jobs.forEach(function (j) { taken[j.ref] = true; });
  var ref;
  do { ref = REF_PREFIX + randomString_(4, 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'); } while (taken[ref]);
  var password = randomString_(10, 'abcdefghjkmnpqrstuvwxyz23456789');
  var salt = randomString_(16, 'abcdefghijklmnopqrstuvwxyz0123456789');
  var stage = stageNum_(req.stage, 1);
  var order = (stage === 3 || req.rush) ? frontOrder_(jobs) : backOrder_(jobs);
  var now = new Date().toISOString();
  sheet_().appendRow([ref, hash_(password, salt), salt, business, clean_(req.project, 160),
    stage, order, !!req.rush, clean_(req.draftDue, 60), now, now, password]);
  touch_();
  return { ok: true, ref: ref, password: password };
}

function update_(req) {
  var found = findRow_(req.ref);
  if (!found) return { ok: false, error: 'not_found' };
  var f = req.fields || {};
  var j = found.job;
  var jobs = readJobs_();
  var wasInLine = inLine_(j), wasEditing = j.stage === 3, wasRush = j.rush;
  if ('business' in f) j.business = clean_(f.business, 120) || j.business;
  if ('project' in f) j.project = clean_(f.project, 160);
  if ('stage' in f) j.stage = stageNum_(f.stage, j.stage);
  if ('rush' in f) j.rush = !!f.rush;
  if ('draftDue' in f) j.draftDue = clean_(f.draftDue, 60);
  // Starting the edit or marking rush puts a job at the front; joining the line puts it at the back.
  if ((j.stage === 3 && !wasEditing) || (j.rush && !wasRush)) j.order = frontOrder_(jobs);
  else if (inLine_(j) && !wasInLine) j.order = backOrder_(jobs);
  writeJob_(found.row, j);
  touch_();
  return { ok: true };
}

// refs = the reference codes in line, in the order you dragged them.
function reorder_(refs) {
  if (!refs || !refs.length) return { ok: false, error: 'no_refs' };
  var jobs = readJobs_();
  var byRef = {};
  jobs.forEach(function (j) { byRef[j.ref] = j; });
  var n = 0;
  refs.forEach(function (r) {
    var j = byRef[normRef_(r)];
    if (j && inLine_(j)) { n++; if (j.order !== n) { j.order = n; writeJob_(j._row, j); } }
  });
  // Anything in line that wasn't in the list goes after, keeping its order.
  queue_(jobs).forEach(function (j) {
    if (refs.map(normRef_).indexOf(j.ref) < 0) { n++; j.order = n; writeJob_(j._row, j); }
  });
  touch_();
  return { ok: true };
}

function resetPassword_(ref) {
  var found = findRow_(ref);
  if (!found) return { ok: false, error: 'not_found' };
  var password = randomString_(10, 'abcdefghjkmnpqrstuvwxyz23456789');
  found.job.salt = randomString_(16, 'abcdefghijklmnopqrstuvwxyz0123456789');
  found.job.hash = hash_(password, found.job.salt);
  found.job.password = password;
  writeJob_(found.row, found.job);
  return { ok: true, ref: found.job.ref, password: password };
}

function remove_(ref) {
  var found = findRow_(ref);
  if (!found) return { ok: false, error: 'not_found' };
  sheet_().deleteRow(found.row);
  touch_();
  return { ok: true };
}

/* ---------- queue order ---------- */

// In line = stage 2 (In queue) or 3 (Editing), in the order you set by dragging.
function queue_(jobs) {
  return jobs.filter(inLine_).sort(function (a, b) { return a.order - b.order; });
}

function inLine_(j) { return j.stage === 2 || j.stage === 3; }

function frontOrder_(jobs) {
  return jobs.reduce(function (m, j) { return Math.min(m, j.order); }, 1) - 1;
}

function backOrder_(jobs) {
  return jobs.reduce(function (m, j) { return Math.max(m, j.order); }, 0) + 1;
}

/* ---------- sheet helpers ---------- */

function sheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME);
  if (sh.getLastRow() === 0) sh.appendRow(HEAD);
  else if (sh.getRange(1, HEAD.length).getValue() !== HEAD[HEAD.length - 1]) {
    sh.getRange(1, 1, 1, HEAD.length).setValues([HEAD]); // add columns added in later versions
  }
  return sh;
}

function readJobs_() {
  var sh = sheet_();
  var n = sh.getLastRow() - 1;
  if (n <= 0) return [];
  return sh.getRange(2, 1, n, HEAD.length).getValues().map(function (r, i) {
    return {
      _row: i + 2,
      ref: normRef_(r[0]), hash: String(r[1]), salt: String(r[2]),
      business: String(r[3]), project: String(r[4]),
      stage: stageNum_(r[5], 1), order: Number(r[6]) || 0,
      rush: r[7] === true || String(r[7]).toUpperCase() === 'TRUE',
      draftDue: String(r[8] || ''), created: String(r[9] || ''), updated: String(r[10] || ''),
      password: String(r[11] || '')
    };
  }).filter(function (j) { return j.ref; });
}

function writeJob_(row, j) {
  sheet_().getRange(row, 1, 1, HEAD.length).setValues([[j.ref, j.hash, j.salt, j.business, j.project,
    j.stage, j.order, j.rush, j.draftDue, j.created, new Date().toISOString(), j.password || '']]);
}

function findRow_(ref) {
  ref = normRef_(ref);
  var jobs = readJobs_();
  for (var i = 0; i < jobs.length; i++) if (jobs[i].ref === ref) return { row: jobs[i]._row, job: jobs[i] };
  return null;
}

function withLock_(fn) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try { return fn(); } finally { lock.releaseLock(); }
}

/* ---------- small helpers ---------- */

function isAdmin_(key) {
  var real = PropertiesService.getScriptProperties().getProperty('ADMIN_KEY');
  return !!real && real.length >= 8 && String(key || '') === real;
}

function touch_() {
  PropertiesService.getScriptProperties().setProperty('LAST_UPDATED', new Date().toISOString());
}

function lastUpdated_() {
  return PropertiesService.getScriptProperties().getProperty('LAST_UPDATED') || '';
}

function hash_(password, salt) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salt + ':' + password, Utilities.Charset.UTF_8);
  for (var i = 0; i < 300; i++) {
    bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, bytes.concat(Utilities.newBlob(salt).getBytes()));
  }
  return Utilities.base64Encode(bytes);
}

function randomString_(len, alphabet) {
  var out = '';
  while (out.length < len) {
    var hex = Utilities.getUuid().replace(/-/g, '');
    for (var i = 0; i + 1 < hex.length && out.length < len; i += 2) {
      if (i === 12 || i === 16) continue; // UUID version/variant bytes are not random
      var v = parseInt(hex.substr(i, 2), 16);
      if (v < 256 - (256 % alphabet.length)) out += alphabet.charAt(v % alphabet.length);
    }
  }
  return out;
}

function normRef_(ref) {
  return String(ref || '').trim().toUpperCase().replace(/\s+/g, '');
}

function stageNum_(v, fallback) {
  var n = Math.round(Number(v));
  return n >= 1 && n <= STAGES.length ? n : fallback;
}

function clean_(v, max) {
  return String(v == null ? '' : v).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);
}
