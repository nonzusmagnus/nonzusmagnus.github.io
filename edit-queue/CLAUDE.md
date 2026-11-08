# Edit Queue · Magnus Forever

Client-facing edit queue for Magnus Forever. Plain HTML/CSS/JS with no build step, served by GitHub Pages at `/edit-queue/`.

## How it fits together
- `data.json` is the only data source: `settings` (capacity, edit days, blocked days, notes window, contact) and `jobs`.
- `queue.js` holds the shared logic and exposes one global, `window.MFQueue` (stages, queue order, ETA scheduling, date formatting, WhatsApp update text).
- `mf-status.js` + `mf-status.css` are the client status section. They mount on any `[data-mf-status]` element, read `?job=<id>` from the URL, and are scoped under `.mf-status` so they can drop into any page of the site.
- `index.html` is an example page with the section inside a basic site header and footer.
- `admin.html` + `style.css` are the owner dashboard. Edits save to localStorage, and "Download data.json" exports them for upload.
- `workflow.html` is the pipeline diagram.

## Rules
- Stages: booked → locked (in queue) → editing → draft → revisions ↺ → final → delivered.
- Only locked, editing and revisions count toward the queue. Rush first, then manual `priority`, then `lockedDate`.
- Notes window is 24h or 48h per job (`feedbackHours`), and `feedbackDue` is a local datetime (`YYYY-MM-DDTHH:MM`).
- data.json is public on GitHub Pages: never put prices, phone numbers or private notes in it.
- Style: minimal and highly readable, black/white, Inter, works in light and dark mode and at phone width.
- Copy tone: casual, direct, short.

## Testing
Run `python3 -m http.server` from this folder and open `index.html?job=northside-coffee-m3p9zd` and `admin.html`. The sample jobs in data.json are placeholders.
