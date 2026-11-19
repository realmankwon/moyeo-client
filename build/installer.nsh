# Exact app-path check for both installer and uninstaller.
!macro customCheckAppRunning
  InitPluginsDir
  File /oname=$PLUGINSDIR\moyeo-installer-close.ps1 "${BUILD_RESOURCES_DIR}\installer-close.ps1"
  StrCpy $PowerShellPath "$SYSDIR\WindowsPowerShell\v1.0\powershell.exe"
  IfFileExists "$WINDIR\Sysnative\WindowsPowerShell\v1.0\powershell.exe" 0 +2
    StrCpy $PowerShellPath "$WINDIR\Sysnative\WindowsPowerShell\v1.0\powershell.exe"
  moyeo_check_again:
    nsExec::ExecToLog '"$PowerShellPath" -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$PLUGINSDIR\moyeo-installer-close.ps1" -InstallDir "$INSTDIR" -ExecutableName "${APP_EXECUTABLE_FILENAME}" -Mode Check'
    Pop $R0
    StrCmp $R0 0 moyeo_check_done
    StrCmp $R0 10 0 moyeo_check_failed
    IfSilent moyeo_close_requested
    MessageBox MB_OKCANCEL|MB_ICONEXCLAMATION "$(appRunning)" IDOK moyeo_close_requested
    SetErrorLevel 2
    Quit
  moyeo_close_requested:
    DetailPrint "Closing installed Moyeo before replacement..."
    nsExec::ExecToLog '"$PowerShellPath" -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$PLUGINSDIR\moyeo-installer-close.ps1" -InstallDir "$INSTDIR" -ExecutableName "${APP_EXECUTABLE_FILENAME}" -Mode Close'
    Pop $R0
    StrCmp $R0 0 moyeo_check_done
  moyeo_check_failed:
    MessageBox MB_RETRYCANCEL|MB_ICONEXCLAMATION "Moyeo installation cannot continue. Exit Moyeo completely from the tray menu. If it was started as administrator, exit that instance too. Then retry. Process check code: $R0" /SD IDCANCEL IDRETRY moyeo_check_again
    SetErrorLevel 2
    Quit
  moyeo_check_done:
!macroend

# Keep electron-builder's generated uninstaller, registry/shortcut handling and
# atomic file-lock rollback. Older installed uninstallers can have an invalid CRC
# after cross-building on macOS; never run them or disable their integrity check.
!macro moyeoUpgradeLog TEXT
  Push $R8
  Push $R9
  StrCpy $R9 0
  ${If} ${Errors}
    StrCpy $R9 1
  ${EndIf}
  DetailPrint "${TEXT}"
  ClearErrors
  FileOpen $R8 "$TEMP\Moyeo-install.log" a
  ${IfNot} ${Errors}
    FileSeek $R8 0 END
    FileWrite $R8 "${TEXT}$\r$\n"
    FileClose $R8
  ${EndIf}
  ${If} $R9 == 1
    SetErrors
  ${Else}
    ClearErrors
  ${EndIf}
  Pop $R9
  Pop $R8
!macroend

!macro moyeoPrepareUpgradeUninstaller
  # An incomplete installation cannot be safely removed recursively. Keep its
  # folder and all unknown files, skip its uninstaller, and let the normal
  # extraction step restore the selected destination and update registration.
  ${IfNot} ${FileExists} "$installationDir\${APP_EXECUTABLE_FILENAME}"
  ${OrIfNot} ${FileExists} "$installationDir\resources\app.asar"
    !insertmacro moyeoUpgradeLog "Repair install: incomplete registered payload; preserving folder: $installationDir; destination: $INSTDIR"
    StrCpy $R0 0
    ClearErrors
    Return
  ${EndIf}
  !insertmacro moyeoUpgradeLog "Using verified bundled uninstaller; registered directory: $installationDir"
  File "/oname=$uninstallerFileNameTemp" "${UNINSTALLER_OUT_FILE}"
  # If execution is blocked, the fallback must not invoke the broken legacy file.
  StrCpy $uninstallerFileName "$uninstallerFileNameTemp"
!macroend
