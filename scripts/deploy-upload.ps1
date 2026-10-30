# Run from the welmo folder:
# powershell -ExecutionPolicy Bypass -File scripts\deploy-upload.ps1

$SERVER = "root@109.196.103.39"
$PROJECT = "C:\Users\vladi\Welmo\welmo"

Write-Host "=== Uploading project to server ===" -ForegroundColor Cyan

# Copy project files (excluding node_modules, .next, .git)
Write-Host "Copying files..." -ForegroundColor Yellow
# Копируем всё кроме gd-server (он идёт отдельно без node_modules)
scp -r -o StrictHostKeyChecking=no `
  "$PROJECT\app" `
  "$PROJECT\lib" `
  "$PROJECT\prisma" `
  "$PROJECT\public" `
  "$PROJECT\scripts" `
  "$PROJECT\package.json" `
  "$PROJECT\next.config.ts" `
  "$PROJECT\tsconfig.json" `
  "$PROJECT\postcss.config.mjs" `
  "${SERVER}:/opt/justland/"

# Копируем gd-server без node_modules
Write-Host "Copying gd-server (excluding node_modules)..." -ForegroundColor Yellow
ssh -o StrictHostKeyChecking=no $SERVER "mkdir -p /opt/justland/gd-server"
scp -r -o StrictHostKeyChecking=no `
  "$PROJECT\gd-server\index.ts" `
  "$PROJECT\gd-server\routes" `
  "$PROJECT\gd-server\lib" `
  "$PROJECT\gd-server\package.json" `
  "$PROJECT\gd-server\bun.lock" `
  "$PROJECT\gd-server\prisma.config.ts" `
  "${SERVER}:/opt/justland/gd-server/"

# Copy .env.local
Write-Host "Copying .env..." -ForegroundColor Yellow
scp -o StrictHostKeyChecking=no "$PROJECT\.env.local" "${SERVER}:/opt/justland/.env.local"

Write-Host "Running install on server..." -ForegroundColor Yellow
ssh -o StrictHostKeyChecking=no $SERVER "bash /opt/justland/scripts/deploy-app.sh"

Write-Host "=== Done! ===" -ForegroundColor Green
Write-Host "Site: http://welmo.duckdns.org"
Write-Host "GD server: welmo.duckdns.org:443"
