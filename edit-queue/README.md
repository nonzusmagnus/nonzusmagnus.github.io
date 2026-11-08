# Edit Queue · Magnus Forever

A client-facing edit queue. Each client gets a private link showing their stage, their position in the queue, estimated draft dates, draft review and feedback, and final delivery.

## Files

| File | What it is |
|---|---|
| `index.html` | Example web page with the status section inside a site layout (`index.html?job=<id>`) |
| `mf-status.js` / `mf-status.css` | The drop-in status section for your website |
| `admin.html` | Your dashboard: add and swap clients, move stages, reorder the queue |
| `data.json` | All jobs and settings. This is the only file you update day to day |
| `queue.js` | Shared queue logic (one global: `MFQueue`) |
| `style.css` | Styling for the admin dashboard only |
| `workflow.html` | Pipeline diagram |

## Put it on GitHub (one time)

1. Create a new repo, e.g. `edit-queue`.
2. Upload all the files to the root of the repo.
3. Go to **Settings → Pages → Deploy from branch → main / root**.
4. Your link will be `https://<username>.github.io/edit-queue/`.
   - Client link: `https://<username>.github.io/edit-queue/?job=<id>`
   - Your dashboard: `https://<username>.github.io/edit-queue/admin.html`
5. Optional: add a custom domain such as `status.magnusforever.com` under Settings → Pages.

## Add it to your website

The status section is plain HTML/CSS/JS, so it slots into any page of your site:

1. Copy `queue.js`, `mf-status.js`, `mf-status.css` and `data.json` into a folder on your site, e.g. `/edit-queue/`.
2. Create a page such as `status.html` with your normal header and footer. Where the content goes, paste:

```html
<link rel="stylesheet" href="/edit-queue/mf-status.css">

<section data-mf-status data-src="/edit-queue/data.json"></section>
<script src="/edit-queue/queue.js"></script>
<script src="/edit-queue/mf-status.js"></script>
```

3. Client links then look like `https://magnusforever.com/status.html?job=<id>`. In `admin.html`, the "Link" button builds links from wherever admin.html lives, so keep it in the same folder as your status page, or edit the `link()` function to point at it.

The section's styles are all scoped under `.mf-status`, and it uses your site's font and text colour. To restyle it, override `--mf-muted`, `--mf-line`, `--mf-btn-bg` and `--mf-btn-text`.

## Day-to-day: swapping clients in and out

1. Open `admin.html` and add, edit, advance or delete jobs. Changes save in your browser.
2. Tap **Download data.json**.
3. In the GitHub repo, go to **Add file → Upload files**, drop in the new `data.json`, and commit.
4. Every client link updates in about a minute.

## How the queue works

- Jobs count toward the queue when they're **In queue**, **Editing** or **Revisions**.
- The order is rush jobs first, then your manual ↑↓ order, then lock-in date.
- ETAs spread the remaining edit hours over your edit days at your weekly capacity, skipping blocked days such as shoot days.
- When a draft goes out, the client gets a **24h or 48h notes window** (set per job, default in Settings). No notes by the deadline counts as approved.
- **Draft sent** pauses the job, so waiting on a client never holds the queue up.
- Moving a job from Draft to Revisions counts a revision round. You get a warning when it passes the included rounds.

## Privacy note

GitHub Pages is public. Anyone with a job link sees only their own project, but `data.json` itself can be read by anyone who finds its URL. Keep it to project names and links: no prices, phone numbers or private notes. Job IDs are random, so links can't be guessed. If you later want full privacy, the next step is to move the data to Supabase with a login.
