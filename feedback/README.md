# Tester feedback page

A single self-contained page you can send to your ten testers. No build step, no
server, no API — one `index.html` with inline CSS and ~60 lines of JavaScript.

**File:** [`index.html`](index.html)

It asks seven quick 1–5 ratings mapped to the real product surface (map,
search, company panel, AI assistant, tracker, sign-in, overall), three written
questions, and optionally who they are. It is `noindex`, so it stays out of
search engines.

---

## 1. Configure it (2 minutes)

Open `index.html` and edit the `CONFIG` block near the top of the `<script>`:

```js
const CONFIG = {
  endpoint: "",                                    // ← paste a Formspree URL here
  fallbackEmail: "feedback@decodingjobs.app",      // ← change to an inbox you read
  appUrl: "",                                      // ← the build you want testers to use
};
```

| Setting | What it does |
| --- | --- |
| `endpoint` | Where submissions are POSTed. **Recommended.** Leave empty only if you accept the mailto fallback. |
| `fallbackEmail` | Used when `endpoint` is empty, or when a submission fails. Opens the tester's mail client with the answers pre-filled. **Change this — the default is a placeholder.** |
| `appUrl` | When set, shows an "Open the app →" button in the header so testers can jump straight to what they're testing. |

### Getting an `endpoint` (Formspree, free)

1. Sign up at <https://formspree.io> (Google login is fine).
2. **New form** → name it e.g. `Decoding Jobs testers` → set the notification email.
3. Copy the endpoint, which looks like `https://formspree.io/f/abcdwxyz`.
4. Paste it into `CONFIG.endpoint` and redeploy.

The free tier allows 50 submissions a month — enough for ten testers. Because the
page submits with `fetch`, the tester never leaves the page and never sees
Formspree branding; they just get the in-page thank-you.

**Alternatives that also work as a POST endpoint:** Airtable forms, Getform,
Basin, Cloudflare Workers, or a Google Apps Script web app writing to a Sheet.

---

## 2. Deploy it (pick one)

### Option A — Netlify Drop (fastest: no account set-up, no CLI, ~1 minute)

1. Go to <https://app.netlify.com/drop>.
2. Drag the **`feedback` folder** onto the page.
3. You get a URL like `https://spiffy-otter-1a2b3c.netlify.app` — send that.

Free, no Git required. To update later, re-drag the folder (or claim the site and
use the Netlify CLI).

### Option B — Vercel CLI

```bash
cd DECODING-JOBS/feedback
npx vercel --prod
```

Accept the defaults; it detects a static site. You get
`https://feedback-<hash>.vercel.app`. Vercel is also the natural home for the
Next.js app itself (see §4).

### Option C — Cloudflare Pages

```bash
cd DECODING-JOBS/feedback
npx wrangler pages deploy . --project-name dj-feedback
```

### Option D — Just test it locally first

```bash
cd DECODING-JOBS/feedback
npx serve .          # or: python -m http.server 5000
```

Anyone on your Wi-Fi can open `http://<your-lan-ip>:5000`. For remote testers
without deploying, tunnel it with `npx localtunnel --port 5000` or
`cloudflared tunnel --url http://localhost:5000` — but the link only lives as
long as your machine is on, so prefer A or B for real user testing.

---

## 3. Send it to the ten testers

Attribution matters more than you think when ten people submit. The page reads a
`?tester=` query parameter and silently tags the submission, so give each person
their own link:

```
https://your-url.example/?tester=priya
https://your-url.example/?tester=arjun
...
```

That shows up as a `tester` field in the payload and in the mailto body.

**Suggested message:**

> Hey — you're one of ten people testing Decoding Jobs before anyone else.
> Spend ten minutes poking at it, then fill this in: <link>. Be blunt; the
> annoying parts are the useful ones.

---

## 4. Deploying the app itself (the thing they're testing)

The feedback page is standalone and needs nothing, but testers can only test the
product if the product is reachable. Today `apps/web` runs at
`http://localhost:3333` and needs `NEXT_PUBLIC_API_URL` pointing at the core API
on `:8000`. Neither is hosted.

The full runbook — Vercel for the frontend, Render's free tier for the API, and a
free Neon PostGIS database, all for $0 — lives in
[**DEPLOY.md**](../DEPLOY.md) at the repo root. It covers the three things that
actually bite: the database ships empty until you copy your data into it, the
free API sleeps after 15 idle minutes unless you keep it warm, and
`NEXT_PUBLIC_API_URL` is baked in at build time so changing it needs a redeploy.

If you'd rather not deploy at all yet, testing in person or over a screen share
and using the hosted feedback page only to collect the write-ups is a perfectly
reasonable first pass.

---

## 5. Reading the results

With Formspree you get an email per submission and a dashboard listing all of
them; export to CSV from there. A quick way to make the numbers useful: average
each rating across testers (ignore blanks — those mean "never got to it", which
is itself a signal), then read the **"what confused you"** answers together. If
two or more people name the same thing, that is your next fix.

---

## Notes

- If you later want this inside the Next.js app instead, move it to
  `apps/web/public/feedback.html` — it will be served at `/feedback.html` and
  deploy with the app. Nothing else needs to change.
- To point it at a hosted app after you deploy one, set `CONFIG.appUrl`.
- The page passes a quick manual check: keyboard focus is visible on every
  control, the required question blocks submission and moves focus to itself, and
  a failed submission gracefully falls back to the mailto path.
