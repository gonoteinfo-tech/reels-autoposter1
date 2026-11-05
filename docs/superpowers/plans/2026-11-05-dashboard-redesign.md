# Dashboard Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Deliver the approved light elegant dashboard with usable video cards and corrected actions.
**Architecture:** Preserve Next.js/React and the durable pipeline. Extend authenticated listing queries for search, grouped stages and independent summaries; rebuild the dashboard and scope the light theme to the app shell.
**Tech Stack:** Existing Next.js 16.4.3, React, Tailwind, SQLite, Node tests, Playwright with Chromium.
**Spec:** docs/superpowers/specs/2026-11-05-dashboard-redesign-design.md (approved by user).

## Global Constraints
- Preserve user data, ownership checks and publication/queue guarantees.
- Keep landing page dark; logged-in pages use white surfaces and coral accents.
- Validate with isolated test data, no external provider calls/publications.
- Reuse this isolated cloud checkout; no worktree needed.
- Keep existing dependency declarations and lockfile; browser tooling is already installed.

## Review Focus
- Older records/search and grouped processing stages must remain reachable.
- Refresh errors/auth expiry must be visible and stale requests ignored.
- Manual processing can publish: confirm explicitly; publish only selected enabled destinations.
- Touch/keyboard video and modal close/reopen must work without duplicate submits.
- Long captions, empty results and narrow mobile layout must not overflow.

### Task 1: Dashboard query contract
**Files:** src/services/dashboard.ts (new), src/app/api/reels/route.ts, src/app/api/stats/route.ts, src/types/index.ts, tests/dashboard.test.ts.
**Interfaces:** GET /api/reels preserves stage/page/limit/source_id and adds q and stage_group. GET /api/stats adds stage_counts: Record<ReelStage,number>, recent_published: Reel[], next_reel: Reel|null to existing DashboardStats. Summary data is always independent of listing filters.
- [x] Write failing tests for >50 records, literal search, grouped processing filters, ownership, invalid pagination and independent summaries.
- [x] Implement parameterized queries with deterministic ordering and bounded integer pagination. Use stage_group=processing for downloading/downloaded/processing/processed/uploading/publishing; other groups map to their exact stage.
- [x] Run node --import tsx --test tests/dashboard.test.ts and typecheck integration.

### Task 2: Video cards and dialogs
**Files:** src/components/ReelCard.tsx, AddReelModal.tsx, Modal.tsx (new).
**Interfaces:** ReelCard receives reel, optional onPublish/onReprocess/onDelete callbacks, busy?: boolean. Callbacks are opened/confirmed by DashboardClient. Modal receives title, children, onClose and optional description. Card contains native keyboard/touch-accessible video controls and no hover-only actions.
- [x] Establish browser assertions for playback, unavailable media, dialog Escape/focus, duplicate prevention and stale modal feedback.
- [x] Implement responsive card with 9:16 preview, status, duration, source, caption and real action buttons. No fake thumbnail data.
- [x] Implement shared accessible dialog and reset/cancel AddReelModal lifecycle safely; treat only res.ok && data.success as success.
- [x] Verify using browser interaction tests during Task 4.

### Task 3: Theme, shell and dashboard orchestration
**Files:** src/app/globals.css, src/components/AppShell.tsx, Sidebar.tsx, StatCard.tsx, DashboardClient.tsx.
**Interfaces:** Consume Task 1 summaries and listing pagination; Task 2 callbacks open action dialogs. Preserve existing APIs. Publishing targets are selected from AppSettings enabled targets minus completed destinations.
- [x] Implement light scoped app-shell theme, coherent shared page styling, mobile navigation and summary cards with real counts/loading.
- [x] Build library grid, debounced server search, grouped filter tabs/counts, pagination, loading/error/retry and last-updated state. Abort outdated requests and prevent duplicate pending actions.
- [x] Connect add/update/process/retry/publish/delete/run/review. Confirm consequential actions, explain paused/offline queue, keep per-destination results and errors visible.
- [x] Keep independent pipeline/history/next summaries; keep empty and no-results states distinct.

### Task 4: Validate and review
**Files:** scripts/smoke-dashboard.mjs (new browser integration test), scripts/smoke-http.ts (extend where appropriate).
- [x] Use temporary SQLite and synthetic video to test >50 records, filters/search, pagination, add/close/reopen, play, publish targets, processing confirmation, delete conflicts, failures, mobile navigation and ownership. Keep queue paused; mock any external destinations.
- [x] Capture desktop/mobile screenshots; inspect visuals and fix substantive findings.
- [x] Run npm test, npm run lint, npm run typecheck, npm run build, npm run smoke, browser integration test. Sockets/build/browser require supported sandbox escalation.
- [x] Get independent code review, address substantive feedback, verify final git diff. Leave changes uncommitted for user review.

## Completion evidence

- Query regressions: 10 tests using real temporary SQLite; all 14 existing/new test files pass.
- Browser regression: observed old playback failure and redesigned search/page race before fixes; completed browser smoke passes for playback, historical search, grouped filters, pagination, add/focus/reset, selected and partial publication, preparation, delete 409/retry, batch retry, cycle, reviews, read/auth recovery, stale responses, mobile and navigation.
- Lint, typecheck, production build and existing HTTP smoke passed. Desktop/mobile screenshots inspected; no mobile horizontal overflow.
- Independent review's partial publication and activity truncation findings addressed; all attention jobs loaded by the scheduler can be expanded. Per-reel active/review flags aggregate every owned job, independently of the activity limit.
- Product queue execution rules and dependency declarations unchanged. No user data fixtures, external calls or real publications. Changes left uncommitted.
