# KU Portal Desktop

Приложения портала Kozybayev University — **для компьютера** и **для телефона**. Они открывают тот же сайт [ku-portal.onrender.com](https://ku-portal.onrender.com): те же аккаунты, оценки, расписание, рейтинг, AI-помощник, онлайн-экзамен и настройки кабинета. Сайт, программа на ПК и приложение на телефоне связаны общими данными: что сделано в одном месте — видно в другом.

## ⬇️ Скачать

### 💻 Для компьютера

| Система | Файл |
|---|---|
| **Windows** (установщик) | [KU-Portal-Setup.exe](https://github.com/SAKEDA-hub/ku-portal-desktop/releases/latest/download/KU-Portal-Setup.exe) |
| Windows (без установки) | [KU-Portal-Portable.exe](https://github.com/SAKEDA-hub/ku-portal-desktop/releases/latest/download/KU-Portal-Portable.exe) |
| **macOS** Apple Silicon (M1–M4) | [KU-Portal-mac-arm64.dmg](https://github.com/SAKEDA-hub/ku-portal-desktop/releases/latest/download/KU-Portal-mac-arm64.dmg) |
| macOS Intel | [KU-Portal-mac-x64.dmg](https://github.com/SAKEDA-hub/ku-portal-desktop/releases/latest/download/KU-Portal-mac-x64.dmg) |
| **Linux** | [KU-Portal-linux.AppImage](https://github.com/SAKEDA-hub/ku-portal-desktop/releases/latest/download/KU-Portal-linux.AppImage) |

### 📱 Для телефона

| Система | Файл |
|---|---|
| **Android** 7.0+ | [KU-Portal.apk](https://github.com/SAKEDA-hub/ku-portal-desktop/releases/latest/download/KU-Portal.apk) |
| iPhone | отдельного приложения нет — откройте [сайт](https://ku-portal.onrender.com) в Safari → «Поделиться» → «На экран Домой» |

Все версии: [Releases](https://github.com/SAKEDA-hub/ku-portal-desktop/releases). Файлы собираются и публикуются автоматически после каждого обновления репозитория (GitHub Actions).

> Репозиторий приватный — ссылки открываются только у тех, у кого есть доступ к нему. Чтобы скачивать мог любой, сделайте репозиторий публичным (Settings → General → Danger Zone → Change visibility).

**Установка**
- **Windows** — запустить `KU-Portal-Setup.exe`. Программа без платного сертификата, поэтому SmartScreen предупредит: «Подробнее» → «Выполнить в любом случае».
- **macOS** — открыть `.dmg`, перетащить KU Portal в «Программы». При первом запуске: правый клик → «Открыть» → «Открыть».
- **Linux** — `chmod +x KU-Portal-linux.AppImage && ./KU-Portal-linux.AppImage`.
- **Android** — скачать `KU-Portal.apk` на телефон, открыть, разрешить установку из этого источника. При первом запуске выбрать «Сайт портала» → «Подключиться».

## Как это работает

- **По умолчанию — сайт.** Окно программы и приложение на телефоне показывают [ku-portal.onrender.com](https://ku-portal.onrender.com) — всё работает так же, как в браузере, включая переход в онлайн-экзамен (`/exam-sync/`) и обратно кнопкой «KU Portal». Бесплатный хостинг после простоя просыпается до минуты — в это время показывается экран ожидания.
- **Код сайта не изменён.** Папка `app/` — точная копия [ku-portal](https://github.com/SAKEDA-hub/ku-portal) (проверяется тестом).
- **Встроенный сервер (по желанию, только ПК).** В настройках программы можно включить запуск портала прямо на компьютере (без интернета, с AI через LM Studio на этом ПК). У встроенного сервера свои аккаунты и данные — с сайтом они не связаны; телефон может подключиться к нему по Wi-Fi.

## Компьютер (desktop/)

Окно с порталом, меню на русском: «Назад/Вперёд», «Обновить», масштаб, «Открыть портал в браузере». Ссылки на сторонние сайты открываются в браузере, скачанные файлы (экспорт данных, CSV ведомости) — через обычный диалог сохранения, уведомления портала и онлайн-экзамена — системные.

**Файл → Настройки приложения** (`Ctrl+,`):
- **откуда брать портал** — «Сайт портала» (по умолчанию, адрес можно сменить) или «Встроенный сервер»;
- для встроенного сервера: порт (3000, если занят — следующий), тестовые аккаунты (`teacher@demo.kz`, `student@demo.kz`, `student2@demo.kz` / `1234`; онлайн-экзамен `user` / `1`, `teacher` / `admin`), адрес для телефона, **AI-помощник** — адрес LM Studio, модель, ключ (шифруется средствами ОС), «Проверить подключение»;
- данные встроенного сервера — в папке пользователя (`…/KU Portal/portal/data`), не удаляются при обновлении программы: **Файл → Открыть папку с данными**; журнал — **Файл → Открыть журнал сервера**.

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
- **Компьютер с KU Portal Desktop** — адрес вида `192.168.1.10:3000`, если на ПК включён встроенный сервер (адрес — в его настройках); AI-помощник тогда работает через LM Studio на ПК;
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

- `app/` — исходники сайта из [ku-portal](https://github.com/SAKEDA-hub/ku-portal) (`server.js`, `public/`, `exam-sync/`, база AI `data/ku-corpus.json.gz`). Код не изменён ни на строку; программа копирует его в папку пользователя и запускает как `node server.js`. Обновить из сайта: `./scripts/sync-app.sh ../ku-portal`.
- `desktop/` — Electron: `main.js` (встроенный сервер, окна, меню, безопасность), `config.js` (настройки), `ui/` (настройки, экраны ожидания и ошибки).
- `mobile/android/` — Android-приложение: `MainActivity.java`, `WebBridge.java`, `assets/` (экран подключения, мост `bridge.js`).
- `tests/` — `node --test tests/*.test.js`: настройки, встроенный сервер, главный процесс десктопа (на заглушке Electron).
- `.github/workflows/build.yml` — проверки, сборка Windows/macOS/Linux и APK, публикация в Releases после каждого push в `main`; журналы сборки — ветки `ci/*`.
