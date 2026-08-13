# ============================================================
#  OpenHES Demo — 一鍵製作交付用安裝部署包
# ------------------------------------------------------------
#  用途：自動建置 → 組裝資料夾 → 壓成可交付給業主的 ZIP。
#  使用：在本資料夾按右鍵以 PowerShell 執行，或雙擊
#        「製作部署包.bat」。
# ============================================================
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$root = $PSScriptRoot
Set-Location $root

function Step($msg) { Write-Host "`n==> $msg" -ForegroundColor Cyan }

# --- 讀取版本號 ---
$pkg = Get-Content (Join-Path $root 'package.json') -Raw | ConvertFrom-Json
$ver = $pkg.version
$stamp = Get-Date -Format 'yyyyMMdd'
$appName    = 'OpenHES-Demo'
$folderName = 'OpenHES-Demo'   # 解壓後業主看到的資料夾名稱

# --- 1. 安裝相依套件（已安裝會很快略過）---
if (-not (Test-Path (Join-Path $root 'node_modules'))) {
  Step '安裝相依套件 (npm install)…'
  & npm install --no-audit --no-fund
  if ($LASTEXITCODE -ne 0) { throw 'npm install 失敗' }
} else {
  Step '相依套件已存在，略過 npm install'
}

# --- 2. 建置：單檔版（雙擊即開）---
Step '建置單檔版 (dist-single)…'
& npm run build:single
if ($LASTEXITCODE -ne 0) { throw 'build:single 失敗' }

# --- 3. 建置：多檔版（內網／網站部署）---
Step '建置多檔版 (dist)…'
& npm run build
if ($LASTEXITCODE -ne 0) { throw 'build 失敗' }

# --- 4. 組裝交付資料夾 ---
Step '組裝交付資料夾…'
$buildRoot = Join-Path $root 'package-build'
$out       = Join-Path $buildRoot $folderName
if (Test-Path $out) { Remove-Item $out -Recurse -Force }
New-Item -ItemType Directory -Path $out -Force | Out-Null
$adv = Join-Path $out '進階_內網部署'
New-Item -ItemType Directory -Path $adv -Force | Out-Null

# 4a. 單檔版 → 「開啟Demo（請雙擊我）.html」
Copy-Item (Join-Path $root 'dist-single\index.html') `
          (Join-Path $out '開啟Demo（請雙擊我）.html') -Force

# 4b. 範本檔（說明 / 啟動工具）
$tpl = Join-Path $root 'package-src'
Copy-Item (Join-Path $tpl '使用說明.txt') $out -Force
Copy-Item (Join-Path $tpl '進階_內網部署\*') $adv -Recurse -Force

# 4c. 多檔版 → 進階_內網部署\web
$web = Join-Path $adv 'web'
New-Item -ItemType Directory -Path $web -Force | Out-Null
Copy-Item (Join-Path $root 'dist\*') $web -Recurse -Force

# --- 5. 壓成 ZIP ---
Step '壓縮成 ZIP…'
$zipName = "$appName-v$ver-$stamp.zip"
$zipPath = Join-Path $root $zipName
if (Test-Path $zipPath) { Remove-Item $zipPath -Force }
Compress-Archive -Path $out -DestinationPath $zipPath -Force

# --- 完成 ---
$zipMB = [Math]::Round((Get-Item $zipPath).Length / 1MB, 1)
Write-Host "`n============================================================" -ForegroundColor Green
Write-Host " 完成！可直接交付給業主的安裝部署包：" -ForegroundColor Green
Write-Host "   $zipName  ($zipMB MB)" -ForegroundColor White
Write-Host "   位置： $zipPath" -ForegroundColor DarkGray
Write-Host "============================================================" -ForegroundColor Green
Write-Host "`n業主只需：解壓縮 → 進入 $folderName 資料夾 →" -ForegroundColor Yellow
Write-Host "          雙擊「開啟Demo（請雙擊我）.html」即可。" -ForegroundColor Yellow
