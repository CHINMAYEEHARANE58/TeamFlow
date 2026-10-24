# TeamFlow production-readiness review — 24 October 2026

**Decision: not yet production-ready for sensitive or large multi-tenant workloads.** The local application and critical happy-path workflows run, but the authentication architecture, low measured code coverage, database tenant invariants, collection scaling, and unverified external services remain release blockers. No production deployment was performed.

## Architecture reviewed

Next.js App Router renders the UI and hosts server actions and versioned task APIs. Prisma with the PostgreSQL adapter stores users, hashed opaque sessions and one-time tokens, workspaces, memberships, projects, tasks, sprints, notifications, activity/audit logs, and durable workspace events. Redis provides distributed auth/invitation rate limits and realtime pub/sub. A bridge publishes committed PostgreSQL events to Redis; a separate WebSocket server authenticates sessions and replays events. Local development can use SSE. An email worker claims PostgreSQL jobs and sends SMTP mail. Attachments use private S3-compatible storage in production and a local adapter in development. The Dockerfile builds the app; Compose provides local PostgreSQL and Redis; GitHub Actions is configured for checks.

## Implemented features verified or inspected

- Registration, email verification, login, password reset and session revocation, logout, invitation onboarding, workspace switching, role changes and member removal. Google OAuth code is present but was not exercised with live credentials.
- Projects, tasks/subtasks, assignment, priorities, due dates, labels, custom statuses, comments, dependencies, private attachments, standard/custom boards, paginated task list and API, calendar, sprints, notifications, dashboard and reports.
- Server-side membership and role checks; version-checked task updates; workspace-scoped events; Redis WebSocket replay; email preferences; audit records; accessible dialog; light/dark themes and mobile layout.

## Reproducible findings fixed in this review

| Area | Finding and change |
| --- | --- |
| Account tokens | Concurrent email-verification and invitation submissions could reuse a token. Both now atomically consume it; race and expiry tests were added. |
| Access revocation | The local SSE stream checked access only at connection. It now checks the session and workspace membership on each poll. WebSocket delivery and replay also recheck access, with tests for logout and membership removal. |
| Notifications | Disabling in-app notices unintentionally disabled email notices, and some notice links led to a dashboard query parameter with no task view. Preferences are independent and links open the task. |
| Input size | Task APIs trusted `Content-Length` to limit JSON size. They now stop reading after 64 KiB even for streamed requests without that header. |
| Data consistency | Standard status changes left an old custom workflow column attached. Standard updates now clear that column. Sprint transitions use a conditional state update to reject stale requests; sprint creation validates dates and writes its event transactionally. |
| Memberships | Workspace members could be assigned project-manager privileges but could not see the corresponding project controls. The UI now uses the same project-level permission query as the server. Owners/admins can revoke members; revocation removes project roles and emits an audit/event record. |
| Dashboard scale | The home page loaded every workspace task. It now gets exact counts from database aggregates, fetches at most 100 recent tasks, and links “My tasks” to the paginated list. |
| Upload recovery | A failed attachment database transaction could leave a newly uploaded object behind. The route now attempts cleanup and reports an internal failure as a 5xx rather than a user error. |
| Database integrity | New migrations reject negative story points/positions, self-parenting and self-dependencies, invalid attachment sizes, and reversed sprint dates; a recent-task index was added. |
| Dependency security | Zod, Vitest, and Tailwind were upgraded. `npm audit` now reports zero known advisories. CI runs a high-severity audit. |
| Accessibility | A task-status select lacked a name, and automated scans found many low-contrast labels. Those were corrected for light and dark dashboard themes. The desktop/light, desktop/dark, and 390 px mobile dashboard scans now show no serious/critical WCAG A/AA violations. |
| Board hydration | The custom board's drag-and-drop provider generated different accessibility IDs during server and client rendering. A stable provider ID removed the hydration warning; browser coverage now asserts against it. |
| Demo credentials | The committed seed contained a fixed demo password. The current seed requires `DEMO_PASSWORD` and refuses production mode. The old sample password remains in prior Git history; rotate any account that used it outside a disposable local environment. |

## Tests and checks actually executed

| Command/check | Result |
| --- | --- |
| `npm ci` | Initial attempt failed because the machine's global npm cache contains root-owned entries. Re-run with a temporary npm cache succeeded (761 packages installed, zero audit findings). |
| `npx prisma validate`, `npx prisma migrate deploy`, `npx prisma migrate status` | Passed against a disposable local PostgreSQL 16 database; seven migrations applied and schema up to date. |
| `npm run lint`, `npm run typecheck` | Passed after fixes. |
| `npm test -- --coverage` with isolated PostgreSQL/Redis test URLs | 26 tests across 11 files passed. V8 unit/integration coverage: 8.68% statements, 8.1% branches, 8.58% functions, 15.52% lines (exact values are in `coverage/coverage-summary.json`). Playwright is not instrumented by this report, so its exercised UI/routes show 0% here. This is a serious coverage gap, not evidence that those paths were untested. |
| `npm run test:e2e` | Both Chromium workflows passed. They cover onboarding, invitation, task assignment/completion, sprint creation/start/assignment/completion, main-route navigation, project-manager access, revocation, notification navigation, API outsider/stale/oversized requests, reset-session revocation, mobile overflow, dashboard axe scans, and a hydration-error assertion. |
| `npm run build` | Passed. A built `next start` responded on a local port; unauthenticated task API returned 401. |
| `npm audit --audit-level=high`, `npm audit --omit=dev` | Both passed with zero known advisories at review time. |
| `docker compose config`, `git diff --check` | Passed. Docker image build/start was **not** rerun: this machine's Docker daemon was unavailable. GitHub Actions was not executed remotely for this revision. |
| Demo seed | Ran twice successfully against the disposable database (idempotent). A production-mode seed attempt was rejected as intended. |

## Outstanding blockers and limitations

1. **Authentication requirement unmet.** The application has custom session/account/OAuth code rather than Auth.js or an equivalently maintained authentication system required by the original specification. It needs migration or independent security assessment before sensitive production use. Google sign-in cannot link an existing password account.
2. **Tenant invariants are incomplete at the database layer.** The application validates cross-workspace task/project relationships, but PostgreSQL does not enforce that a task's sprint, parent, custom status, labels, dependencies, and project-member assignments all belong to the same project/workspace. Concurrent or privileged direct writes could create inconsistent tenant data. Add composite constraints or validated triggers and migration tests.
3. **Scale limits remain.** The board takes 500 tasks, calendar 200, notifications 50, dependency picker 100, and dashboard search only its 100 recent records. These views do not yet paginate all records. Reports and sprint pages still read complete tenant collections. Large organizations need query and UI pagination/aggregation plus load tests.
4. **Historical burndown is approximate.** It derives from current task state/timestamps rather than an immutable daily history. Redis is used for coordination/rate limits but not application caching. The platform-admin page is operational visibility rather than a full administration workflow.
5. **External behavior is unverified.** Google OAuth, SMTP delivery, S3 uploads/downloads/deletions, TLS reverse proxy, real WSS, Docker image, remote CI, backup/restore, and WebSocket connection-scale testing need production-equivalent checks. The email worker is at-least-once: a crash after SMTP send but before marking delivered can duplicate mail. Attachment cleanup after task deletion is best effort.
6. **Coverage and UX remain limited.** Most server actions, API branches, worker failure paths, and detailed non-dashboard interactions lack direct automated coverage; route smoke checks do not exercise every control. Dashboard accessibility scans passed, but no full manual keyboard/screen-reader audit was performed. Some forms have only a generic error page instead of inline validation or a success state; bulk status with no selection gives no useful feedback. The narrow task tables and long reports need further hands-on mobile review.
7. **Deployment evidence is incomplete.** The current changes are local and unpushed. No remote CI result or production target exists for this revision. The Docker daemon was down, so the updated image was not verified. Do not accept real customer data until these release gates are closed.

## Deployment path once blockers are resolved

Provision PostgreSQL 16+, Redis 7+, SMTP, a private S3-compatible bucket, a TLS proxy, and tested backups. Set `NODE_ENV=production`, a precise HTTPS `APP_URL`, WSS `NEXT_PUBLIC_REALTIME_WS_URL` at build time, and all service credentials in a secret manager; do not run the demo seed. Run `npm ci`, `npx prisma generate`, `npx prisma migrate deploy`, the full CI suite, and `npm run build`. Launch the Next.js app, email worker, one realtime bridge, and the required WebSocket replicas with the same database/Redis settings. Route `/realtime` through the TLS proxy, restrict direct service ports, validate OAuth/SMTP/S3/WSS end to end, run a restore exercise, and monitor HTTP errors, connection counts, queue age, and bridge lag. The full commands and variables are in `DEPLOYMENT.md`.
