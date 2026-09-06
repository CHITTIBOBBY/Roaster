# Roaster — Shift Scheduler

Minimal Vite + React + TypeScript app that uses a greedy equity scheduler.

Prerequisites:
- Node.js 18+ / npm 9+
- Git

Install & run locally:
1. npm install
2. If npm prompts about scripts: review package.json and then run:
   npm approve-scripts --allow-scripts-pending
   (or approve only this package)
3. npm run dev
4. Open http://localhost:5173

Build:
- npm run build

Deploy:
- Push to GitHub and connect the repo on Vercel (recommended) — Vercel auto-detects Vite projects and will build with `npm run build`.
- Or use Netlify with the build command `npm run build` and publish directory `dist`.
- GitHub Pages: build locally (npm run build) and deploy the contents of dist to GitHub Pages (requires an extra deploy action or gh-pages package).

Notes:
- The scheduling engine is at src/scheduler/scheduler.ts — it's a single-file TypeScript module implementing the greedy equity algorithm. You can reuse it in other projects.
- Schedules are stored in localStorage (key `latestSchedule`). People are stored under `roaster_people`.

To let me commit these files into CHITTIBOBBY/Roaster, tell me and I’ll push them into the repo for you (I will create short commits and list the changes).
