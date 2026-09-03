# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

MeuGasto (also referred to as "ContaCerta" in design docs) is a personal-finance web app: expense/income tracking, wallets, budgets, financial goals, pending bills, and dashboards. It is a two-package repo — **not** an npm workspace — with independent `backend/` and `frontend/` projects, each with its own `package.json`, `node_modules`, and deploy target on Vercel.

- `backend/` — NestJS + MongoDB (Mongoose) REST API
- `frontend/` — Vite + React + TypeScript SPA (Tailwind CSS)
- `Documentos/` — original PT-BR product/design spec (`Proposta.md`) with the intended UI structure, design tokens, and API contract. Useful background, but the actual code is the source of truth for current behavior.

Product-facing text, comments, and commit messages in this repo are predominantly Portuguese (pt-BR); match that convention when editing.

## Commands

All commands are run from within `backend/` or `frontend/` respectively (there is no root package.json).

### Backend (`backend/`)
- `npm run start:dev` — dev server on port 3000 with hot reload (`ts-node-dev`)
- `npm run build` — `tsc -p tsconfig.json`
- `npm start` — run compiled `dist/main.js`
- `npm test` — run all Jest specs (`--runInBand`)
- `npx jest src/modules/transactions/transactions.controller.spec.ts` — run a single spec file
- `npx jest -t "some test name"` — run tests matching a name
- Tests are e2e-style controller specs (`*.spec.ts`) using `mongodb-memory-server` (an in-memory Mongo instance is spun up per test file) and `supertest`; `JwtAuthGuard` is overridden with a fake authenticated user rather than issuing real JWTs.
- `npm run email:preview` — render transactional email templates locally
- No lint script exists for the backend.

### Frontend (`frontend/`)
- `npm run dev` — Vite dev server (`--host`), proxies `/api` to `http://localhost:3000`
- `npm run build` — `tsc -b && vite build`
- `npm run preview` — serve the production build locally
- `npm run lint` — ESLint over the whole project
- `npm test` — Vitest (`vitest run`), jsdom environment
- `npx vitest run src/lib/finance.test.ts` — run a single test file
- `npx vitest src/lib/finance.test.ts` — watch mode for one file
- `npm run generate-icons` — regenerate PWA icons from `public/favicon.svg`

If `node`/`npm` are not on PATH in the shell, prepend `C:\Program Files\nodejs` manually before invoking them.

## Backend architecture

**Module layout** (`backend/src/modules/*`, one NestJS module per domain): `auth`, `users`, `categories`, `transactions`, `pending` (contas a pagar/receber), `goals`, `dashboard`, `insights`, `expenses`, `wallets`, `cartoes` (credit cards), `import` (OFX bank-statement import), `webauthn` (passkeys), `notifications`, `billing` (Stripe + Asaas/PIX). Each module follows the standard NestJS shape: `*.module.ts`, `*.controller.ts`, `*.service.ts`, `dto/`, `schemas/` (Mongoose).

**Multi-tenancy**: every document that belongs to a user carries a `userId` field, and every service method takes `userId` as an explicit first argument and filters/scopes all queries by it — there is no global-tenant middleware. `CurrentUser` (`common/decorators/current-user.decorator.ts`) pulls `request.user` (set by `JwtAuthGuard`) into controller handlers. Categories are the one shared resource: `userId: null` means a system default category, visible to all users alongside their own custom ones (see `categories/data/default-categories.ts` for the seeded default set).

**Auth**: JWT access token + separate refresh token (`JwtAuthGuard` in `common/guards/` verifies the bearer token and loads the user via `UsersService`; `passport-local`/`passport-jwt` strategies live in `modules/auth/strategies/`). Passwords hashed with bcrypt. WebAuthn/passkey login is a separate, optional module.

**Cross-module side effects worth knowing before touching `transactions`**: creating/updating/deleting a `Transaction` can cascade into two other collections in the same service call (not via events): it adjusts the linked `Wallet.saldo` balance (`transactions.service.ts`), and it increments/decrements a `Goal.currentValue` when the transaction's category is linked to a goal. Scheduled ("agendado") transactions — dated in the future — are excluded from these balance effects until their date arrives. Transactions without a `carteiraId` (pre-multi-wallet legacy data) get a synthetic virtual wallet attached on read (`LEGACY_WALLET`) rather than a null value, so the frontend never has to special-case a missing wallet.

**Credit cards** (`cartoes` module): a card is a `Wallet` with `tipo: 'credito'`; `Fatura` (monthly invoice) and `Parcelamento` (installment plan) are separate collections, both scoped by `userId`. Buying on a card is a normal `Transaction` (`type: EXPENSE`) tagged with `faturaId` — it never touches `Wallet.saldo` (a card purchase creates debt, it isn't cash leaving an account) but it **does** still increment `Goal.currentValue` when the category is goal-linked, exactly like a cash purchase. This asymmetry is the most likely trap when touching `transactions.service.ts#create` next — don't gate the goal-increment call on the same `isCredito` check that guards the wallet `$inc`. A card's `Fatura` is created lazily on its first purchase (not at close), together with the `PendingAccount` that represents it in the bills list; paying or unpaying that `PendingAccount` through the generic `contas` flow is blocked (`pending.service.ts`), since a fatura payment has its own rules (payer wallet, partial payment, rotativo). An estorno is **not** a negative-value `Transaction` — the schema forbids negative `value` — it's a positive `EXPENSE` flagged `isEstorno: true`, netted out in every aggregation via the shared `$cond` in `transactions/transaction-aggregation.util.ts`; any new report that sums `Transaction.value` must reuse that helper, or a reversed card purchase gets double-counted. Excluding credit cards from net-worth totals happens in `wallets.service.ts#findAll` and `insights.service.ts#getWalletsEvolution`, not in `dashboard.service.ts` (which has no net-worth aggregation at all). In the Insights cash-flow view (`insights.service.ts#getCashflow`), a card transaction is bucketed by its **fatura's `dataVencimento`**, not by the transaction's own `date` — that's when the money actually leaves an account; every other report (category breakdown, dashboard) still uses the transaction's own `date`. A `Wallet` of any type can be archived (`arquivadaEm`) instead of deleted — it disappears from listings/selectors/net-worth but its transactions keep showing up in past-month reports; archiving a card is blocked while it has an unpaid fatura or a future installment pending, and an archived wallet rejects new transactions.

An estorno can only reverse a transaction once: `Transaction.estornoDeTransacaoId` points from the estorno back to the original purchase, and `CartoesService#estornar` checks for an existing one before creating another — without it, the same purchase could be estornado repeatedly, each call further wrecking `valorTotal`/`Goal.currentValue`.

**Notifications**: a daily cron (`notifications-cron.service.ts`, `@nestjs/schedule`, gated behind `CRON_NOTIFICATIONS=true`, `America/Sao_Paulo` timezone) scans `PendingAccount` documents due today or overdue and upserts notifications. The frontend also triggers an on-demand sync (`POST /api/notifications/sync`) right after login/boot.

**Billing**: `billing.service.ts` integrates two payment rails — Stripe (card, subscriptions) and Asaas (PIX). Subscription/access state (`isLegacyFree`, `subscriptionStatus`, `trialEndsAt`, `subscriptionExpiresAt`) lives on the `User` document; `AuthContext.computeHasAccess` on the frontend is the single place that interprets those fields into an access/no-access boolean.

**Deployment duality**: `src/main.ts` boots a standalone Nest app (local dev / non-Vercel), while `api/index.ts` wraps the same `AppModule` in an Express adapter as a Vercel serverless function (`vercel.json` routes `/api/*` there). CORS, Helmet, and the global `ValidationPipe` (`whitelist`, `forbidNonWhitelisted`, `transform`) are configured redundantly in both entry points — if you change one, check whether the other needs the same change. Mongo connection falls back to `mongodb-memory-server` when `MONGODB_URI` is unset outside production, and throws if unset in production.

## Frontend architecture

**Routing** (`src/App.tsx`): `/` redirects based on auth state (`/dashboard` if logged in, `/landing` otherwise). Authenticated routes are nested under two guard components — `PrivateRoute` (has a valid access token and isn't session-locked) then `SubscriptionGate` (redirects to `/checkout` if `computeHasAccess` is false) — before reaching `AppLayout`. All authenticated pages are lazy-loaded (`React.lazy`) and code-split; `LandingPage`/`LoginPage` etc. are the unauthenticated entry points.

**Auth token handling** (`lib/auth.ts`, `lib/api.ts`): the access token is kept in a module-level JS variable only (never persisted) — a page reload always starts unauthenticated and re-derives the access token from the refresh token (stored in `localStorage`) via `AppBoot` in `App.tsx`. The axios instance (`lib/api.ts`) has a response interceptor that, on a 401, transparently calls `refreshAccessToken()` and retries the original request; concurrent 401s are coalesced through a single in-flight refresh promise (`_refreshPromise`) specifically to avoid a React StrictMode double-invoke race that would otherwise burn a rotating refresh token and force a spurious logout.

**Session lock vs. logged-out**: `AuthContext`'s `isLocked` is distinct from "has no token" — it models an inactivity lock (`hooks/useInactivityLock.ts`) separate from actually being signed out.

**Styling**: Tailwind CSS with design tokens defined as CSS custom properties (`--bg-base`, `--text-primary`, etc., swapped by `ThemeContext` toggling a `dark`/`light` class + `data-theme` attribute on `<html>`) rather than Tailwind's built-in dark mode palette, so both themes share one Tailwind config. `fontFamily.sans` ("Syne") is configured but not actually loaded anywhere in the app — it always falls back to the browser default sans-serif; this is intentional/pre-existing, not a bug to fix opportunistically. Body font is DM Sans, self-hosted as static files in `public/fonts/` (not through `@fontsource`'s JS import, which would bundle the `@font-face` CSS into the render-blocking main stylesheet) and loaded via a `<link rel=preload as=style>` + swap pattern in `index.html` to avoid blocking first paint.

**PWA**: `vite-plugin-pwa` in `injectManifest` mode with a hand-written service worker (`src/sw.ts`) — precaching via Workbox, `NetworkFirst` for `/api/*` (10s timeout, falls back to a 24h cache), SPA navigation fallback to `index.html` for everything except `/api/`.

**Domain types**: `types/api.ts` and `types/finance.ts` mirror the backend's DTOs/schemas; there's no shared/generated type package, so when a backend DTO or schema shape changes, update these by hand.

## Cross-cutting notes

- "Carteira" = wallet, "gasto" = expense, "ganho"/"receita" = income, "conta pendente" = pending bill, "meta" = goal — these Portuguese terms appear directly in field names, routes (`/carteiras`, `/contas`), and DB fields (`carteiraId`, `saldo`), not just UI copy.
- Known deferred issue: deleting a category does not reallocate or block the transactions still referencing it, leaving them effectively orphaned.
