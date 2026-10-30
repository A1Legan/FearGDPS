# FEAR — Discord-бот (GDPS)

Discord-бот для сервера FEAR GDPS: тикет-система, модерация (бан/мут/варн через роли), фидбэк,
статистика активности и карточки оценок уровней (rates).

## Требования

- [Bun](https://bun.sh) (рантайм и сборка)
- Discord-приложение (бот) с включёнными **привилегированными интентами**:
  Presence, Server Members, Message Content — иначе бот не залогинится.

## Установка

```bash
bun install
```

Настройки — в `data/config.json`: токен, `CLIENT_ID`, `GUILD_ID`, ID каналов и ролей,
`RATES_SECRET` и `RATES_PORT` (по умолчанию 3055).

## Запуск

```bash
bun run start          # чистая сборка + запуск
# или
bun run startNoClean   # сборка без очистки + запуск
```

## Права бота на сервере

Приглашай бота **без Administrator**. Нужны только:
View Channels, Send Messages, Manage Messages, Embed Links, Attach Files,
Read Message History, Manage Channels, Manage Roles, Moderate Members (Timeout).

Важно: роль бота в иерархии должна быть **выше** ролей мута/бана, иначе выдача ролей и таймаут не сработают.

## Логи оценки уровней (rates)

Бот поднимает локальный HTTP-приёмник на `127.0.0.1:RATES_PORT/rate`.
GDPS-сервер (на том же хосте) шлёт `POST` с заголовком `x-rate-secret: <RATES_SECRET>`
и JSON уровня — бот рисует карточку и постит её в канал `CHANNEL_RATE_PUBLIC`.

## Структура

```
src/            исходники бота (TypeScript)
assets/         шрифт и иконки для карточек оценок
data/           config.json + хранилища json/
build/          скомпилированный JS (генерируется)
```
