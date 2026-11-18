# Release requirements

- Prepare a Windows NSIS installer EXE and macOS DMG + ZIP distributions together for each delivered application release. Portable distributions were discontinued at the user's request.
- Provide separate macOS arm64 (Apple Silicon) and x64 (Intel) packages with the same app version and source contents as Windows.
- Use electron-builder through `npm run dist:win` on Windows and `npm run dist:mac` on macOS, or `npm run release:all` on macOS for combined cross-builds. Keep existing user Data and credentials out of archives.
- Preserve Unix executable permissions and framework symbolic links inside Mac ZIP files.
- On Windows, verify Mac archive integrity, architecture, embedded source contents and ad-hoc signatures; clearly report that actual macOS execution, Apple's native codesign verification and notarization are unverified. Never claim native Mac testing occurred.
- Both operating systems only check for new GitHub releases and open a browser download page after a click. Never download, replace, install, or restart the app automatically. Release notifications do not require Developer ID; ad-hoc sign Mac packages and nested code by default. Preview builds disable notifications and use a separate output folder. Never require users to run a preparation script. Verify all nested signatures and resource seals before distributing.
- Ad-hoc signing does not provide Developer ID trust or Apple notarization. Be clear about possible first-run macOS security approval and lack of actual Mac execution testing. Do not claim Apple signing/notarization has been performed without valid credentials and verification.
- Use the package.json releaseRepository default or an explicit MOYEO_UPDATE_REPOSITORY override. Never embed GitHub tokens or Mattermost credentials. Open only the configured repository's GitHub release page; ignore URLs supplied by release metadata. Publish GitHub releases only after all platform installers are uploaded.
- Preserve the existing moyeo-mattermost-client user-data path and legacy data import. The update notification must not interrupt current chat or close the app.
