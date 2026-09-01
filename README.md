# Settle — Expense Tracking & Settlement

A mobile-first Next.js + TypeScript + Supabase app for recording shared
expenses and calculating exactly who owes whom. Built for roommates, trips,
and friend groups.

This project was fixed and extended from an earlier version. See
**"What was fixed"** and **"Features"** below for the full list of changes.

## Stack
- Next.js (App Router) + React + TypeScript
- Supabase Auth + PostgreSQL + Row Level Security
- Plain CSS — no UI framework, fully responsive, installable as a mobile app (PWA)
- INR-first; amounts are stored as decimals and calculated in integer minor units (paise) to avoid floating-point drift

---

## 1. Quick start (local)

```bash
npm install
cp .env.example .env.local
npm run dev
```
Open http://localhost:3000. You'll see the landing page until you connect Supabase (next step) and sign up.

## 2. Set up Supabase (free tier is enough)

1. Create a free project at https://supabase.com.
2. Open **SQL Editor** in your project.
3. Paste the entire contents of `supabase/schema.sql` and run it.
   - Already have an older version of this project deployed? Run
     `supabase/fix-existing-project.sql` instead — it upgrades your existing
     database in place (fixes RLS, adds invite codes) without losing data.
4. Go to **Project Settings → API** and copy the **Project URL** and the
   **anon / publishable key**.
5. Go to **Authentication → Providers** and make sure **Email** is enabled.
   For a quick personal/college-project setup you can turn off "Confirm email"
   under Authentication → Settings so sign-up logs you in immediately.

Paste the two values into `.env.local`:
```env
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
```
Never put a Supabase **service-role** key in frontend code — only the anon key belongs here.

## 3. Run locally
```bash
npm install
npm run dev
```
Visit http://localhost:3000, sign up, then go to **Groups** to create your first group.

## 4. Deploy to Vercel (free tier)

1. Push this folder to a GitHub repository.
2. Go to https://vercel.com → **Add New Project** → import the repository.
3. Vercel auto-detects Next.js — no build settings to change.
4. Add the two environment variables from step 2 under **Settings → Environment Variables**:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
5. Click **Deploy**.
6. Back in Supabase, go to **Authentication → URL Configuration** and set your
   Vercel URL (e.g. `https://your-app.vercel.app`) as the **Site URL**, and
   add it to **Redirect URLs** as well.

That's it — the app is live. Vercel and Supabase free tiers are enough for
personal or small-group use; check each provider's current limits if usage grows.

### Installing it like an app on a phone
The app ships with a web manifest and icons, so once deployed you can open it
in a mobile browser and use **"Add to Home Screen"** (Safari) or **"Install
app"** (Chrome) to get an app-like icon and full-screen experience — no app
store needed.

---

## 5. What was fixed

The uploaded project failed to build. The root cause and the other issues
found during the review are listed here for transparency:

- **Build-breaking type error** — `lib/balance.ts` created its running-balance
  map with `new Map(memberIds.map(id=>[id,0] as const))`. The `as const`
  made TypeScript infer the map's value type as the literal `0` instead of
  `number`, so every later `.set(id, someNumber)` failed type-checking and
  `next build` aborted. Fixed by typing the map explicitly as
  `Map<string, number>`.
- **Group selection was effectively stuck on your first group.** The
  dashboard let you switch groups, but the Add Expense and Settle Up pages
  always silently used your first group, with no selector — so anyone in
  more than one group (e.g. "Roommates" + "Goa Trip") could accidentally
  log an expense to the wrong one. All pages now share one persisted
  "active group" (`lib/useGroups.ts`), and a group switcher appears
  wherever you belong to more than one group.
- **No way to add members to a group after creating it, and no invite flow**
  — both were called out as unfinished in the previous README. Implemented
  below under Features.
- **`Settle Up` used a native `prompt()` dialog** to record a payment amount,
  which looks broken/unstyled on mobile and can't be validated nicely.
  Replaced with an in-app modal.
- **Joining a group by invite code always created a brand-new member row**,
  even if the group creator had already listed that person by name when the
  group was created. A friend who signed up later and joined would end up as
  a duplicate, disconnected "Alex" instead of taking over the "Alex" that
  already had expense history. Joining now previews the group first and
  offers to link your account to an existing name, or add you as new if none fit.
- There was no way to leave a group you'd joined — only the creator could
  remove members. Added a self-service "Leave group" action.
- Removed two leftover empty folders (`components/`, `types/`) from the
  original zip that weren't wired into the project — `components/` now
  holds the new mobile app shell.

## 6. Features

**Core**
- Email/password auth (Supabase Auth)
- Create groups, add members (with or without their own account)
- Add **shared** expenses (equal or custom split) or **personal** expenses (paid for one person)
- Edit and delete expenses, with balances recalculating automatically
- Smart **settlement suggestions** that net out circular debts into the fewest possible payments
- Record full or partial payments against a suggestion, with payment method
- Filter expenses by payer, type, payment method, category, and month
- Every write (create/edit expense, settle up) is a single atomic database transaction via Postgres RPCs, so a half-saved expense can never happen

**New in this version**
- **Group switcher everywhere** — Dashboard, Expenses, Add Expense, and Settle Up all agree on which group you're working in, and remember your choice
- **Invite codes, with account linking** — every group gets a short shareable code (e.g. `A1B2C3`). When someone joins with it, they're shown the group name and any members who were added by name only (no account yet) and asked "is one of these you?" — picking their name links their account to their existing expense history instead of creating a disconnected duplicate person. If none fit, they're added as a new member.
- **Leave a group** — any non-creator member can leave from Groups → Manage, as long as they have no expense or settlement history in that group (the creator can't leave, since someone has to own the group)
- **Member management** — group creators can add or remove members from an existing group at any time (Groups → Manage)
- **Delete a group** — the creator can permanently delete a group from Groups → Manage, which cascades to its expenses and settlements. Guarded by typing the exact group name to confirm, since it can't be undone.
- **Settlement history** — Settle Up now shows past payments, not just suggestions, and lets you delete a mistaken entry
- **Spending by category** breakdown on the dashboard
- **CSV export** of your filtered expense list
- **Installable mobile app** — manifest + icons + a bottom tab bar (Home / Expenses / Add / Settle / Groups) on phone-sized screens, matching the pattern of apps like Splitwise, so the whole thing is usable one-handed
- Clear "you need a group first" prompts instead of dead ends when a new user has no group yet

## 7. Core calculation rules

The engine in `lib/balance.ts` converts money to integer minor units (paise) before calculating, so results never drift due to floating-point rounding.

- For an expense: the payer's balance goes **up** by the total; each person's
  share is subtracted from their balance.
- A personal expense is just a shared expense with one share equal to the
  full amount, so it's never accidentally split.
- A settlement **adds** to the payer (`from`) and **subtracts** from the
  recipient (`to`).
- Suggested payments are generated by matching the largest creditors against
  the largest debtors greedily, which collapses circular debts (A owes B,
  B owes C, C owes A) into zero payments, and produces the shortest
  practical list of transactions otherwise.
- Equal splitting distributes remainder paise one at a time so shares always
  add back up to the exact total — e.g. ₹100 split three ways becomes
  ₹33.34 / ₹33.33 / ₹33.33.

## 8. Tests

```bash
npm run test
```
Runs `tests/balance-engine.test.mjs`, covering personal expenses, equal
shared expenses, partial settlements, rounding reconciliation, and circular
netting. It's a dependency-free reimplementation of the same math as
`lib/balance.ts` so the test intent can run without adding a TypeScript test
runner; for a stricter CI setup, add Vitest and import `lib/balance.ts` directly.

## 9. Project structure

```
app/                 Pages (App Router)
  page.tsx           Dashboard
  auth/              Sign in / sign up
  groups/            Create, join, and manage groups
  expenses/          List, filter, export
  expenses/new/      Add expense
  expenses/[id]/     Edit/delete expense
  settle/            Settlement suggestions, payment history
components/
  AppShell.tsx       Header + mobile bottom nav, auth-aware
lib/
  balance.ts         Pure balance/settlement math (unit-tested)
  useGroups.ts        Shared "active group" selection, persisted locally
  supabase.ts        Supabase browser client
  types.ts           Shared TypeScript types
supabase/
  schema.sql               Full schema — run once on a new project
  fix-existing-project.sql Migration for an existing deployment
tests/
  balance-engine.test.mjs
```

## 10. Security notes

- Every table has Row Level Security enabled; a user can only read or write
  data for groups they belong to.
- Expense/settlement writes go through `SECURITY DEFINER` Postgres functions
  (`create_expense_with_shares`, `update_expense_with_shares`,
  `join_group_with_code`) so validation (matching shares, valid members,
  positive amounts) happens on the server, not just in the browser.
- Only the group creator can add/remove members directly; anyone else joins
  themselves via the invite code, which links their own account rather than
  giving them the ability to add arbitrary other people.

## 11. Possible next steps

- Multiple payers on a single expense (currently one payer per expense)
- Push/email notifications when someone adds an expense or settles up
- Recurring expenses
- Per-group currency instead of INR-only formatting
