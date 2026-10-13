# Working on HeatPace

## Purpose and collaboration

HeatPace began as a running hackathon project. Updating the app is also a way
for its owner to learn Codex, skills, plugins, and development workflows.

- Prefer small, reviewable changes with a clear purpose.
- Explain unfamiliar tools when they become relevant, including why they help.
- Before a new substantive task, explain the proposed change and how to check it.
  Once the owner approves the task, complete it without repeatedly seeking approval.
- Pause at meaningful learning points, such as reviewing a diff or choosing an
  approach. Use plain language and connect technical details to the app's behavior.
- Explain what changed, how it was verified, and any remaining limitations.
- Do not turn a focused task into a full rewrite or unrelated cleanup.

## Repository workflow

- Start new work from an up-to-date `main` and use a descriptive task branch.
- Check the working tree before switching branches or editing files. Preserve
  changes made by the owner.
- The `v2` branch is an earlier large refactor. Use it as reference when useful;
  do not merge it wholesale into the incremental work on `main`.
- Keep lasting project guidance here and setup instructions in `README.md`.
  Put task progress and verification results in the chat or pull request.
- Review changes before committing. Commit, push, and merge when requested by
  the owner; opening a pull request does not itself authorize a merge.

## App structure

- `frontend/index.html` and `frontend/css/styles.css`: page and styling.
- `frontend/js/app.js`: form handling, pace prediction, activity loading, and results.
- `frontend/js/heatScore.js`: temperature score and condition labels.
- `frontend/js/chart.js`: Chart.js visualization.
- `frontend/js/mockRuns.js`: sample runs used by demo mode.
- `frontend/js/strava.js`: separate sample-data helper, currently unused by `app.js`.
- `backend/server.js`: Express server, static frontend serving, Strava OAuth,
  activity proxy, and OpenWeather requests.

The app uses plain HTML, CSS, JavaScript, and an Express backend. There is no
frontend build step. Backend JavaScript uses ES modules.

## Local commands and verification

Requires Node.js 18 or newer and npm. Run from the repository root:

```sh
npm run setup
npm start
```

Open `http://localhost:3001`. Set `PORT` to use a different port. Express serves
both the frontend and backend. Stop the server with Ctrl+C.

For a demo check without API credentials:

1. Click **D** in the bottom-right corner and dismiss the demo notification.
2. Enter **8:00** for pace and **80** for temperature, then click **Predict**.
3. Confirm **8:27 /mile** and a chart containing the 11 sample runs.

Demo mode resets on reload. Chart.js loads from a CDN and needs internet access.
This check establishes current behavior, not the accuracy of the prediction.

Check behavior relevant to each change and run `git diff --check`. When changing
startup or dependency installation, verify a fresh install in a temporary copy.
There is no working automated test suite yet; the backend test script is a
placeholder. Do not report tests as passing unless they were actually run.

## Current constraints

- Live frontend requests and OAuth redirects still use the deployed Render and
  Netlify URLs. Local startup does not configure a local Strava authorization flow.
- Historical runs currently receive weather for the present time at their starting
  location. Do not describe that data as historical weather.
- The pace prediction uses a heat-score adjustment; run history affects insights
  and classification rather than the predicted pace.
- Keep installed `node_modules` out of Git. Record dependency changes in package
  manifests and lockfiles, and verify they install reproducibly.
- Run `npm audit --prefix backend` during dependency work rather than relying on
  an old result. Inspect proposed fixes before applying broad upgrades.
- Keep credentials out of source, documentation, screenshots, and logs. Do not
  copy authorization codes or access tokens from URLs into project artifacts.

Update this guidance when the corresponding app behavior or workflow changes.
