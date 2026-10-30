#!/bin/bash
# Запускается автоматически после загрузки файлов
# pipefail важен: без него падение команды в конвейере проходило молча.
set -euo pipefail

GD_DOMAIN="feargdps.duckdns.org"
SITE_DOMAIN="feargdps.duckdns.org"
DIR="/opt/justland"

export BUN_INSTALL="$HOME/.bun"
export PATH="$BUN_INSTALL/bin:$PATH"

echo "=== Установка зависимостей ==="
cd $DIR
npm install

echo "=== Сборка Next.js ==="
npm run build

echo "=== Зависимости GD-сервера ==="
cd $DIR/gd-server
bun install 2>/dev/null || npm install

echo "=== Настройка .env для продакшена ==="
cd $DIR
# Устанавливаем/обновляем переменные окружения
grep -q "NEXT_PUBLIC_SITE_URL" .env.local || echo "NEXT_PUBLIC_SITE_URL=http://${SITE_DOMAIN}" >> .env.local
grep -q "GD_SERVER_URL" .env.local        || echo "GD_SERVER_URL=https://${GD_DOMAIN}" >> .env.local

sed -i "s|NEXT_PUBLIC_SITE_URL=.*|NEXT_PUBLIC_SITE_URL=http://${SITE_DOMAIN}|" .env.local
sed -i "s|GD_SERVER_URL=.*|GD_SERVER_URL=https://${GD_DOMAIN}|" .env.local

echo "=== Настройка Nginx ==="
cat > /etc/nginx/sites-available/justland << EOF
server {
    listen 80;
    server_name ${SITE_DOMAIN} ${GD_DOMAIN};
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;
    }
}
server {
    listen 443 ssl;
    server_name ${GD_DOMAIN};
    ssl_certificate     /etc/letsencrypt/live/${GD_DOMAIN}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/${GD_DOMAIN}/privkey.pem;
    ssl_protocols       TLSv1 TLSv1.1 TLSv1.2 TLSv1.3;
    ssl_ciphers         ALL:!aNULL:!eNULL:!EXPORT:!DES:!MD5:!PSK:!RC4;
    location / {
        proxy_pass http://127.0.0.1:4443;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_read_timeout 30s;
    }
}
EOF

ln -sf /etc/nginx/sites-available/justland /etc/nginx/sites-enabled/justland
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

echo "=== Настройка PM2 ==="
cat > $DIR/ecosystem.config.js << EOF
module.exports = {
  apps: [
    {
      name: 'nextjs',
      cwd: '${DIR}',
      script: 'node_modules/.bin/next',
      args: 'start -p 3000',
      env: { NODE_ENV: 'production' },
    },
    {
      name: 'gd-server',
      cwd: '${DIR}/gd-server',
      script: '$HOME/.bun/bin/bun',
      args: 'run index.ts',
      env: {
        NODE_ENV: 'production',
        GD_PORT: '4443',
        GD_NO_TLS: '1',
      },
    },
  ],
}
EOF

pm2 delete all 2>/dev/null || true
pm2 start $DIR/ecosystem.config.js
pm2 save
pm2 startup systemd -u root --hp /root | tail -1 | bash || true

echo "=== Обновление URL песен в БД ==="
cd $DIR
bun scripts/fix-song-urls.ts || echo "fix-song-urls завершился с ошибкой (не критично)"

echo ""
echo "======================================"
echo "Деплой завершён!"
echo "Сайт:      http://${SITE_DOMAIN}"
echo "GD сервер: https://${GD_DOMAIN}"
echo "PM2 статус: pm2 status"
echo "======================================"
