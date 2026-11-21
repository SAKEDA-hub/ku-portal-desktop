# Инструкции для ИИ-агента

Репозиторий — приложения для портала KU: `desktop/` (Electron) и `mobile/android/` (Android WebView). Сам портал (`app/`) — копия github.com/SAKEDA-hub/ku-portal; его правила — в `app/` не дублируются, смотрите AGENTS.md исходного репозитория.

- `app/` не править вообще: это точная копия ku-portal (проверяет `tests/server.test.js`). Обновление — `./scripts/sync-app.sh ../ku-portal`. Репозиторий ku-portal из этого проекта не трогать.
- По умолчанию приложения открывают сайт (`https://ku-portal.alwaysdata.net`) — так они связаны с сайтом общими данными. Встроенный сервер — опция в настройках ПК.
- Десктоп: портал в окне без доступа к Node (`contextIsolation`, `sandbox`, `nodeIntegration: false`). Портал получает только `window.kuDesktop` (`preload.js`). IPC настроек принимается только от окна настроек (`fromSettings`). Новые разрешения — через `setupPermissions()` и только для своего origin.
- Android: всё, чего нет в WebView, — через `window.KUApp` (`WebBridge.java`) и `assets/bridge.js`. Каждый метод моста проверяет страницу (`trusted()` / `fromApp()`); смена сервера — только со страниц приложения.
- Тексты интерфейса — по-русски, как в портале; цвета — переменные из `public/style.css` (`desktop/ui/ui.css` повторяет их).

## Проверка

1. `node --test tests/*.test.js` — проходит.
2. `node --check` для `desktop/*.js`, `desktop/ui/*.js`, `mobile/android/app/src/main/assets/**/*.js`.
3. Сборка — GitHub Actions (`.github/workflows/build.yml`): desktop на трёх ОС, `./gradlew assembleRelease`.
