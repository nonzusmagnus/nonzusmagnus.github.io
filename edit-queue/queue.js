// Shared queue + scheduling logic. Exposes one global, window.MFQueue, so it won't clash with your site's JS.
(function () {
const STAGES = [
  ['booked', 'Booked'],
  ['locked', 'In queue'],
  ['editing', 'Editing'],
  ['draft', 'Draft sent'],
  ['revisions', 'Revisions'],
  ['final', 'Final ready'],
  ['delivered', 'Delivered'],
];
const STAGE_LABEL = Object.fromEntries(STAGES);
const QUEUE_STAGES = ['locked', 'editing', 'revisions'];

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function iso(d) {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}
function sod(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
function addDay(d) { const x = new Date(d); x.setDate(x.getDate() + 1); return x; }
function parseDate(s) {
  if (!s) return null;
  if (String(s).includes('T')) return new Date(s);
  const [y, m, d] = String(s).split('-').map(Number);
  return new Date(y, m - 1, d);
}
function fmt(d) {
  if (typeof d === 'string') d = parseDate(d);
  return d ? d.toLocaleDateString('en-IE', { weekday: 'short', day: 'numeric', month: 'short' }) : '—';
}

async function loadData(src = 'data.json') {
  const r = await fetch(src + (src.includes('?') ? '&' : '?') + 'v=' + Date.now(), { cache: 'no-store' });
  if (!r.ok) throw new Error('Could not load data.json');
  return r.json();
}

function localDT(d) { return `${iso(d)}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; }
function fmtDue(s) {
  const d = parseDate(s);
  if (!d) return '—';
  const day = fmt(d);
  return String(s).includes('T') ? `${day}, ${d.toLocaleTimeString('en-IE', { hour: '2-digit', minute: '2-digit' })}` : day;
}

// Queue order: rush jobs first, then your manual order, then the date they locked in
function queueOrder(jobs) {
  return (jobs || [])
    .filter(j => QUEUE_STAGES.includes(j.status))
    .sort((a, b) =>
      (b.rush ? 1 : 0) - (a.rush ? 1 : 0) ||
      (a.priority ?? 1e9) - (b.priority ?? 1e9) ||
      (a.lockedDate || '').localeCompare(b.lockedDate || ''));
}

function remainingHours(j) {
  if (j.status === 'revisions') return Number(j.revisionHours || 2);
  return Math.max(0, Number(j.editHours || 0) - Number(j.hoursDone || 0));
}

// Spreads queued edit hours across your working days at your weekly capacity
function schedule(data, today = new Date()) {
  const s = data.settings || {};
  const days = (s.workDays && s.workDays.length) ? s.workDays.map(Number) : [1, 2, 3, 4, 5];
  const perDay = Math.max(0.5, Number(s.weeklyCapacityHours || 20) / days.length);
  const blocked = new Set(s.blockedDates || []);
  const isWork = d => days.includes(d.getDay()) && !blocked.has(iso(d));

  let d = sod(today);
  const sd = parseDate(s.startDate);
  if (sd && sd > d) d = sd;
  let g = 0;
  while (!isWork(d) && g++ < 400) d = addDay(d);
  let left = perDay;
  const next = () => { let n = 0; do { d = addDay(d); } while (!isWork(d) && n++ < 400); left = perDay; };

  const order = queueOrder(data.jobs);
  const byId = {};
  let hoursAhead = 0;
  order.forEach((j, i) => {
    const hours = remainingHours(j);
    let rem = hours;
    if (left <= 1e-9) next();
    const start = new Date(d);
    while (rem > 1e-9) {
      if (left <= 1e-9) next();
      const t = Math.min(left, rem);
      left -= t; rem -= t;
    }
    byId[j.id] = { position: i + 1, total: order.length, ahead: i, hoursAhead, start, end: new Date(d), hours };
    hoursAhead += hours;
  });
  return { order, byId, perDay };
}

// Ready-to-send client update for each stage
function updateMessage(j, q, link, studio) {
  const first = String(j.client || '').split(' ')[0];
  const p = j.project || 'your project';
  switch (j.status) {
    case 'booked': return `Hi ${first}, you're booked in for ${p}. Your edit slot locks once the deposit and footage are in. Track it here: ${link}`;
    case 'locked': return `Hi ${first}, ${p} is #${q ? q.position : '–'} in the edit queue. First draft est. ${q ? fmt(q.end) : 'TBC'}. Live status: ${link}`;
    case 'editing': return `Hi ${first}, ${p} is in the edit now. First draft est. ${q ? fmt(q.end) : 'TBC'}. ${link}`;
    case 'draft': return `Hi ${first}, your draft for ${p} is ready 🎬 Notes within ${j.feedbackHours || 48}h please, by ${fmtDue(j.feedbackDue)}: ${link}`;
    case 'revisions': return `Got your notes. Revised draft for ${p} est. ${q ? fmt(q.end) : 'TBC'}. ${link}`;
    case 'final': return `Hi ${first}, the final cut for ${p} is ready. Files release once the balance is settled. ${link}`;
    case 'delivered': return `Hi ${first}, ${p} is delivered. Your files: ${link} Thanks for working with ${studio || 'us'}.`;
  }
  return link;
}

window.MFQueue = { STAGES, STAGE_LABEL, QUEUE_STAGES, esc, iso, parseDate, fmt, fmtDue, localDT, loadData, queueOrder, remainingHours, schedule, updateMessage };
})();
