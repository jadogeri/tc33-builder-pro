# TC33 Builder Pro upgrade

`UPGRADE.txt` is the feature request for this change. The app keeps source spreadsheets and saved history on the local device.

## Included

- A responsive workspace inspired by the Vital Records Generator layout and colored from the TC33 icon; Light, Dark, Black, and System themes.
- A frameless window with accessible minimize, maximize, and close controls, bounded startup splash, and native app menus.
- A searchable Ctrl/Cmd+K quick-action palette with Import, Batch Validate, Generate, History, and Preferences actions.
- Batch import of up to 50 `.xlsx` and `.json` files. Batch comparison prefers matching basenames and otherwise uses the first imported JSON file.
- Locally stored recent paths, activity log, clear-history confirmation, editable report defaults, filename, and optional date suffix.
- Local PDF and DOCX mismatch reports, plus per-workbook TC-33 export dialogs.
- A system tray icon and optional minimize-to-tray behavior; optional native notifications always retain an in-app activity message.
- TypeScript, parser/preferences unit tests, and Playwright UI tests.

## Desktop acceptance still required

CI/build checks cannot prove native behavior on every operating system. Before release, verify the app on Windows, macOS, and Linux: native window controls and screen-reader navigation; tray restore and quit behavior; denied/suppressed system notifications; splash startup timing; and shortcut conflicts. Tray integration is currently enabled on Electron-supported tray platforms; notifications remain off until the user opts in.
