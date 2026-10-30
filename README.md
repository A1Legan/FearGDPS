# 🎮 Geometry Dash Private Server

Приватный сервер для Geometry Dash, развёрнутый на собственном VPS. Реализован полный цикл: от маршрутизации запросов игрового клиента до работы с базой данных и веб-интерфейса для игроков.

## 🏗️ Архитектура

```
┌──────────────────┐       ┌─────────────────────┐       ┌──────────────┐
│  GD Client (C++) │ ────▶│   VPS (Ubuntu)      │ ────▶ │  PostgreSQL  │
│   (игрок)        │       │   Next.js API       │       │              │
└──────────────────┘       └─────────────────────┘       └──────────────┘
                                    │
                                    ▼
                           ┌─────────────────┐
                           │  Web UI (music) │
                           └─────────────────┘
```

## 🛠️ Стек технологий

![Ubuntu](https://img.shields.io/badge/Ubuntu-E95420?style=for-the-badge&logo=ubuntu&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169E1?style=for-the-badge&logo=postgresql&logoColor=white)
![Next.js](https://img.shields.io/badge/Next.js-000000?style=for-the-badge&logo=next.js&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white)
![Timeweb](https://img.shields.io/badge/Timeweb_Cloud-21A021?style=for-the-badge)

- **ОС:** Ubuntu (VPS на Timeweb Cloud)
- **Бэкенд:** Next.js + TypeScript
- **База данных:** PostgreSQL
- **Клиент:** Geometry Dash (C++)

## ✨ Ключевые фичи

- **Перехват трафика игрового клиента.** Настроил маршрутизацию так, чтобы запросы от C++-клиента игры обрабатывались моим сервером и базой данных вместо официальных.
- **Мягкое удаление (soft delete).** Добавил поле `isDeleted` в PostgreSQL: удалённые в игре уровни и комментарии скрываются из клиентского интерфейса, но сохраняются в БД — это позволяет восстанавливать данные и вести аудит.
- **Загрузка пользовательской музыки.** Веб-интерфейс, через который игроки могут загружать свои треки для онлайн-уровней.
- **Развёртывание с нуля.** Сервер поднят на VPS, настроено окружение, подключение к БД и деплой Next.js-приложения.
