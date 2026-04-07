# Party Rate Discussion Portal Frontend (Phase 2)

React + Vite frontend for the internal Party Rate Discussion Portal.  
Backend is expected to be the existing Google Apps Script web app from Phase 1.

## 1) Prerequisites

- Node.js 18+ (recommended LTS)
- npm
- Working Phase 1 GAS backend deployment URL
- Google OAuth client ID (for frontend sign-in)

## 2) Install

```bash
npm install
```

## 3) Environment Setup

Copy `.env.example` to `.env` and fill values:

```bash
cp .env.example .env
```

Required keys:

- `VITE_API_BASE`: GAS Web App URL (`.../exec`)
- `VITE_GOOGLE_CLIENT_ID`: Google Identity client ID
- `VITE_BASE`: app base path

`VITE_BASE` guidance:

- local/dev or root hosting: `/`
- GitHub Pages project repo: `/<repo-name>/`

## 4) Run Locally

```bash
npm run dev
```

## 5) Production Build

```bash
npm run build
```

Output is generated in `dist/`.

## 6) GitHub Pages Build Notes

1. Set `VITE_BASE` to your repo path (example: `/party-rate-portal/`).
2. Run `npm run build`.
3. Publish `dist/` to GitHub Pages (branch/folder strategy per your org standard).
4. Ensure `VITE_API_BASE` points to the deployed GAS web app URL.

## 7) Core User Flows Covered

- app load + backend health check
- bootstrap + party list load
- party select + product search
- rate table with live client-side calculations
- category-level discount propagation
- history + snapshot loading
- snapshot overlay/snapshot-only view
- owner-approved save
- final-action save
- signed-in user email passed in save payload

## 8) Auth Notes

- Google Sign-In is integrated via GIS script loading in `src/utils/googleAuth.js`.
- Frontend decoding is for UX identity display and payload email enrichment.
- Backend remains source of truth and must validate/authorize at save time.

