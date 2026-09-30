# Crea Keep_Watching-<versione>.zip nella radice del repository, con i soli file
# dell'estensione (manifest.json nella radice dello zip). Rimuove gli zip di versioni precedenti.
# Uso (PowerShell su Windows):  powershell -ExecutionPolicy Bypass -File tools/package.ps1
$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..')
$version = (Get-Content manifest.json -Raw | ConvertFrom-Json).version
Get-ChildItem -Filter 'Keep_Watching-*.zip' | Remove-Item
$out = "Keep_Watching-$version.zip"
Compress-Archive -Path manifest.json, rules.json, src, icons -DestinationPath $out
Write-Host "Creato $out"
