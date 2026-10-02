# Crea Keep_Watching-<versione>.zip nella radice del repository.
# Lo zip contiene la cartella Keep_Watching\ con i soli file dell'estensione:
# estraendolo si ottiene direttamente la cartella da caricare nel browser.
# Rimuove gli zip di versioni precedenti.
# Uso (PowerShell su Windows):  powershell -ExecutionPolicy Bypass -File tools/package.ps1
$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..')
$version = (Get-Content manifest.json -Raw | ConvertFrom-Json).version
$out = "Keep_Watching-$version.zip"

$stage = Join-Path ([System.IO.Path]::GetTempPath()) ("kw_" + [guid]::NewGuid())
$dir = Join-Path $stage 'Keep_Watching'
New-Item -ItemType Directory -Force $dir | Out-Null
Copy-Item manifest.json, rules.json -Destination $dir
Copy-Item src, icons -Destination $dir -Recurse

Get-ChildItem -Filter 'Keep_Watching-*.zip' | Remove-Item
Compress-Archive -Path $dir -DestinationPath $out
Remove-Item $stage -Recurse -Force
Write-Host "Creato $out"
