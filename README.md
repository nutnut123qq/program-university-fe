# Tedo Frontend - Next.js

Frontend for **Tedo**, a demo site for browsing and comparing university training programs (CTDT) from 17 Vietnamese universities. Next.js 16 (App Router) + React 19 + TypeScript + Tailwind 4 + next-intl (vi/en).

> **Demo mode:** the app runs on a static data snapshot (`public/mock/`, exported from the PostgreSQL database). It does not require the backend to be running. SLM evaluation scores shown in the UI are automated reference scores — not expert-calibrated (Pearson vs expert labels = 0.146).

## Prerequisites

- Node.js 20+
- (Optional) TedoApi backend if running with `NEXT_PUBLIC_USE_MOCK=false`

## Installation

```bash
cd fe
npm install
```

## Configuration

Copy `.env.example` to `.env.local` and adjust:

```bash
NEXT_PUBLIC_API_URL=http://localhost:5100/api
NEXT_PUBLIC_USE_MOCK=true
```

- `NEXT_PUBLIC_USE_MOCK=true` (default for the demo): all data is served from the bundled snapshot in `public/mock/`.
- `NEXT_PUBLIC_USE_MOCK=false`: the app calls the real API at `NEXT_PUBLIC_API_URL`.
- Chat (`/api/chat`) is an experimental snapshot-search assistant; it answers from the mock snapshot. LLM provider keys (`OPENROUTER_API_KEY`, `OPENAI_API_KEY`, ...) are optional server-side upgrades — the demo runs without them.

## Usage

```bash
# Development
npm run dev          # http://localhost:3000

# Production build
npm run build
npm start

# Typecheck
node node_modules/typescript/bin/tsc --noEmit -p .

# E2E (Playwright, set port via E2E_PORT)
E2E_PORT=3100 node node_modules/@playwright/test/cli.js test -c e2e/playwright.local.config.ts
```

## Deploy

The app is a Node-runtime Next.js server (not a pure static export — `/api/chat` needs Node). Works on Vercel or any Node host. For the demo, deploy with `NEXT_PUBLIC_USE_MOCK=true`; no database or backend is needed.
