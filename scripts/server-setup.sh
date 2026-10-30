#!/usr/bin/env bash
# pipefail важен: без него падение команды в конвейере проходило молча.
set -euo pipefail

DOMAIN="welmo.duckdns.org"

echo "=== 1. Обновление системы ==="
apt-get update -y && apt-get upgrade -y

echo "=== 2. Установка пакетов ==="
apt-get install -y curl git unzip nginx certbot python3-certbot-nginx ufw

echo "=== 3. Установка Bun ==="
curl -fsSL https://bun.sh/install | bash
export BUN_INSTALL="$HOME/.bun"
export PATH="$BUN_INSTALL/bin:$PATH"
echo 'export BUN_INSTALL="$HOME/.bun"' >> ~/.bashrc
echo 'export PATH="$BUN_INSTALL/bin:$PATH"' >> ~/.bashrc

echo "=== 4. Установка Node.js 20 ==="
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs

echo "=== 5. Установка PM2 ==="
npm install -g pm2

echo "=== 6. Файрвол ==="
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

echo "=== 7. SSL-сертификат (Let's Encrypt) ==="
systemctl stop nginx || true
certbot certonly --standalone -d $DOMAIN --non-interactive --agree-tos -m admin@$DOMAIN
systemctl start nginx || true

echo "=== 8. Папка проекта ==="
mkdir -p /opt/welmo

echo ""
echo "======================================"
echo "Готово"
echo "======================================"
