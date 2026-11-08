// Shared code for the client page and the admin page.
// Talks to the Apps Script backend, or to a local demo store when no apiUrl is set.
(function () {
  var cfg = window.MFQ_CONFIG || {};
  var params = new URLSearchParams(location.search);
  var demo = !cfg.apiUrl || params.has('demo');

  var STAGES = ['Booked', 'In queue', 'Editing', 'Draft sent', 'Revisions', 'Final ready', 'Delivered'];
  var WAIT = ['Waiting on deposit and footage', 'Waiting in line', 'Being edited', 'Waiting on your notes',
    'Applying your notes', 'Waiting on balance', 'Delivered'];
  var DESC = [
    'Deposit paid and footage received.',
    'Waiting for your turn in the edit queue.',
    'Your edit is being cut now.',
    'Watch the draft and send your notes.',
    'Notes applied, then a new draft. 2 rounds included.',
    'Approved. Pay the balance to release your files.',
    'Files released and the job is closed.'
  ];

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function ordinal(n) {
    var s = ['th', 'st', 'nd', 'rd'], v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  }

  function isoDate(v) { return /^\d{4}-\d{2}-\d{2}$/.test(String(v || '')); }

  // "2026-11-14" -> "Fri 14 Nov"; anything else is shown as typed.
  function fmtDate(v) {
    if (!isoDate(v)) return String(v || '');
    var d = new Date(v + 'T12:00:00');
    var opts = { weekday: 'short', day: 'numeric', month: 'short' };
    if (d.getFullYear() !== new Date().getFullYear()) opts.year = 'numeric';
    return d.toLocaleDateString('en-GB', opts).replace(',', '');
  }

  function timeAgo(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d)) return '';
    return d.toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  }

  async function call(req) {
    if (demo) return Demo.handle(JSON.parse(JSON.stringify(req)));
    var res = await fetch(cfg.apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(req),
      redirect: 'follow'
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.json();
  }

  /* ---------- demo store: same rules as backend/Code.gs, kept in this browser ---------- */
  var Demo = (function () {
    var KEY = 'mfq-demo-v2';
    var ADMIN = 'demo-admin';
    function seed() {
      var now = new Date().toISOString();
      var soon = new Date(Date.now() + 6 * 864e5).toISOString().slice(0, 10);
      var j = function (ref, business, project, stage, order, rush, password) {
        return { ref: ref, business: business, project: project, stage: stage, order: order, rush: !!rush,
          draftDue: stage <= 3 ? soon : '', password: password || 'demo', created: now };
      };
      return { updated: now, jobs: [
        j('MF-4HQ9', 'Sample Barbers', 'Launch reel', 3, 1),
        j('MF-T7WC', 'Sample Bakery', 'Menu promo', 2, 2, true),
        j('MF-7KX2', 'Test Business', 'Brand film', 2, 3, false, 'demo-pass'),
        j('MF-P3ND', 'Sample Gym', 'Class teaser', 2, 4),
        j('MF-9RVE', 'Sample Salon', 'Opening day', 2, 5),
        j('MF-CJ6M', 'Sample Cafe', 'Socials pack', 4, 6),
        j('MF-2ZKB', 'Sample Studio', 'Event recap', 7, 7)
      ] };
    }
    function load() {
      try { var s = JSON.parse(localStorage.getItem(KEY)); if (s && s.jobs) return s; } catch (e) {}
      // Carry over demo data saved by the first version, keeping the line in the order it showed.
      try {
        var old = JSON.parse(localStorage.getItem('mfq-demo-v1'));
        if (old && old.jobs) {
          old.jobs.slice().sort(function (a, b) {
            return (b.stage === 3) - (a.stage === 3) || (b.rush ? 1 : 0) - (a.rush ? 1 : 0) || a.order - b.order;
          }).forEach(function (j, i) { j.order = i + 1; });
          save(old, true); return old;
        }
      } catch (e) {}
      var s2 = seed(); save(s2, true); return s2;
    }
    function save(s, quiet) {
      if (!quiet) s.updated = new Date().toISOString();
      try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) {}
    }
    function queue(jobs) {
      return jobs.filter(inLine).sort(function (a, b) { return a.order - b.order; });
    }
    function inLine(j) { return j.stage === 2 || j.stage === 3; }
    function front(jobs) { return jobs.reduce(function (m, j) { return Math.min(m, j.order); }, 1) - 1; }
    function back(jobs) { return jobs.reduce(function (m, j) { return Math.max(m, j.order); }, 0) + 1; }
    function rand(n, abc) {
      var a = new Uint8Array(n * 2), out = '';
      crypto.getRandomValues(a);
      for (var i = 0; i < a.length && out.length < n; i++) out += abc[a[i] % abc.length];
      return out;
    }
    function norm(r) { return String(r || '').trim().toUpperCase().replace(/\s+/g, ''); }
    function handle(req) {
      var s = load();
      var line = queue(s.jobs);
      if (req.action === 'board') {
        return { ok: true, updated: s.updated, top: line.slice(0, 3).map(function (j) { return { ref: j.ref, stage: j.stage, rush: j.rush }; }) };
      }
      function view(me) {
        var idx = line.indexOf(me);
        return { ok: true, updated: s.updated, job: {
          ref: me.ref, business: me.business, project: me.project, stage: me.stage, draftDue: me.draftDue, rush: me.rush,
          place: idx >= 0 ? idx + 1 : null,
          ahead: idx > 0 ? line.slice(Math.max(0, idx - 2), idx).map(function (j) { return j.ref; }) : [],
          behind: idx >= 0 ? line.slice(idx + 1, idx + 3).map(function (j) { return j.ref; }) : []
        } };
      }
      if (req.action === 'job') {
        var me = s.jobs.find(function (j) { return j.ref === norm(req.ref) && j.password === req.password; });
        return me ? view(me) : { ok: false, error: 'bad_login' };
      }
      if (req.adminKey !== ADMIN) return { ok: false, error: 'not_admin' };
      var find = function (ref) { return s.jobs.find(function (j) { return j.ref === norm(ref); }); };
      if (req.action === 'adminJob') { var aj = find(req.ref); return aj ? view(aj) : { ok: false, error: 'not_found' }; }
      switch (req.action) {
        case 'adminList':
          var place = {};
          line.forEach(function (j, i) { place[j.ref] = i + 1; });
          var others = s.jobs.filter(function (j) { return !place[j.ref]; }).sort(function (a, b) { return a.stage - b.stage || a.order - b.order; });
          return { ok: true, updated: s.updated, inLine: line.length, jobs: line.concat(others).map(function (j) {
            return { ref: j.ref, business: j.business, project: j.project, stage: j.stage, rush: j.rush, draftDue: j.draftDue, place: place[j.ref] || null, created: j.created, password: j.password || '' };
          }) };
        case 'add':
          if (!String(req.business || '').trim()) return { ok: false, error: 'business_required' };
          var ref;
          do { ref = 'MF-' + rand(4, 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'); } while (find(ref));
          var pw = rand(10, 'abcdefghjkmnpqrstuvwxyz23456789');
          var st = Number(req.stage) || 1;
          s.jobs.push({ ref: ref, business: String(req.business).trim(), project: String(req.project || '').trim(),
            stage: st, order: (st === 3 || req.rush) ? front(s.jobs) : back(s.jobs), rush: !!req.rush, draftDue: String(req.draftDue || '').trim(),
            password: pw, created: new Date().toISOString() });
          save(s);
          return { ok: true, ref: ref, password: pw };
        case 'update':
          var j = find(req.ref);
          if (!j) return { ok: false, error: 'not_found' };
          var f = req.fields || {};
          var wasIn = inLine(j), wasEd = j.stage === 3, wasRush = j.rush;
          if ('business' in f && String(f.business).trim()) j.business = String(f.business).trim();
          if ('project' in f) j.project = String(f.project).trim();
          if ('stage' in f) j.stage = Math.min(7, Math.max(1, Number(f.stage) || j.stage));
          if ('rush' in f) j.rush = !!f.rush;
          if ('draftDue' in f) j.draftDue = String(f.draftDue).trim();
          if ((j.stage === 3 && !wasEd) || (j.rush && !wasRush)) j.order = front(s.jobs);
          else if (inLine(j) && !wasIn) j.order = back(s.jobs);
          save(s);
          return { ok: true };
        case 'reorder':
          var refs = (req.refs || []).map(norm), n = 0;
          refs.forEach(function (r) { var x = find(r); if (x && inLine(x)) x.order = ++n; });
          line.forEach(function (x) { if (refs.indexOf(x.ref) < 0) x.order = ++n; });
          save(s);
          return { ok: true };
        case 'resetPassword':
          var r = find(req.ref);
          if (!r) return { ok: false, error: 'not_found' };
          r.password = rand(10, 'abcdefghjkmnpqrstuvwxyz23456789');
          save(s, true);
          return { ok: true, ref: r.ref, password: r.password };
        case 'remove':
          s.jobs = s.jobs.filter(function (x) { return x.ref !== norm(req.ref); });
          save(s);
          return { ok: true };
      }
      return { ok: false, error: 'unknown_action' };
    }
    return { handle: handle, KEY: KEY };
  })();

  window.MFQ = {
    call: call, demo: demo, cfg: cfg, STAGES: STAGES, WAIT: WAIT, DESC: DESC,
    esc: esc, ordinal: ordinal, timeAgo: timeAgo, isoDate: isoDate, fmtDate: fmtDate, demoKey: Demo.KEY
  };
})();
