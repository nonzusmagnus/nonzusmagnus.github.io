// Magnus Forever · client project status section
// Usage: <section data-mf-status data-src="/edit-queue/data.json"></section>
//        <script src="/edit-queue/queue.js"></script>
//        <script src="/edit-queue/mf-status.js"></script>
// The client link is any page with this section, plus ?job=<id>
(function () {
  const Q = window.MFQueue;
  const esc = Q.esc;

  function ord(n) {
    const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  }
  const row = (label, value) => `<div><dt>${label}</dt><dd>${value}</dd></div>`;
  const yesNo = v => v ? 'Received' : '<span class="mf-wait">Waiting</span>';

  function render(el, data, job) {
    const s = data.settings || {};
    const sch = Q.schedule(data);
    const q = sch.byId[job.id];
    const idx = Q.STAGES.findIndex(x => x[0] === job.status);
    const hrs = job.feedbackHours || s.feedbackWindowHours || 48;
    const draftNo = (job.revisionRound || 0) + 1;
    const rounds = `${job.revisionRound || 0} of ${job.revisionsIncluded ?? 2} used`;
    const fbText = encodeURIComponent(`Notes on ${job.project} (draft v${draftNo}):\n\n`);
    const wa = s.whatsapp ? `<a class="mf-link" target="_blank" rel="noopener" href="https://wa.me/${esc(String(s.whatsapp).replace(/\D/g, ''))}?text=${fbText}">Send notes on WhatsApp →</a>` : '';
    const mail = s.email ? `<a class="mf-link" href="mailto:${esc(s.email)}?subject=${encodeURIComponent('Notes: ' + job.project)}&body=${fbText}">Email notes →</a>` : '';
    const btn = (href, label) => href ? `<a class="mf-btn" target="_blank" rel="noopener" href="${esc(href)}">${label}</a>` : '';

    let headline = '', body = '', actions = '', dates = '';
    switch (job.status) {
      case 'booked':
        headline = 'You’re booked in.';
        body = 'Your edit slot locks in as soon as the deposit is paid and the footage is with us. Once both are in, this page will show your place in the queue.';
        dates = row('Deposit', yesNo(job.depositPaid)) + row('Footage & assets', yesNo(job.footageReceived));
        break;
      case 'locked':
        headline = q.ahead === 0 ? 'You’re next in line.' : `You’re ${ord(q.position)} in line.`;
        body = q.ahead === 0
          ? `Your edit starts around ${Q.fmt(q.start)}, with a first draft expected around ${Q.fmt(q.end)}.`
          : `There ${q.ahead === 1 ? 'is 1 project' : `are ${q.ahead} projects`} ahead of you. Your edit starts around ${Q.fmt(q.start)}, with a first draft expected around ${Q.fmt(q.end)}.`;
        dates = row('Edit starts', Q.fmt(q.start)) + row('First draft', Q.fmt(q.end)) + (job.deadline ? row('Your deadline', Q.fmt(job.deadline)) : '');
        break;
      case 'editing':
        headline = 'Your project is in the edit.';
        body = `It’s on the timeline now. The first draft is expected around ${Q.fmt(q.end)}.`;
        dates = row('First draft', Q.fmt(q.end)) + (job.deadline ? row('Your deadline', Q.fmt(job.deadline)) : '');
        break;
      case 'draft':
        headline = `Draft ${draftNo} is ready to watch.`;
        body = `Please send your notes within ${hrs} hours${job.feedbackDue ? `, by ${Q.fmtDue(job.feedbackDue)}` : ''}. Timestamps help. If no notes come in by then, the draft counts as approved.`;
        actions = btn(job.draftUrl, 'Watch the draft') + wa + mail;
        dates = row('Draft', `Version ${draftNo}`) + (job.feedbackDue ? row('Notes due', Q.fmtDue(job.feedbackDue)) : '') + row('Revision rounds', rounds);
        break;
      case 'revisions':
        headline = 'We’re working on your notes.';
        body = `Your revised draft is expected around ${Q.fmt(q.end)}.`;
        dates = row('Revised draft', Q.fmt(q.end)) + row('Revision rounds', rounds);
        break;
      case 'final':
        headline = 'Your final cut is approved.';
        body = job.balancePaid ? 'Your full-resolution files are ready to download.' : 'Your full-resolution files will be released as soon as the balance invoice is settled.';
        actions = job.balancePaid ? btn(job.finalUrl, 'Download your files') : '';
        dates = row('Balance', job.balancePaid ? 'Paid' : '<span class="mf-wait">Outstanding</span>');
        break;
      case 'delivered':
        headline = 'Your project is delivered.';
        body = `Thanks for working with ${esc(s.studio || 'us')}.`;
        actions = btn(job.finalUrl, 'Download your files');
        break;
    }

    const lane = Q.QUEUE_STAGES.includes(job.status) && sch.order.length > 1
      ? `<section class="mf-block"><h2>The queue</h2>
          <p>Each bar is a project in the edit queue, sized by how long it takes to cut. Yours is the dark one.</p>
          <div class="mf-lane" aria-hidden="true">${sch.order.map(j => `<i class="${j.id === job.id ? 'mf-me' : ''}" style="flex:${Math.max(1, Q.remainingHours(j))}"></i>`).join('')}</div>
        </section>`
      : '';

    const steps = Q.STAGES.map(([k, l], i) =>
      `<li class="${i < idx ? 'mf-done' : i === idx ? 'mf-now' : ''}">${l}${i === idx ? ' <span>Now</span>' : ''}</li>`).join('');

    el.innerHTML = `
      <header class="mf-head">
        <p class="mf-eyebrow">Project status</p>
        <h1>${esc(job.project)}</h1>
        <p class="mf-sub">${esc(job.client)}${job.deliverables ? ' · ' + esc(job.deliverables) : ''}</p>
      </header>

      <section class="mf-block mf-current">
        <h2>Where it’s at</h2>
        <p class="mf-headline">${headline}</p>
        <p>${body}</p>
        ${actions ? `<p class="mf-actions">${actions}</p>` : ''}
      </section>

      ${job.notes ? `<blockquote class="mf-note"><p>${esc(job.notes)}</p><cite>${esc(s.studio || '')}</cite></blockquote>` : ''}

      ${dates ? `<section class="mf-block"><h2>Key details</h2><dl class="mf-dates">${dates}</dl></section>` : ''}

      ${lane}

      <section class="mf-block"><h2>Progress</h2><ol class="mf-steps">${steps}</ol></section>

      <p class="mf-small">Dates are estimates and update automatically as the queue moves.</p>`;
  }

  async function mount(el) {
    el.classList.add('mf-status');
    const id = new URLSearchParams(location.search).get('job');
    el.innerHTML = '<p class="mf-small">Loading your project…</p>';
    let data;
    try { data = await Q.loadData(el.dataset.src || 'data.json'); }
    catch (e) { el.innerHTML = '<h1>We couldn’t load your project</h1><p>Please try refreshing in a minute.</p>'; return; }
    const job = (data.jobs || []).find(j => j.id === id);
    if (!job) { el.innerHTML = '<h1>Project not found</h1><p>Check the link you were sent, or get in touch and we’ll sort it.</p>'; return; }
    render(el, data, job);
  }

  const start = () => document.querySelectorAll('[data-mf-status]').forEach(mount);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
