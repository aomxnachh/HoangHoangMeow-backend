# Acceptance tests

Use Node.js 22.12 or newer. Install dependencies in both `backend` and `frontend` using `npm ci`.

## API and database

Run `npm test` from `backend`. The suite applies the real SQL migrations to an isolated, in-memory PostgreSQL engine (PGlite), then calls the actual Hono routes, authentication and Drizzle queries. It never connects to `DATABASE_URL`. Tests cover the 51 workbook cases, ownership, calendar boundaries, persistence, migrations, and outbound product-link validation.

The API suite freezes the clock at 17 October 2026 to preserve the meaning of the workbook's past and future dates. Expense TC14 follows the required amount field and the workbook's recorded passing behavior: a missing amount is rejected.

## Browser

Run `npm run test:e2e` from `backend` with Google Chrome installed. The suite starts an isolated backend on `127.0.0.1:4401` and the frontend on `127.0.0.1:5174`, and shuts both down when it completes. It uses the Playwright dependency already declared in `frontend`.

Keep those ports free. Do not build or edit the frontend during this run, because SvelteKit regenerates files and refreshes the running page. Future reminder dates use 2099; profile birthdates and historic expenses retain the workbook's dates. Browser locale and timezone are Thai/Bangkok. Screenshots and failure details are written to `../test-results`.

Third-party font and Google sign-in resources are excluded from browser tests. Password login uses the real authentication route. Product availability is simulated in the acceptance and browser tests; the separate product-link unit suite tests public HTTPS, missing products, redirects and private-address blocking. No purchase or external payment is submitted.

## Build and run the application

1. Set `DATABASE_URL` in `backend/.env` to your PostgreSQL database. Set `AUTH_SECRET`, `CLIENT_ORIGIN`, and `APP_URL` for the intended environment.
2. From `backend`, run `npm run db:migrate` and then `npm run dev` (port 4000 by default). For production, use `npm run build` followed by `npm start`.
3. Set `VITE_API_URL` in the frontend environment to the backend URL. From `frontend`, run `npm run dev`. Production uses `npm run build`; the API URL is selected at build time.
4. From `frontend`, run `npm run check` and `npm run build` to validate the application.

Recommendations and advertising use the configured database content. Admins can assign ads to Dashboard, Reminders, Care, or All pages. Specific-breed entries match that breed; entries with a species and no breed apply to that species. An absent standard care recommendation is shown as an explicit message with a link to manual reminders.

Care forms prefill their title/details from the selected pet's age-matched recommendations and recorded allergy/notes. The user chooses the frequency and date before saving. Recommendation age groups use the existing BABY/ADULT/SENIOR categories: under 1 year, 1–6 years, and 7 years or older.

The migration history contained duplicate schema operations in 0003 and 0005. These are now safe for fresh initialization and repeated migration. Test migrations ran only on the isolated database; apply them to the intended deployment database as part of its normal release process.


## Round 2 acceptance coverage

The second workbook is `Test ครั้งที่ 1 hoanghoangmeow (1).xlsx`: 40 functional requirements (9 FAIL, 9 FIX, 22 PASS) and 13 non-functional requirements (6 FAIL, 2 PASS, 5 not rated). Additional API and browser scenarios cover the reported gaps, including downgrade permissions, credit/debit demo outcomes, uploaded photos, health edits/search/order, notification thresholds on every page, month/year summaries and narrow-screen navigation.

Run the browser suite in Microsoft Edge with PowerShell `$env:E2E_BROWSER='msedge'` before `npm run test:e2e`; omit the variable for Chrome. These are installed desktop browsers with an emulated mobile viewport, not tests on a physical phone or Safari.

### Payment modes

Checkout defaults to an explicitly labelled simulation when `PAYMENT_CHECKOUT_URL` is unset, including on a production deployment. This is intentional for the project's demo upgrade flow: confirming a successful simulation persists the user's Premium plan and records a `DEMO_*` payment without charging money. It accepts only CREDIT/DEBIT and SUCCESS/FAILED scenarios and never accepts card numbers or CVV. Set `PAYMENT_DEMO_ENABLED=true` to explicitly select simulation even if a provider URL exists; set it to `false` to disable simulation. With simulation disabled and no provider configured, checkout returns an unavailable error. Real payments require `PAYMENT_CHECKOUT_URL` and `PAYMENT_WEBHOOK_SECRET` plus an integration matching the payment provider. `/api/billing/options` tells the signed-in frontend which mode and price to display.

The payment callback requires `X-Payment-Timestamp` (Unix seconds) and `X-Payment-Signature` (hex HMAC-SHA256 of `timestamp.rawRequestBody` with the webhook secret). The timestamp window is five minutes. Duplicate successful callbacks do not duplicate an upgrade. This contract must be adapted to the selected provider before collecting real money.

### Notification behavior

A global notifier loads pending reminders across pages, evaluates local due times every second, and refreshes server data every 30 seconds, after mutations and on return to the tab/network. The badge counts due/advance reminders, not all future reminders. Snoozing suppresses a notification until the new time. In-app alerts do not require permission; system notifications require the user to enable browser notifications. Alerts persist in the database until done/snoozed/deleted. Browser timers may be throttled in the background. Delivery with all browser windows closed is not implemented; that requires a server-side push/email service and an agreed provider. Reopening the site restores due reminders.

### Availability and deployment checks

- Runtime: Node.js 22.12+; Dockerfiles use Node 22 and locked installs. Container builds were not executed if Docker is unavailable.
- `GET /api/health` checks process liveness; `GET /api/ready` verifies a database query and returns 503 without internal details on failure. The pool has bounded connect/query timeouts and recovers idle connection failures. SIGTERM/SIGINT drain the server and database pool.
- Production startup rejects a missing/default/short AUTH_SECRET. Configure a unique secret of at least 32 characters and the exact CLIENT_ORIGIN/APP_URL. API responses use no-store and security headers; database diagnostics require an administrator.
- Apply SQL migrations and configure database backups, restore drills, uptime monitoring and restart policy on the real hosting environment. The isolated tests do not prove production uptime, backup recovery, external provider delivery, or performance under a production workload.
- Free retains every pet's data but allows writes only for the three smallest pet IDs. The API enforces this for pets, health records, reminders, care plans and expenses. Upgrading restores write access. Do not delete data to enforce plan limits.
