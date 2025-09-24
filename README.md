# Discord Channel Message Exporter (TypeScript)

TypeScript Discord bot that exports the full message history of a single text channel into a structured JSON file.

## Возможности

- ✅ Выгружает все сообщения из указанного текстового канала
- ✅ Дальше синхронизирует только новые сообщения по расписанию
- ✅ Собирает автора, текст, вложения, эмбеды, правки и ответы
- ✅ Автоматически пагинирует историю до самых старых сообщений
- ✅ Уважает rate limits (настраиваемая задержка между запросами)
- ✅ Сохраняет результат в `JSON` с метаданными канала
## Требования

- Node.js 18.x или выше
- Discord бот с правами `View Channel` и `Read Message History`
- Включённый `Message Content Intent` в настройках бота

## Установка

1. Установите зависимости:
   ```bash
   npm install
   ```

2. Настройте окружение:
   ```bash
   cp .env.example .env
   ```

   Заполните `.env`:
   ```env
   DISCORD_TOKEN=ваш_бот_токен
   CHANNEL_ID=1381368509908652224
   DOWNLOAD_DIR=exports
   REQUEST_DELAY=500
   SYNC_INTERVAL_MS=600000
   EXIT_ON_IDLE=true
   ```

## Запуск

```bash
# Компиляция TypeScript и запуск
npm start

# Только компиляция
npm run build

# Режим разработки (автоперезапуск)
npm run dev
```

Экспортированные сообщения сохраняются в каталоге `DOWNLOAD_DIR` (по умолчанию `exports`). Первый прогон создаёт файл формата `<канал>-<id>.json`; последующие синхронизации дописывают новые сообщения в тот же файл.

### Режим синхронизации

- `SYNC_INTERVAL_MS=0` — бот выгружает один раз и завершает работу
- Любое значение > 0 — бот остаётся запущенным и повторяет синхронизацию через заданный интервал
- `EXIT_ON_IDLE=true` — после синхронизации без новых сообщений бот сразу завершится (удобно для GitHub Actions)
- `EXIT_ON_IDLE=false` — бот продолжает ожидать следующего цикла, даже если новостей нет

## Формат выгрузки

Пример структуры итогового JSON файла:

```json
{
  "guildId": "123456789012345678",
  "guildName": "Example Guild",
  "channelId": "1381368509908652224",
  "channelName": "general",
  "exportedAt": "2024-05-21T12:34:56.789Z",
  "totalMessages": 420,
  "messages": [
    {
      "id": "1200000000000000000",
      "authorId": "1100000000000000000",
      "authorTag": "username#0001",
      "authorDisplayName": "username",
      "createdAt": "2024-01-01T10:00:00.000Z",
      "editedAt": null,
      "content": "Привет всем!",
      "attachments": [],
      "embedsCount": 0,
      "referencedMessageId": null
    }
  ]
}
```

## Советы по правам

- Убедитесь, что бот добавлен на сервер с правами `View Channel` и `Read Message History` в целевом канале.
- Если канал приватный, выдайте боту соответствующие права доступа через роли.

## Предотвращение rate limits

Если бот упирается в ограничения Discord, увеличьте значение `REQUEST_DELAY` в `.env`.

## Безопасность

- Никогда не коммитьте `.env` с токеном.
- Используйте отдельный токен бота для выгрузок.
- При необходимости ограничьте права до конкретного канала.

## Лицензия

MIT
