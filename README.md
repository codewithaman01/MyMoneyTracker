# FinGlass — offline personal finance app (glassmorphism)

React + TypeScript + Capacitor. **All data stays on the phone** (IndexedDB inside the Android app). No server.
For financial organisation and education only — not regulated advice.

## Features
Income (received vs expected, recurring) · Expenses (categories, methods, search, CSV) · Budgets with alerts ·
Debts/EMI with avalanche & snowball planner and shown assumptions · Goals · Investments (manual values) ·
Dashboard (income vs expenses, categories, savings trend, budgets, debt progress, allocation) · Insights (historical / current / estimate labels,
forecast only with ≥ 6 months of data) · Gemini AI assistant using local tools · EMI reminders · JSON backup/restore.

## Added from My Money Tracker (same stack: React + TypeScript + Dexie + Capacitor)
| My Money Tracker | In FinGlass |
|---|---|
| Dashboard "remaining balance", health warnings, month navigation | Home → **Monthly plan** card (+ budgets now count recurring and EMI spend) |
| Monthly plan / forecast 1-120 months | More → **Monthly plan** |
| Recurring income (any frequency, end date, pause) | More → **Income plans** |
| Recurring payments (rent, bills, daily travel Mon-Sat, custom intervals) | More → **Recurring payments** |
| Future salary / rent / EMI changes | More → **Future changes** |
| EMI Manager (schedule, paid / pending / skip / partial, completion, stats) | More → **EMI Manager** |
| Loan Manager (reducing / flat / unknown, schedule, principal vs interest) | More → **Loan Manager** |
| Friend debts (I owe / owed to me, part payments) | More → **Friend debts** |
| Savings goals add / withdraw | Goals → **Contribute / Withdraw** |
| Custom expense categories, category filter | Expenses form → "＋ New…", category filter |
| Calendar of dues | More → **Calendar** |
| Reports (6 charts, 1-60 months) | More → **Reports** |
| App lock (PIN, lockout, fingerprint / face, timeout), screenshot block | Settings → **Security** (native app) |
| Local reminders (EMI, loan, rent, bills, debts, income, goals, budgets 75%+) | Settings → **Reminders** |
| Onboarding (start from zero / sample, PIN) | First launch (skipped if you already have data) |
| Validated restore, CSV export of every table, dark / light | Settings |
| "+ Add" quick menu | Floating **＋ Add** button |

Notes: plan figures come from Income plans, Recurring payments, expense *entries*, EMIs, loans and friend debts. Do not enter the same
rent or salary both as a plan and as entries, or it is counted twice. Loan rate and EMI are never assumed: leave them empty and the loan
shows "enter the rate to build the schedule". Backups made by older FinGlass versions still restore. Kotlin backups from My Money Tracker are not importable.

Platform differences from the Kotlin app: the PIN hash is kept in the app's private storage (not the Android Keystore); notifications are scheduled
for the next 60 days whenever the app is opened (no background worker) and cannot hide amounts on the lock screen, so amounts are left out unless you opt in;
reminders, biometrics and screenshot blocking only work in the installed Android app.

## Run on your computer
```bash
npm install
npm test          # 55 tests: EMI, payoff, cash flow, budgets, goals, forecast, plan engine, loans, lock, reminders, assistant tools
npm run dev       # http://localhost:5173
```

## Git → Android APK
```bash
git init && git add . && git commit -m "FinGlass"
git branch -M main
git remote add origin https://github.com/<you>/finglass.git
git push -u origin main
```
GitHub Actions (`.github/workflows/android.yml`) runs the tests, builds the web app, generates the Android project, and produces
`app-debug.apk` under **Actions → latest run → Artifacts**. Push a tag (`git tag v1.0.0 && git push --tags`) to also attach it to a GitHub Release.
On the phone: download the APK, allow “install unknown apps”, install.

Local build (needs Android Studio / JDK 17): `npm run build && npx cap add android && npx cap sync android && npx cap open android`

## AI assistant
Settings → paste your Google Gemini API key. The key is stored on the phone only. The model can call 9 whitelisted tools
(`src/lib/tools.ts`); every number comes from `src/lib/calc.ts`. Only small tool results are sent to Google. Use a restricted key you can revoke.

## Important
- Data is lost if you uninstall the app or lose the phone — use **Settings → Export backup**.
- The debug APK is debug-signed: fine for personal use, not for the Play Store.
