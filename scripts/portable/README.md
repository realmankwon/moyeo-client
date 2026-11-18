# Single-file Windows portable build

Run `npm run dist`, then `npm run portable` on Windows x64. The current package.json version determines the input and output names. electron-builder's NSIS portable target embeds the folder build. The build refuses input containing a Data folder to prevent packaging personal settings.

Output: dist/portable/Moyeo-0.7.0-portable.exe. Copy this EXE to the destination PC. It extracts Electron into a temporary directory and saves preferences and caches in Data next to the original EXE. Keep Data beside the EXE when updating or moving the app. Closing the window keeps the tray app running. Use the tray's 완전히 종료 menu to quit and remove the temporary runtime.

Verification: node scripts/portable/smoke.cjs. This copies only the EXE into an isolated test folder, checks portable data, demo rendering, messaging, close-to-tray behavior and runtime cleanup. npm run test:ui runs the full regression against a local Mattermost fixture.

Launcher.cs is retained as historical source for versions 0.3 and 0.4. Current builds use NSIS.
