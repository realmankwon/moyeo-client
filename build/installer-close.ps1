[CmdletBinding()]
param(
  [Parameter(Mandatory=$true)][string]$InstallDir,
  [string]$ExecutableName = 'Moyeo.exe',
  [ValidateSet('Check','Close')][string]$Mode = 'Check'
)
$ErrorActionPreference = 'Stop'
try {
  if ([IO.Path]::GetFileName($ExecutableName) -ne $ExecutableName -or $ExecutableName -notmatch '^[a-zA-Z0-9._ -]+[.]exe$') { throw 'Invalid executable name' }
  $targetPath = [IO.Path]::GetFullPath([IO.Path]::Combine($InstallDir,$ExecutableName))
  $currentSession = (Get-Process -Id $PID).SessionId
  function Get-MoyeoProcesses {
    try {
      $candidates = @(Get-CimInstance -ClassName Win32_Process -Filter "Name='$ExecutableName'" -ErrorAction Stop)
      if (@($candidates | Where-Object { $_.SessionId -eq $currentSession -and -not $_.ExecutablePath }).Count -gt 0) { throw 'Cannot inspect application path' }
      return @($candidates | Where-Object {
        $_.ExecutablePath -and $_.SessionId -eq $currentSession -and [string]::Equals($_.ExecutablePath,$targetPath,[StringComparison]::OrdinalIgnoreCase)
      } | ForEach-Object { Get-Process -Id $_.ProcessId -ErrorAction SilentlyContinue })
    } catch {
      $candidates = @(Get-Process -Name ([IO.Path]::GetFileNameWithoutExtension($ExecutableName)) -ErrorAction SilentlyContinue)
      if (@($candidates | Where-Object { $_.SessionId -eq $currentSession -and -not $_.Path }).Count -gt 0) { throw 'Cannot inspect application path' }
      return @($candidates | Where-Object {
        $_.SessionId -eq $currentSession -and $_.Path -and [string]::Equals($_.Path,$targetPath,[StringComparison]::OrdinalIgnoreCase)
      })
    }
  }
  $runningApps = @(Get-MoyeoProcesses)
  if ($runningApps.Count -eq 0) { exit 0 }
  if ($Mode -eq 'Check') { exit 10 }
  # Only a manually invoked installer calls Close, after its running-app prompt.
  if ([IO.File]::Exists($targetPath)) {
    $start = New-Object Diagnostics.ProcessStartInfo
    $start.FileName = $targetPath
    $start.Arguments = '--quit-for-install'
    $start.UseShellExecute = $false
    $start.CreateNoWindow = $true
    $request = [Diagnostics.Process]::Start($start)
    if ($request) { $null = $request.WaitForExit(1500) }
  }
  $deadline = [DateTime]::UtcNow.AddSeconds(5)
  do {
    $runningApps = @(Get-MoyeoProcesses)
    if ($runningApps.Count -eq 0) { exit 0 }
    Start-Sleep -Milliseconds 200
  } while ([DateTime]::UtcNow -lt $deadline)
  # Legacy releases hide on WM_CLOSE. Terminate only the exact installed app,
  # in this interactive session, and revalidate each PID immediately beforehand.
  foreach ($process in @(Get-MoyeoProcesses)) {
    $fresh = Get-Process -Id $process.Id -ErrorAction SilentlyContinue
    if ($fresh -and $fresh.SessionId -eq $currentSession -and $fresh.Path -and [string]::Equals($fresh.Path,$targetPath,[StringComparison]::OrdinalIgnoreCase)) {
      Stop-Process -Id $fresh.Id -Force -ErrorAction Stop
    }
  }
  $deadline = [DateTime]::UtcNow.AddSeconds(4)
  do {
    if (@(Get-MoyeoProcesses).Count -eq 0) { exit 0 }
    Start-Sleep -Milliseconds 200
  } while ([DateTime]::UtcNow -lt $deadline)
  exit 10
} catch {
  Write-Output ('Moyeo installer process check: ' + $_.Exception.Message)
  exit 20
}
