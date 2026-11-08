# Magnus Forever edit queue: setup

Two pages live in this folder:

- **Client page:** `https://nonzusmagnus.github.io/queue/`
  This is the link you send clients. They see the top 3 reference codes, then sign in with their reference code and password to see their own timeline and place in line.
- **Your admin page:** `https://nonzusmagnus.github.io/queue/admin.html`
  Here you add clients (it makes their reference code and password), change their stage, set draft dates, mark rush jobs and drag the line into order. Clients see changes within about 20 seconds.

Until step 3 below is done, both pages run in **demo mode** with sample data saved only in your browser. Demo logins: client `MF-7KX2` / `demo-pass`, admin key `demo-admin`.

## One-time setup (about 10 minutes)

The data lives in a private Google Sheet, so it's the same on every device and every day.

1. **Make the sheet.** Go to sheets.google.com and create a blank sheet called `Magnus Forever queue`. Don't share it with anyone.
2. **Add the backend.**
   1. In the sheet, open **Extensions › Apps Script**.
   2. Delete what's in `Code.gs` and paste in everything from `queue/backend/Code.gs`. Save.
   3. Click **Project Settings** (the cog) › **Script properties** › **Add script property**.
      Name: `ADMIN_KEY`. Value: a long password only you know (at least 12 characters). This is what you type on the admin page. Save.
   4. Click **Deploy › New deployment**. Choose type **Web app**.
      - Execute as: **Me**
      - Who has access: **Anyone**
   5. Click **Deploy**, allow the permissions Google asks for, and copy the **Web app URL** (it ends in `/exec`).
3. **Connect the pages.** In `queue/config.js`, paste that URL into `apiUrl`, and put your WhatsApp or email link in `contactUrl`. Push the change (or ask Claude to).
4. Open the admin page, enter your `ADMIN_KEY`, add yourself as a test client, and sign in on the client page with the code and password it gives you.

"Who has access: Anyone" lets the pages reach the script. It does not open the sheet: the script only ever sends back the top 3 codes, or one client's own job when their code and password are right. The full list only comes back with your admin key.

## If you change Code.gs later

Use **Deploy › Manage deployments › Edit (pencil) › Version: New version › Deploy**. This keeps the same URL.

## How the line is ordered

Only jobs at stage 2 (In queue) or 3 (Editing) are in line, in the order you drag them on the admin page. A job jumps to the front when you mark it Rush or move it to Editing, and goes to the back when it joins the line from another stage. You can always drag it somewhere else afterwards. Jobs at other stages (Booked, Draft sent, Revisions, Final ready, Delivered) are out of the line, so a client you're waiting on never holds anyone up.

## Privacy notes

- Clients never see names, or how many jobs there are in total. The board shows 3 codes and then faded placeholder rows.
- Passwords are kept in your private sheet so you can copy a client's login again from the admin page (copy button). Only someone with your admin key can see them. Use the key button to give a client a new password.
- After 8 wrong passwords, that reference code is locked for 15 minutes.
