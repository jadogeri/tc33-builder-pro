# TC33 Builder Pro upgrade

`UPGRADE.txt` is the feature request for this change. Source files, dropped-file copies, preferences, and history stay on the local device.

## Included

- A responsive workspace inspired by the Vital Records Generator layout and colored from the TC33 icon; Light, Dark, Black, and System themes.
- A frameless window with accessible minimize, maximize, and close controls, bounded startup splash, and native app menus.
- A searchable Ctrl/Cmd+K quick-action palette with Import, Batch Validate, Generate, History, and Preferences actions.
- Import or drag/drop up to 50 `.xlsx` and `.json` files. Dropped files are copied into the app's local data folder so they can be reopened from history.
- JSON PSR parish, FIPS code, district (last FIPS digit), and tax year appear in the source list before validation. Matching prefers same-name JSON files and otherwise uses the first imported JSON file.
- A dedicated JSON schema picker, single-file removal, select-all and per-workbook TC-33 generation.
- Validation output includes the workbook extraction log even when the JSON is invalid, and an Issues tab summarizes failures by workbook.
- Locally stored recent paths, activity log, clear-history confirmation, editable report defaults, filename, and optional date suffix.
- Local PDF, Excel, CSV, JSON, text, and Word mismatch reports, plus per-workbook TC-33 export dialogs. An optional JSON report filename is available in Preferences.
- A system tray icon and optional minimize-to-tray behavior; optional native notifications always retain an in-app activity message.
- Tailwind CSS utilities and Framer Motion transitions.
- TypeScript, parser/preferences, validation-log, metadata, six-format export, and Playwright UI tests.

## Verification in this environment

- `npm run typecheck`, `npm test` (12 tests), and `npm run build` pass.
- The Playwright suite could not be completed here: the Playwright Chromium download repeatedly timed out, and the system Chromium disconnected/hung when launched through Playwright. A direct headless Chromium smoke check loaded the workspace UI.

## Desktop acceptance still required

Build checks cannot prove native behavior on every operating system. Before release, verify the app on Windows, macOS, and Linux: native window controls and screen-reader navigation; tray restore and quit behavior; denied/suppressed system notifications; splash startup timing; and shortcut conflicts. Tray integration is enabled on supported desktop platforms; notifications remain off until the user opts in.
