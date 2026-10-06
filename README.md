# My Money Tracker (offline Android finance app)

100% offline: no INTERNET permission in the manifest, no network libraries, no cloud, no login.

## Build status
- Part 1: project setup, Room database (16 tables), DAOs, calculation engine, loan/EMI math, unit tests.
- Part 2: Compose UI. Onboarding (Start From Zero / Load Sample Data), dashboard, transactions with search, budgets, EMI + loan managers with payment history, debts, savings goals, monthly plan, future changes, settings, + Add menu.
- Part 3 (this zip): app lock (BiometricPrompt + salted-hash PIN in EncryptedSharedPreferences), local reminders (WorkManager, daily), calendar, reports/charts, JSON/CSV backup + restore via file picker, full settings.

NOTE: Parts 1 and 2 were written without access to the Android SDK, so it has not been compiled yet.. Expect to
paste back any build error and it will be fixed in the next part.

## Open and run
1. Install Android Studio (Koala or newer). Open the `MyMoneyTracker` folder. Let Gradle sync (needs internet once, for downloading build tools only).
2. Run tests: right-click `app/src/test` > Run Tests (checks the salary/rent/EMI examples from the spec).
3. Run on phone: enable Developer options + USB debugging, connect, press Run.
4. Build APK: Build > Build Bundle(s)/APK(s) > Build APK(s). File: `app/build/outputs/apk/debug/app-debug.apk`. Copy to phone and install.

## Architecture
UI (Compose) -> ViewModel -> Repository -> Room -> local storage.
`domain/` is pure Kotlin: `MonthlyEngine` derives every dashboard/forecast number from raw rows. Nothing is stored as a total.

## Data conventions
- Money = Long paise (no rounding errors). Dates = epochDay.
- Tables: category, payment_method, income, expense, recurring_expense, emi, emi_payment, loan, loan_payment,
  debt, debt_payment, budget, savings_goal, scheduled_change (future salary/rent/EMI changes), financial_event, user_settings.
- Interest rate is nullable: the user enters it; nothing is hard-coded (TVS sample has rate = empty).

## Security notes
- PIN: never stored. Salted PBKDF2-SHA256 hash inside EncryptedSharedPreferences (Android Keystore key). 5 wrong tries = 30 s lockout, growing.
- Biometric: BiometricPrompt (fingerprint/face). Android 11+ also accepts the phone screen lock; older versions fall back to the app PIN.
- Screenshots / recent-apps preview are blocked (FLAG_SECURE). Notification amounts are hidden on the lock screen.
- Backup files are plain JSON/CSV, not encrypted. They are only written where you pick.
- No INTERNET permission, no analytics, no logging of financial data.

## Backup format
JSON file `{app, version, exportedAt, settings, categories, ..., scheduledChanges}`. Restore validates the whole file first and runs in one transaction: if anything fails, existing data is untouched. This phone's lock settings are kept.

## Not implemented (honest list)
- "Start of financial month" setting (reports use calendar months).
- Multiple currencies (one symbol only).
- Pagination: lists use LazyColumn but load all rows; fine for thousands of rows.
- Notifications fire once a day (~9:00); Android may delay WorkManager jobs when battery saver is on.

## Get the APK without Android Studio (GitHub Actions)
1. Create a free GitHub account and a new PRIVATE repository.
2. Upload the contents of this folder (including the hidden `.github` folder) to the repo.
3. Open the repo's Actions tab > "Build APK" > wait ~5-8 minutes.
4. Open the finished run > Artifacts > download `MyMoneyTracker-apk` (a zip containing app-debug.apk).
5. Unzip, copy app-debug.apk to the phone, tap it, allow "install unknown apps".
