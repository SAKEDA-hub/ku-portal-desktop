# KU Portal Desktop

Приложения портала Kozybayev University: **отдельно для компьютера** (Windows / macOS / Linux) и **для телефона** (Android). Работает всё, что есть на сайте [ku-portal](https://github.com/SAKEDA-hub/ku-portal): вход и регистрация, оценки, расписание, рейтинг, AI-помощник (Gemma), переход в онлайн-экзамен, все настройки кабинета (тема, язык, уведомления, безопасность, 2FA, сеансы, экспорт данных).

| | Компьютер | Телефон |
|---|---|---|
| Папка | `desktop/` (Electron) | `mobile/android/` (Android, WebView) |
| Портал | **встроенный сервер** — тот же `server.js`, работает без интернета; или режим «Сайт» | сайт портала **или** компьютер с KU Portal Desktop по Wi-Fi |
| AI-помощник | LM Studio на этом ПК (`http://localhost:1234`) или в сети, настраивается в программе | через сервер, к которому подключён телефон (сайт или ПК) |
| Файл | `KU-Portal-Setup-*.exe`, `KU-Portal-Portable-*.exe`, `.dmg`, `.AppImage` | `KU-Portal.apk` |

## Где взять готовые программы

Сборка идёт автоматически в GitHub Actions после каждого push в `main`:
**Actions → Build → последний запуск → Artifacts** (`KU-Portal-desktop-Windows`, `-macOS`, `-Linux`, `KU-Portal-android`).

Для версии с релизом поставьте тег — установщики появятся в **Releases**:

```bash
git tag v1.0.1 && git push origin v1.0.1
```

Установка:
- **Windows** — `KU-Portal-Setup-*.exe` (или Portable без установки). Программа не подписана сертификатом: SmartScreen → «Подробнее» → «Выполнить в любом случае».
- **macOS** — `.dmg`; при первом запуске: правый клик по приложению → «Открыть» (нет подписи Apple).
- **Linux** — `chmod +x KU-Portal-*.AppImage && ./KU-Portal-*.AppImage`.
- **Android** — скачать `KU-Portal.apk` на телефон, открыть, разрешить установку из этого источника. Android 7.0+.
- **iPhone** — отдельного приложения нет (нужен Mac и аккаунт Apple Developer); сайт портала открывается в Safari → «Поделиться» → «На экран Домой».

## Компьютер (desktop/)

При запуске внутри программы стартует сервер портала (`app/server.js`) и открывается окно с порталом.

- **Данные** (аккаунты, оценки, расписание, сеансы, онлайн-экзамен) — в папке пользователя, не удаляются при обновлении: Windows `%APPDATA%\KU Portal\data`, macOS `~/Library/Application Support/KU Portal/data`, Linux `~/.config/KU Portal/data`. Меню **Файл → Открыть папку с данными**.
- Тестовые аккаунты: `teacher@demo.kz`, `student@demo.kz`, `student2@demo.kz`, пароль `1234` (можно выключить в настройках). Онлайн-экзамен: `user` / `1`, `teacher` / `admin`.
- **Файл → Настройки приложения** (`Ctrl+,`):
  - откуда брать портал — встроенный сервер или сайт (`https://ku-portal.onrender.com` или свой адрес);
  - порт (по умолчанию 3000; если занят — следующий свободный);
  - **Доступ с телефона по Wi-Fi** — сервер становится доступен в локальной сети, адрес показывается там же и в **Справка → Подключить телефон**;
  - **AI-помощник**: адрес LM Studio, модель, ключ API (шифруется средствами ОС), кнопка «Проверить подключение».
- Журнал сервера: **Файл → Открыть журнал сервера**.

### AI-помощник

1. Установить [LM Studio](https://lmstudio.ai), загрузить модель Gemma (по умолчанию `google/gemma-4-e4b`, подойдёт похожая).
2. LM Studio → **Developer → Start Server** (порт 1234).
3. В KU Portal: Настройки → AI-помощник → «Проверить подключение». По умолчанию уже стоит `http://localhost:1234`.

LM Studio на другом компьютере — `http://192.168.x.x:1234` (в LM Studio включить «Serve on Local Network»), через Tailscale — `http://100.x.x.x:1234`, через туннель — `https://…`. Без запущенной модели портал работает, а помощник отвечает, что модель недоступна.

### Запуск из исходников

```bash
cd desktop
npm install
npm start            # окно с порталом
npm run dist         # установщик для текущей ОС → desktop/dist/
```

## Телефон (mobile/android/)

При первом запуске — экран «Где открыть портал»:
- **Сайт портала** — `https://ku-portal.onrender.com`, те же аккаунты, что в браузере;
- **Компьютер с KU Portal Desktop** — адрес вида `192.168.1.10:3000` (на ПК включить «Доступ с телефона»); AI-помощник тогда работает через LM Studio на ПК;
- **Другой адрес** — свой сервер.

Перед подключением приложение проверяет адрес и показывает, работает ли AI-помощник. Сменить сервер: «Назад» на главной → «Сменить сервер».

Что приложение добавляет к сайту (`assets/bridge.js`): системные уведомления Android вместо уведомлений браузера (новые оценки, расписание, открытие экзамена, вызов на speaking; Android 13+ спросит разрешение), сохранение файлов («Скачать мои данные», CSV ведомости, tests.json), выбор файлов (картинки и JSON в редакторе тестов), вибрация. Внешние ссылки открываются в браузере.

Уведомления приходят, пока приложение запущено (в том числе свёрнуто, пока Android его не выгрузил): портал опрашивает сервер раз в 30 с, push-сервера нет.

### Сборка APK вручную

Нужны JDK 17 и Android SDK (проще всего — Android Studio: File → Open → `mobile/android`).

```bash
cd mobile/android
./gradlew assembleRelease   # → app/build/outputs/apk/release/app-release.apk
```

**Подпись.** Без ключа релиз подписывается отладочным ключом сборщика — APK ставится, но ключ в CI каждый раз новый, поэтому новую версию придётся ставить после удаления старой. Чтобы обновления ставились поверх, создайте ключ один раз и добавьте секреты репозитория (Settings → Secrets and variables → Actions):

```bash
keytool -genkeypair -v -keystore ku.jks -alias ku -keyalg RSA -keysize 2048 -validity 10000
base64 -w0 ku.jks   # → ANDROID_KEYSTORE_BASE64
```

`ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`. Файл `ku.jks` не коммитить.

## Устройство репозитория

- `app/` — исходники сайта из [ku-portal](https://github.com/SAKEDA-hub/ku-portal) (`server.js`, `public/`, `exam-sync/`, база AI `data/ku-corpus.json.gz`). Изменения против сайта — три строки в `server.js`: папка данных `KU_DATA_DIR`, адрес `HOST`, `module.exports = server`. Обновить из сайта: `./scripts/sync-app.sh ../ku-portal`.
- `desktop/` — Electron: `main.js` (встроенный сервер, окна, меню, безопасность), `config.js` (настройки), `ui/` (настройки, экраны ожидания и ошибки).
- `mobile/android/` — Android-приложение: `MainActivity.java`, `WebBridge.java`, `assets/` (экран подключения, мост `bridge.js`).
- `tests/` — `node --test tests/*.test.js`: настройки, встроенный сервер, главный процесс десктопа (на заглушке Electron).
- `.github/workflows/build.yml` — проверки, сборка Windows/macOS/Linux и APK, релиз по тегу.
