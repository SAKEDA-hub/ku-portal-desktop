# Инструкции для ИИ-агента

Репозиторий — приложения для портала KU: `desktop/` (Electron) и `mobile/android/` (Android WebView). Сам портал (`app/`) — копия github.com/SAKEDA-hub/ku-portal; его правила — в `app/` не дублируются, смотрите AGENTS.md исходного репозитория.

- `app/` не править по существу: менять сайт нужно в ku-portal, затем `./scripts/sync-app.sh ../ku-portal`. Допустимый патч — только `KU_DATA_DIR`, `HOST`, `module.exports` в `app/server.js`.
- Десктоп: портал в окне без доступа к Node (`contextIsolation`, `sandbox`, `nodeIntegration: false`). Портал получает только `window.kuDesktop` (`preload.js`). IPC настроек принимается только от окна настроек (`fromSettings`). Новые разрешения — через `setupPermissions()` и только для своего origin.
- Android: всё, чего нет в WebView, — через `window.KUApp` (`WebBridge.java`) и `assets/bridge.js`. Каждый метод моста проверяет страницу (`trusted()` / `fromApp()`); смена сервера — только со страниц приложения.
- Тексты интерфейса — по-русски, как в портале; цвета — переменные из `public/style.css` (`desktop/ui/ui.css` повторяет их).

## Проверка

1. `node --test tests/*.test.js` — проходит.
2. `node --check` для `desktop/*.js`, `desktop/ui/*.js`, `mobile/android/app/src/main/assets/**/*.js`.
3. Сборка — GitHub Actions (`.github/workflows/build.yml`): desktop на трёх ОС, `./gradlew assembleRelease`.
