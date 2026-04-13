# FirstStepStudy — Flashcards Platform

A full-stack flashcard study platform built for individual learners and classrooms. Combines spaced repetition, AI-assisted grading, PDF import, and classroom management into a single cohesive learning tool.

**Live:** [firststepstudy.vercel.app](https://firststepstudy.com) &nbsp;|&nbsp; **Backend:** Railway

---

## Table of Contents

- [Overview](#overview)
- [Tech Stack](#tech-stack)
- [Features](#features)
  - [Spaced Repetition System](#1-spaced-repetition-system)
  - [AI Grading](#2-ai-grading)
  - [PDF to Flashcards](#3-pdf-to-flashcards)
  - [Analytics](#4-analytics)
  - [Classroom System](#5-classroom-system)
  - [Performance & Cost Optimizations](#6-performance--cost-optimizations)
- [Architecture](#architecture)
- [Security](#security)
- [Running Locally](#running-locally)
- [Challenges & Learnings](#challenges--learnings)
- [Future Work](#future-work)

---

## Overview

FirstStepStudy is designed around the insight that most flashcard apps treat all cards the same. This platform uses a **staged recall model** — cards progress through Learn → Recall → Memorized stages based on user performance, and never clutter the session with cards the student already knows.

It also extends flashcard studying to classrooms: teachers can create classes, share decks, and track per-student progress. AI grading handles open-ended answers without requiring exact phrasing.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Vanilla JavaScript (ES Modules), HTML, CSS |
| Backend | Node.js (AI proxy server) |
| Database | Supabase (PostgreSQL) |
| Auth | Supabase Auth (email/password + Google OAuth) |
| AI | Anthropic Claude API |
| Frontend Deploy | Vercel |
| Backend Deploy | Railway |

No bundler. No frontend framework. The entire client is plain ES modules served statically — keeping the stack minimal and load times fast.

---

## Features

### 1. Spaced Repetition System

Cards move through three explicit stages:

- **Learn** — new or failed cards, reviewed every session
- **Recall** — cards the user got right once; reviewed less frequently
- **Memorized** — cards consistently answered correctly; excluded from normal rotation

This eliminates the common problem of over-reviewing known material. Sessions focus attention where it's actually needed.

**Large Deck Mode:** For decks with many cards, the system maintains a rotating active subset rather than flooding the session. A backlog queue cycles unseen cards into the active set as cards are mastered, ensuring full coverage over time without session overload.

---

### 2. AI Grading

Open-ended flashcard answers are graded by Claude via a secure proxy server. The grading system distinguishes between two modes:

- **Exact match** — used for cards where precise wording matters (dates, definitions, formulas)
- **Concept match** — used for open-ended answers; the AI evaluates whether the core idea is correct regardless of phrasing

**Proxy Architecture:** The frontend never touches the Anthropic API directly. All AI requests flow through a Node.js proxy server deployed on Railway, which:
- Injects the API key server-side
- Enforces per-request rate limits
- Validates and sanitizes payloads before forwarding

**Tagged response format:** Early versions parsed AI responses as JSON, which failed unpredictably when the model inserted commentary or formatting. The system was rewritten to use a tagged format (`<grade>correct</grade><explanation>...</explanation>`), which is far more robust to extraction and eliminates a class of runtime errors entirely.

---

### 3. PDF to Flashcards

Users can upload a PDF and automatically generate a flashcard deck from it.

**Pipeline:**
1. PDF is parsed client-side using a JavaScript PDF library — no file upload to a server
2. Raw extracted text is cleaned with heuristics: page numbers, running headers, short orphaned lines, and repeated footers are stripped
3. Cleaned text is chunked and sent to the AI proxy, which returns structured flashcard pairs
4. Cards are inserted directly into the user's deck

Keeping PDF parsing client-side avoids upload latency, eliminates a storage concern, and keeps the backend stateless.

---

### 4. Analytics

Every study session is tracked with card-level granularity.

**What's recorded per session:**
- Session start/end timestamps and duration
- Total answers submitted, correct, and incorrect
- Stage distribution (how many cards were in Learn / Recall / Memorized)
- Per-card accuracy history

**Aggregate tracking:** A separate `analytics_aggregates` table maintains running totals per user per deck, avoiding expensive full-table scans for dashboard queries.

**Classroom analytics:** Teachers see per-student breakdowns across shared decks — which students are actively studying, accuracy rates, and last-studied timestamps.

---

### 5. Classroom System

**Teacher flow:**
- Create a class with an optional allowed-domain restriction (e.g., restrict enrollment to `@school.edu` addresses)
- Invite students by email
- Share decks with a class — a snapshot of the deck is stored at share time, so teacher edits don't disrupt students mid-study
- Award badges to students for milestones or achievements

**Student flow:**
- Students see shared decks in their dashboard automatically after enrollment
- Progress on shared decks is tracked independently per student in `shared_deck_progress`
- Badges are visible on the student's profile

**Badge system:** Teachers can assign up to two badges per student per class. Badges are stored on the class record and rendered in the student view.

---

### 6. Performance & Cost Optimizations

AI API calls are the primary cost driver. Several optimizations keep usage in check:

- **Response caching:** Grading results for identical (card, answer) pairs are cached client-side. Re-submissions don't hit the API.
- **Input normalization:** Answers are lowercased and whitespace-collapsed before cache lookup, improving hit rates without compromising correctness.
- **Eliminated retry loops:** Early versions retried failed AI calls automatically, which multiplied costs during outages. Failures now surface immediately to the user rather than retrying silently.
- **Exact-match short-circuit:** If the user's answer matches the expected answer exactly (post-normalization), the AI is never called. Grading is instant and free.

---

## Architecture

```
┌─────────────────────────────────────────┐
│              Browser (Client)           │
│  Vanilla JS ES Modules — no bundler     │
└──────────┬──────────────────┬───────────┘
           │                  │
    AI requests          All data ops
           │                  │
           ▼                  ▼
┌──────────────────┐  ┌───────────────────┐
│  Node.js Proxy   │  │     Supabase      │
│  (Railway)       │  │  PostgreSQL + RLS │
│                  │  │  + Auth           │
│  - Injects API   │  │                   │
│    key           │  │  - Decks          │
│  - Rate limits   │  │  - Classes        │
│  - Sanitizes     │  │  - Analytics      │
│    payloads      │  │  - User profiles  │
└──────────┬───────┘  └───────────────────┘
           │
           ▼
┌──────────────────┐
│  Anthropic API   │
│  (Claude)        │
└──────────────────┘
```

**State abstraction:** The data layer uses a store interface (`src/data/store/index.js`) that routes all calls to Supabase. The interface was originally designed to support both localStorage and Supabase behind the same API, which made the migration from local-only to cloud storage incremental and low-risk.

---

## Security

**API key isolation:** The Anthropic API key exists only on the Railway proxy server. The frontend has no credentials for the AI API — it sends requests to the proxy, which authenticates them server-side.

**Supabase Row Level Security:** Every table in the database has RLS policies enforced at the database layer. Users can only read and write their own records regardless of what the client sends. Teachers can only access classes and shared decks they own.

**Auth-based data isolation:** All queries are scoped to the authenticated user's ID. Supabase Auth tokens are validated on every request — there is no client-side trust.

**Email-scoped enrollment:** Student enrollment uses email addresses as identifiers. Students must register with the same email their teacher entered, preventing unauthorized class access.

---

## Running Locally

### Prerequisites

- Node.js 18+
- A Supabase project (free tier works)
- An Anthropic API key

### Frontend

```bash
# Clone the repo
git clone https://github.com/your-username/flashcard-platform.git
cd flashcard-platform

# Install a simple static server
npm install

# Create config (gitignored)
cp src/config.example.js src/config.js
# Fill in your supabaseUrl, supabaseAnonKey, aiProxyUrl, and ANTHROPIC_API_KEY

# Serve the frontend
npx http-server . -p 8080
```

### Backend (AI Proxy)

```bash
cd proxy  # or wherever your proxy server lives
npm install

# Set environment variables
export ANTHROPIC_API_KEY=your_key_here
export ALLOWED_ORIGIN=http://localhost:8080

node server.js
```

### Environment Variables

| Variable | Where | Description |
|---|---|---|
| `ANTHROPIC_API_KEY` | Proxy server | Anthropic API key |
| `ALLOWED_ORIGIN` | Proxy server | CORS origin whitelist |
| `supabaseUrl` | `src/config.js` | Supabase project URL |
| `supabaseAnonKey` | `src/config.js` | Supabase anon key |
| `aiProxyUrl` | `src/config.js` | URL of the proxy server |

### Supabase Setup

Run the SQL schema files in your Supabase SQL editor to create the required tables and RLS policies. Schema files are in `/supabase/`.

---

## Challenges & Learnings

**Unreliable AI JSON parsing → tagged format**
The initial design had the AI return JSON for grading results. Under load, the model occasionally wrapped responses in markdown fences or added a preamble sentence, breaking `JSON.parse()`. Switching to a tagged format (`<grade>...</grade>`) made extraction trivial with a regex and eliminated an entire category of runtime failures.

**Cost control without degrading UX**
Open-ended grading via API is expensive at scale. The solution wasn't to remove AI grading but to be precise about when it runs: exact-match short-circuiting, client-side caching, and eliminating silent retries collectively cut API calls significantly without touching the user-facing experience.

**Async state consistency with Supabase**
Migrating from synchronous localStorage to async Supabase calls exposed several places where state was read immediately after a write, before the async operation completed. Auditing every write path to ensure callers properly `await` results — and where necessary, refetching state rather than optimistically mutating it — was the most tedious part of the migration and the most important for correctness.

**Designing for learning, not just UI**
The hardest product decision was the staged recall system. A simpler implementation would randomize all cards equally. The staged system requires tracking more state and makes the session logic more complex — but it's the difference between an app that feels right and one that doesn't. Getting the UX to feel natural (not mechanical) while enforcing the learning model required more iteration than any technical problem.

---

## Future Work

- **At-risk student detection** — surface students who haven't studied in N days or whose accuracy is declining, with teacher alerts
- **Study reminders** — scheduled push/email reminders tied to each user's study cadence
- **Improved analytics dashboards** — visual charts for accuracy over time, stage progression curves, and deck completion rates
- **Collaborative deck creation** — allow multiple teachers to co-edit a shared deck
- **Adaptive difficulty** — weight card selection by historical accuracy per card, not just current stage

