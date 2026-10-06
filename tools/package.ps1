# Crea Keep_Watching-<versione>.zip nella radice del repository e aggiorna il nome
# dello zip nel README. Lo zip contiene la cartella Keep_Watching\ con i soli file
# dell'estensione: estraendolo si ottiene la cartella da caricare nel browser.
# Rimuove gli zip di versioni precedenti.
# Uso (PowerShell su Windows):  powershell -ExecutionPolicy Bypass -File tools/package.ps1
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location $root

# I file si leggono e scrivono con .NET: in Windows PowerShell 5.1 Get-Content e
# Set-Content non usano UTF-8 senza BOM e rovinerebbero le lettere accentate.
$version = ([System.IO.File]::ReadAllText((Join-Path $root 'manifest.json')) | ConvertFrom-Json).version
$out = "Keep_Watching-$version.zip"

$stage = Join-Path ([System.IO.Path]::GetTempPath()) ("kw_" + [guid]::NewGuid())
$dir = Join-Path $stage 'Keep_Watching'
New-Item -ItemType Directory -Force $dir | Out-Null
Copy-Item manifest.json, rules.json -Destination $dir
Copy-Item src, icons -Destination $dir -Recurse

Get-ChildItem -Filter 'Keep_Watching-*.zip' | Remove-Item
Compress-Archive -Path $dir -DestinationPath (Join-Path $root $out)
Remove-Item $stage -Recurse -Force

$readme = Join-Path $root 'README.md'
$text = [System.IO.File]::ReadAllText($readme)
[System.IO.File]::WriteAllText($readme, [regex]::Replace($text, 'Keep_Watching-\d+\.\d+\.\d+\.zip', $out))
Write-Host "Creato $out (README aggiornato)"
