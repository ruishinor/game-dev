# Owner-only local playtest build. Run from repository root or another working directory.
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location $Root

function Invoke-Checked {
    param(
        [Parameter(Mandatory=$true)][string]$Exe,
        [Parameter(Mandatory=$true)][string[]]$Args
    )
    Write-Host "==> $Exe $($Args -join ' ')"
    & $Exe @Args
    if ($LASTEXITCODE -ne 0) {
        throw "$Exe failed with exit code $LASTEXITCODE"
    }
}

if (-not (Test-Path 'package-lock.json')) {
    throw 'Missing root package-lock.json. Refusing non-reproducible game dependency install.'
}

Invoke-Checked -Exe 'npm.cmd' -Args @('ci', '--no-audit', '--no-fund')
if (Test-Path 'desktop/package-lock.json') {
    Invoke-Checked -Exe 'npm.cmd' -Args @('ci', '--prefix', 'desktop', '--no-audit', '--no-fund')
} else {
    Write-Warning 'Desktop tooling lockfile not committed yet. This build is NOT reproducible/release-ready.'
    Invoke-Checked -Exe 'npm.cmd' -Args @('install', '--prefix', 'desktop', '--no-audit', '--no-fund')
}
Invoke-Checked -Exe 'node.exe' -Args @('--test', 'test/desktop-package.test.js')
Invoke-Checked -Exe 'node.exe' -Args @('desktop/prepare.mjs')

$Builder = Join-Path $Root 'desktop\node_modules\.bin\electron-builder.cmd'
if (-not (Test-Path $Builder)) { throw "Missing electron-builder: $Builder" }

Invoke-Checked -Exe $Builder -Args @('--win', 'portable', '--config', 'desktop/builder.json')

$Artifacts = @(Get-ChildItem -Path (Join-Path $Root 'dist\desktop') -Filter '*-portable.exe' -File -ErrorAction Stop)
if ($Artifacts.Count -lt 1) { throw 'No portable .exe artifact found after build' }

Write-Host 'Windows portable build output (NOT validated for public distribution):'
$Artifacts | ForEach-Object {
    Write-Host $_.FullName
    Get-FileHash -Algorithm SHA256 -Path $_.FullName | Format-List
}
