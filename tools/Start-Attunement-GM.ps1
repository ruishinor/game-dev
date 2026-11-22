# Start the existing local Attunement server with GM rights for one verified
# account/character pair. No credentials or UUIDs are written to the repository.
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][ValidateNotNullOrEmpty()][string]$AccountHandle,
  [Parameter(Mandatory = $true)][ValidateNotNullOrEmpty()][string]$CharacterName,
  [string]$DataFile
)

$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
if (-not $DataFile) {
  $DataFile = if ($env:DATA_FILE) { $env:DATA_FILE } else { Join-Path $repoRoot 'data\characters.json' }
}
if (-not [System.IO.Path]::IsPathRooted($DataFile)) {
  $DataFile = Join-Path $repoRoot $DataFile
}
if (-not (Test-Path -LiteralPath $DataFile -PathType Leaf)) {
  throw "Character save not found. Verify the server's DATA_FILE and local save path."
}
$save = Get-Content -LiteralPath $DataFile -Raw | ConvertFrom-Json
$accounts = @($save.accounts | Where-Object { $_.handle -ieq $AccountHandle })
if ($accounts.Count -ne 1) {
  throw "Exactly one registered account handle must match. Enter the account HANDLE, not the UUID or character name."
}
$account = $accounts[0]
if ($account.id -notmatch '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$') {
  throw 'Registered account has an invalid UUID; refusing to enable GM.'
}
$characters = @($save.characters | Where-Object { $_.name -ieq $CharacterName })
if ($characters.Count -ne 1) {
  throw 'Expected exactly one character with that name in the selected save.'
}
if ($characters[0].accountId -cne $account.id) {
  throw 'The selected character is not linked to that registered account. GM will remain disabled.'
}
# Prefer npm.cmd on Windows to avoid execution-policy failures from npm.ps1.
$npm = Get-Command npm.cmd -ErrorAction SilentlyContinue
if (-not $npm) { $npm = Get-Command npm -ErrorAction SilentlyContinue }
if (-not $npm) { throw 'npm is not installed or not on PATH.' }
Write-Host "Verified GM account '$($account.handle)' owns character '$($characters[0].name)'."
Write-Host 'Start the game at http://127.0.0.1:8080 after npm reports the server listening.'
Write-Host 'Sign in through Account Login (not Guest). Use /gm status and /gm kill in chat.'

$oldIds = [Environment]::GetEnvironmentVariable('ATTUNEMENT_GM_ACCOUNT_IDS', 'Process')
$oldDataFile = [Environment]::GetEnvironmentVariable('DATA_FILE', 'Process')
try {
  # The verified save and the save actually opened by the server must match.
  # Both settings are process-scoped and restored when the server exits.
  $env:ATTUNEMENT_GM_ACCOUNT_IDS = $account.id
  $env:DATA_FILE = [System.IO.Path]::GetFullPath($DataFile)
  Push-Location $repoRoot
  try {
    & $npm.Source start
    if ($LASTEXITCODE -ne 0) { throw "Attunement server exited with code $LASTEXITCODE." }
  } finally { Pop-Location }
} finally {
  if ($null -eq $oldIds) { Remove-Item Env:\ATTUNEMENT_GM_ACCOUNT_IDS -ErrorAction SilentlyContinue }
  else { $env:ATTUNEMENT_GM_ACCOUNT_IDS = $oldIds }
  if ($null -eq $oldDataFile) { Remove-Item Env:\DATA_FILE -ErrorAction SilentlyContinue }
  else { $env:DATA_FILE = $oldDataFile }
}
