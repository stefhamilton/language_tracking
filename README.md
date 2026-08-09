# Hiligaynon SLA Mastery Dashboard

A personal Ilonggo/Hiligaynon language-tracking dashboard: flashcards, a
production-latency drill, and a plan/stage tracker — all backed by a Google
Sheet, with a "Copy Session Context" button that hands an AI assistant a
snapshot of your current progress so it always knows what you're working on.

- **Frontend**: static HTML/JS ([index.html](index.html), [app.js](app.js)), hosted on GitHub Pages.
- **Backend**: a Google Apps Script Web App bound to your Sheet ([apps-script/Code.gs](apps-script/Code.gs)) — no server to host or maintain.

## 1. Create the Google Sheet + Apps Script

1. Create a new Google Sheet (any name, e.g. "Hiligaynon Tracker").
2. In the Sheet, go to **Extensions > Apps Script**.
3. Delete the placeholder code and paste in the contents of [apps-script/Code.gs](apps-script/Code.gs).
4. In the function dropdown at the top, select `seedData`, then click **Run**.
   - First run will prompt you to authorize the script — approve it.
   - This creates three tabs (`Vocab`, `Log`, `Stages`) and populates your
     starter vocab and stage plan.
5. Click **Deploy > New deployment**.
   - Type: **Web app**
   - Execute as: **Me**
   - Who has access: **Anyone with the link**
   - Click **Deploy**, then copy the Web App URL (ends in `/exec`).

## 2. Run the app locally (optional)

```bash
python3 -m http.server 8080
```

Open `http://localhost:8080`, paste your Web App URL into the Settings panel,
and click **Save & Connect**.

## 3. Deploy to GitHub Pages

1. Push this repo to GitHub (already at `stefhamilton/language_tracking`).
2. In the repo, go to **Settings > Pages**.
3. Under "Build and deployment", set Source to **Deploy from a branch**,
   branch `main`, folder `/ (root)`.
4. Your app will be live at `https://stefhamilton.github.io/language_tracking/`.

The Apps Script URL is stored in your browser's `localStorage`, not in the
repo, so it's safe to keep the site public — you (or anyone) just paste in
their own Web App URL to connect it to their own Sheet.

## Data model

| Sheet    | Columns |
|----------|---------|
| `Vocab`  | `eng`, `hil`, `cat`, `mastered`, `timesCorrect`, `timesMissed`, `lastReviewed` |
| `Log`    | `timestamp`, `type` (`drill`/`field`), `detail`, `latencySeconds` |
| `Stages` | `id`, `name`, `focus`, `status` (`Not Started` / `In Progress` / `Done`) |

Edit these sheets directly in Google Sheets any time — e.g. add new vocab
rows, or update a stage's `status` to `In Progress` when you move on.
