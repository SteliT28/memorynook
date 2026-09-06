# Memory Nook

A cozy personal memory tool: save notes, then ask questions and it searches
through what you've saved and answers using AI — running on Cloudflare,
password-protected, with no external API key needed (it uses Cloudflare's
own built-in AI).

## What's inside

```
memory-nook/
├── public/
│   └── index.html       ← the whole frontend (one file, no build step)
└── worker/
    ├── src/index.js      ← backend: saves notes, searches them, asks AI, checks the password
    ├── schema.sql         ← database structure for your notes
    └── wrangler.toml      ← Cloudflare configuration
```

## How it works

1. You type a note and hit **Save**. It's stored in a database (D1), and a
   "meaning fingerprint" of it is stored in a search index (Vectorize).
2. You ask a question. The app finds the notes whose fingerprints are most
   similar to your question's meaning, so it can find "that book I wanted
   to read" even if the note said "must read Piranesi this winter."
3. Those matching notes get handed to an AI model (Workers AI, built into
   Cloudflare) along with your question, and it writes an answer based only
   on what you've saved.
4. The whole site is behind a password (a browser login popup) so nobody
   else can see or add to your notes.

You'll need a free [Cloudflare account](https://dash.cloudflare.com/sign-up),
a free [GitHub account](https://github.com/signup), and Node.js installed
on your computer (for the one-time setup step below).

---

## Part 1 — One-time setup: create your Cloudflare resources

Cloudflare's dashboard can auto-deploy from GitHub, but the database, search
index, and password have to be created once via the command line first —
there's no way around this part.

1. **Install the Cloudflare CLI:**
   ```
   npm install -g wrangler
   ```

2. **Log in** (opens a browser tab to connect your account):
   ```
   wrangler login
   ```

3. **Unzip this project**, then move into the worker folder:
   ```
   cd memory-nook/worker
   ```

4. **Create the database:**
   ```
   wrangler d1 create memory-nook-db
   ```
   This prints a `database_id`. Open `wrangler.toml` and replace
   `REPLACE_WITH_YOUR_DATABASE_ID` with it.

5. **Set up the database's table:**
   ```
   wrangler d1 execute memory-nook-db --remote --file=./schema.sql
   ```

6. **Create the search index:**
   ```
   wrangler vectorize create memory-nook-index --dimensions=768 --metric=cosine
   ```

7. **Set your password** (it's stored as a Cloudflare secret, never in the code):
   ```
   wrangler secret put APP_PASSWORD
   ```
   Enter your password when prompted.

That's the whole one-time setup. From here on, deploys happen automatically
whenever you push to GitHub.

---

## Part 2 — Push the project to GitHub

1. On [github.com](https://github.com/new), create a new repository (call it
   `memory-nook`, keep it **Private** if you'd like). Don't add a README,
   .gitignore, or license — leave it empty.

2. Back in your terminal, go to the project's top-level folder (the one
   containing both `public/` and `worker/`):
   ```
   cd ..
   ```
   (if you're still inside `worker/` from Part 1)

3. Turn it into a git repo and make your first commit:
   ```
   git init
   git add .
   git commit -m "Initial commit"
   ```

4. Connect it to the GitHub repo you just made and push (GitHub shows you
   this exact URL on the new repo's page — copy it from there):
   ```
   git branch -M main
   git remote add origin https://github.com/YOUR-USERNAME/memory-nook.git
   git push -u origin main
   ```

Your code is now on GitHub.

---

## Part 3 — Connect Cloudflare to your GitHub repo

1. Go to the [Cloudflare dashboard](https://dash.cloudflare.com) →
   **Workers & Pages** → **Create**.

2. Choose the **Workers** tab, then **Import a repository** (sometimes
   labeled **Connect to Git**).

3. Authorize Cloudflare to access your GitHub account, then select your
   `memory-nook` repository.

4. When asked for the **root directory** (where the Worker code lives),
   enter:
   ```
   worker
   ```

5. Cloudflare reads `wrangler.toml` from that folder automatically — it
   will pick up the D1, Vectorize, and AI bindings you already configured.
   Leave the build command blank (there isn't one).

6. Click **Save and Deploy**.

Cloudflare will build and deploy your site, and give you a URL like
`https://memory-nook.<your-subdomain>.workers.dev` — that's your live app.
Visiting it will prompt for your password before showing anything.

### From now on

Every time you `git push` to the `main` branch, Cloudflare automatically
redeploys the latest version. To make changes:

```
# edit public/index.html or worker/src/index.js
git add .
git commit -m "describe your change"
git push
```

---

## Costs

Cloudflare's free tier covers D1, Vectorize, and Workers AI at generous
limits for personal, single-user use — this should cost \$0/month unless
you use it very heavily.

## Ideas for later

- File/PDF upload instead of just typing notes
- Tags or categories for notes
- A custom domain instead of the `workers.dev` one (free, via Cloudflare)
