# OpenHES Demo - 本機靜態網站伺服器 (Windows 內建 PowerShell，免安裝)
# 服務 ./web 資料夾，自動挑選可用埠並開啟瀏覽器。關閉視窗即停止。
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$root = Join-Path $PSScriptRoot 'web'
if (-not (Test-Path $root)) {
  Write-Host '找不到 web 資料夾，請確認檔案完整。' -ForegroundColor Red
  Read-Host '按 Enter 結束'; exit 1
}

$mime = @{
  '.html'='text/html; charset=utf-8'; '.htm'='text/html; charset=utf-8';
  '.js'='text/javascript; charset=utf-8'; '.mjs'='text/javascript; charset=utf-8';
  '.css'='text/css; charset=utf-8'; '.json'='application/json; charset=utf-8';
  '.svg'='image/svg+xml'; '.png'='image/png'; '.jpg'='image/jpeg'; '.jpeg'='image/jpeg';
  '.gif'='image/gif'; '.ico'='image/x-icon'; '.webp'='image/webp';
  '.woff'='font/woff'; '.woff2'='font/woff2'; '.ttf'='font/ttf';
  '.map'='application/json'; '.txt'='text/plain; charset=utf-8'
}

# 找一個可用的埠 (8080..8120)
$listener = $null; $port = 0
for ($p = 8080; $p -le 8120; $p++) {
  try {
    $l = New-Object System.Net.HttpListener
    $l.Prefixes.Add("http://localhost:$p/")
    $l.Start()
    $listener = $l; $port = $p; break
  } catch { if ($l) { try { $l.Close() } catch {} } }
}
if (-not $listener) {
  Write-Host '無法啟動本機伺服器（可能權限不足）。' -ForegroundColor Red
  Write-Host '請改用最簡單的方式：直接雙擊「開啟Demo（請雙擊我）.html」。' -ForegroundColor Yellow
  Read-Host '按 Enter 結束'; exit 1
}

$url = "http://localhost:$port/"
Write-Host ''
Write-Host '  OpenHES Demo 已啟動' -ForegroundColor Green
Write-Host "  網址： $url"
Write-Host '  （請保持此視窗開啟；關閉視窗即停止服務）'
Write-Host ''
Start-Process $url

while ($listener.IsListening) {
  try {
    $ctx = $listener.GetContext()
    $req = $ctx.Request; $res = $ctx.Response
    $rel = [System.Uri]::UnescapeDataString($req.Url.AbsolutePath).TrimStart('/')
    if ([string]::IsNullOrWhiteSpace($rel)) { $rel = 'index.html' }
    $path = Join-Path $root $rel
    if (-not (Test-Path $path -PathType Leaf)) { $path = Join-Path $root 'index.html' }
    $bytes = [System.IO.File]::ReadAllBytes($path)
    $ext = [System.IO.Path]::GetExtension($path).ToLower()
    $res.ContentType = if ($mime.ContainsKey($ext)) { $mime[$ext] } else { 'application/octet-stream' }
    $res.Headers.Add('Cache-Control', 'no-cache')
    $res.ContentLength64 = $bytes.Length
    $res.OutputStream.Write($bytes, 0, $bytes.Length)
    $res.OutputStream.Close()
  } catch { try { $res.StatusCode = 500; $res.OutputStream.Close() } catch {} }
}
