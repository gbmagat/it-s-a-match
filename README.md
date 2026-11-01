# It's a Match

A responsive dating-app simulation developed for an academic research study on language, text styles, and perceived desirability.

## Features

- Scripted Filipino and English conversations with multiple-choice replies.
- Three text styles: formal, informal, and colloquial.
- Participant-selected conversation order and resumable browser progress.
- Express API and MySQL storage for participant records and completion tracking.
- Password-protected researcher dashboard with statistics and CSV export.
- Responsive desktop and mobile layouts.

Language selection follows researcher instructions. Style order is chosen by participants; the application does not automatically counterbalance assignments. Research ratings are collected separately.

## Stack

React, Vite, Node.js, Express, MySQL, and Playwright-based checks.

## Local setup

Install a current Node.js LTS release and MySQL 8. Copy `.env.example` to `.env` and configure your own database and administrator passwords.

```sh
npm install
npm run db:setup
npm run server
```

In another terminal:

```sh
npm run dev
```

Open http://localhost:5173. The researcher dashboard is at `/admin`.

For a production build:

```sh
npm run build
npm start
```

## Local verification

An isolated in-memory database adapter is included for development checks. It requires Node.js with `node:module.registerHooks` support. Its password is a public test fixture, never a production credential.

```sh
node --env-file=tools/memory-db/memory.env --import ./tools/memory-db/register.mjs server/index.js
```

With that API and the Vite development server running:

```sh
node tools/flow-test.mjs A http://localhost:5173 1366 650
node tools/flow-test.mjs B http://localhost:5173 390 844
node tools/signup-gone-test.mjs http://localhost:5173
```

Run participant-creation tests locally, not against an active study. The in-memory adapter does not replace integration testing against MySQL.

## Credits and repository scope

The application implements visual designs and conversation scripts supplied by the research team. Source research documents, credentials, deployment-specific scripts, and operational notes are excluded from this repository. Asset-generation tools require the original source documents, which are not distributed here; generated frontend assets are included.

No open-source license is granted by this repository. Research materials and visual assets remain subject to their respective owners' rights.
