package kz.ku.portal;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.AlertDialog;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.util.Base64;
import android.view.View;
import android.webkit.CookieManager;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

/**
 * KU Portal для телефона.
 *
 * Приложение открывает тот же портал, что и сайт (сервер с API, AI-помощником и онлайн-экзаменом):
 *  - сайт университета (по умолчанию https://ku-portal.onrender.com) или
 *  - компьютер с KU Portal Desktop в той же сети Wi-Fi (http://192.168.x.x:3000).
 * Поэтому записи, оценки, расписание, AI-помощник, переход в онлайн-экзамен и все настройки
 * работают так же, как на сайте. Чего нет у WebView «из коробки», добавляет мост (assets/bridge.js):
 * системные уведомления вместо Notification API браузера, сохранение файлов (экспорт JSON,
 * CSV ведомости), выбор файлов (картинки и JSON в редакторе тестов).
 */
public class MainActivity extends Activity {

    static final String PREFS = "ku_portal";
    static final String KEY_SERVER = "server_url";
    static final String KEY_NOTIF_ASKED = "notif_asked";
    static final String ASSET_BASE = "file:///android_asset/ui/";
    static final String CHANNEL_ID = "ku_portal";

    private static final int REQ_FILE_CHOOSER = 11;
    private static final int REQ_SAVE_FILE = 12;
    private static final int REQ_NOTIF_PERMISSION = 13;

    WebView web;
    SharedPreferences prefs;

    /** URL страницы, открытой сейчас (обновляется в onPageStarted) — для проверок в мосте */
    volatile String currentUrl = "";
    /** Сервер, с которым работает приложение (origin без завершающего /) */
    volatile String server = null;

    private ValueCallback<Uri[]> fileCallback;
    private byte[] pendingSave;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        prefs = getSharedPreferences(PREFS, MODE_PRIVATE);
        server = prefs.getString(KEY_SERVER, null);
        createNotificationChannel();

        // отладка WebView (Chrome DevTools) — только в отладочной сборке, для автопроверок
        if ((getApplicationInfo().flags & android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE) != 0) {
            WebView.setWebContentsDebuggingEnabled(true);
        }
        web = new WebView(this);
        web.setBackgroundColor(0xFFF8F8F7);
        setContentView(web);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);          // localStorage: токен входа, тема, язык, настройки
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false); // звук уведомлений / вызова на speaking
        s.setAllowFileAccess(true);            // только для своих экранов из assets
        s.setAllowContentAccess(true);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        s.setSupportMultipleWindows(false);    // «открыть в новой вкладке» — в этом же окне
        s.setJavaScriptCanOpenWindowsAutomatically(true);
        s.setUserAgentString(s.getUserAgentString() + " KUPortalApp/" + BuildConfig.VERSION_NAME);
        CookieManager.getInstance().setAcceptCookie(true);

        web.addJavascriptInterface(new WebBridge(this), "KUApp");
        web.setWebViewClient(new Client());
        web.setWebChromeClient(new Chrome());

        if (savedInstanceState != null) {
            web.restoreState(savedInstanceState);
        }
        if (savedInstanceState == null || web.getUrl() == null) {
            if (server == null) openConnect(null);
            else openServer();
        }
    }

    /* ------------------------------ навигация ------------------------------ */

    void openConnect(String error) {
        String url = ASSET_BASE + "connect.html";
        if (error != null) url += "?error=" + Uri.encode(error);
        web.loadUrl(url);
    }

    /** Сначала экран ожидания (Render «просыпается» до минуты), затем — сам портал */
    void openServer() {
        if (server == null) { openConnect(null); return; }
        web.loadUrl(ASSET_BASE + "loading.html?url=" + Uri.encode(server));
    }

    static String originOf(String url) {
        try {
            Uri u = Uri.parse(url);
            if (u.getScheme() == null || u.getHost() == null) return "";
            String o = u.getScheme().toLowerCase() + "://" + u.getHost().toLowerCase();
            if (u.getPort() != -1) o += ":" + u.getPort();
            return o;
        } catch (Exception e) {
            return "";
        }
    }

    boolean isServerUrl(String url) {
        return server != null && originOf(url).equals(originOf(server));
    }

    static boolean isAsset(String url) {
        return url != null && url.startsWith(ASSET_BASE);
    }

    void saveServer(String url) {
        server = url;
        prefs.edit().putString(KEY_SERVER, url).apply();
    }

    void forgetServer() {
        server = null;
        prefs.edit().remove(KEY_SERVER).apply();
    }

    private class Client extends WebViewClient {
        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) {
            String url = req.getUrl().toString();
            if (isAsset(url) || isServerUrl(url)) return false;
            String scheme = req.getUrl().getScheme();
            if ("about".equals(scheme) || "blob".equals(scheme) || "data".equals(scheme)) return false;
            // внешние ссылки (ku.edu.kz, LM Studio, почта, телефон) — в браузере/системе
            try {
                startActivity(new Intent(Intent.ACTION_VIEW, req.getUrl()));
            } catch (ActivityNotFoundException e) {
                toast("Нет приложения, чтобы открыть ссылку");
            }
            return true;
        }

        @Override
        public void onPageStarted(WebView view, String url, Bitmap favicon) {
            currentUrl = url == null ? "" : url;
        }

        @Override
        public void onPageCommitVisible(WebView view, String url) {
            currentUrl = url == null ? "" : url;
            injectBridge(); // раньше, чем onPageFinished: портал проверяет Notification при отрисовке
        }

        @Override
        public void onPageFinished(WebView view, String url) {
            currentUrl = url == null ? "" : url;
            injectBridge();
        }

        @Override
        public void onReceivedError(WebView view, WebResourceRequest req, WebResourceError err) {
            if (!req.isForMainFrame()) return;
            if (isAsset(req.getUrl().toString())) return;
            openConnect("Нет соединения с " + server + " (" + err.getDescription() + ")");
        }
    }

    private class Chrome extends WebChromeClient {
        @Override
        public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
            if (fileCallback != null) fileCallback.onReceiveValue(null);
            fileCallback = callback;
            try {
                startActivityForResult(params.createIntent(), REQ_FILE_CHOOSER);
            } catch (ActivityNotFoundException e) {
                fileCallback = null;
                toast("Нет приложения для выбора файла");
                return false;
            }
            return true;
        }
    }

    /** Подключает assets/bridge.js (уведомления, сохранение файлов) к открытой странице */
    void injectBridge() {
        if (!(isAsset(currentUrl) || isServerUrl(currentUrl))) return;
        try (InputStream in = getAssets().open("bridge.js")) {
            byte[] buf = new byte[in.available()];
            int n = in.read(buf);
            String js = new String(buf, 0, Math.max(n, 0), StandardCharsets.UTF_8);
            web.evaluateJavascript(js, null);
        } catch (Exception e) {
            // без моста портал работает, только без системных уведомлений и сохранения файлов
        }
    }

    void callJs(String fn, String jsonArg) {
        runOnUiThread(() -> web.evaluateJavascript("window." + fn + " && window." + fn + "(" + jsonArg + ")", null));
    }

    /* ------------------------------ кнопка «Назад» ------------------------------ */

    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        String url = web.getUrl();
        if (web.canGoBack() && !isAsset(url)) {
            web.goBack();
            return;
        }
        if (isAsset(url) || server == null) {
            super.onBackPressed();
            return;
        }
        new AlertDialog.Builder(this)
                .setTitle("KU Portal")
                .setMessage("Сервер: " + server)
                .setPositiveButton("Выйти", (d, w) -> finish())
                .setNeutralButton("Сменить сервер", (d, w) -> openConnect(null))
                .setNegativeButton("Отмена", null)
                .show();
    }

    /* ------------------------------ проверка сервера ------------------------------ */

    /** Проверяет, что по адресу отвечает KU Portal (GET /api/ai/status), и сообщает в JS. */
    void testServer(final String base) {
        new Thread(() -> {
            JSONObject res = new JSONObject();
            HttpURLConnection c = null;
            try {
                c = (HttpURLConnection) new URL(base + "/api/ai/status").openConnection();
                c.setConnectTimeout(20000);
                c.setReadTimeout(80000); // бесплатный Render просыпается до минуты
                c.setRequestProperty("Accept", "application/json");
                int code = c.getResponseCode();
                InputStream in = code < 400 ? c.getInputStream() : c.getErrorStream();
                StringBuilder sb = new StringBuilder();
                if (in != null) {
                    try (BufferedReader r = new BufferedReader(new InputStreamReader(in, StandardCharsets.UTF_8))) {
                        String line;
                        while ((line = r.readLine()) != null && sb.length() < 20000) sb.append(line);
                    }
                }
                JSONObject j = new JSONObject(sb.toString());
                if (code != 200 || !j.has("online")) throw new Exception("по адресу отвечает не KU Portal (HTTP " + code + ")");
                res.put("ok", true);
                res.put("aiOnline", j.optBoolean("online"));
                res.put("model", j.optString("model"));
                res.put("reason", j.optString("reason"));
            } catch (Exception e) {
                try {
                    res.put("ok", false);
                    String m = e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage();
                    if (e instanceof org.json.JSONException) m = "по адресу отвечает не KU Portal";
                    res.put("message", m);
                } catch (Exception ignored) { }
            } finally {
                if (c != null) c.disconnect();
            }
            callJs("__kuTestResult", res.toString());
        }).start();
    }

    /* ------------------------------ уведомления ------------------------------ */

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationChannel ch = new NotificationChannel(CHANNEL_ID, getString(R.string.notif_channel), NotificationManager.IMPORTANCE_HIGH);
        ch.setDescription(getString(R.string.notif_channel_desc));
        ch.enableVibration(true);
        NotificationManager nm = getSystemService(NotificationManager.class);
        if (nm != null) nm.createNotificationChannel(ch);
    }

    String notifPermission() {
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= 33) {
            if (checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED) {
                return nm != null && nm.areNotificationsEnabled() ? "granted" : "denied";
            }
            boolean asked = prefs.getBoolean(KEY_NOTIF_ASKED, false);
            return asked && !shouldShowRequestPermissionRationale(Manifest.permission.POST_NOTIFICATIONS) ? "denied" : "default";
        }
        return nm == null || nm.areNotificationsEnabled() ? "granted" : "denied";
    }

    void requestNotifPermission() {
        runOnUiThread(() -> {
            String p = notifPermission();
            if (Build.VERSION.SDK_INT >= 33 && "default".equals(p)) {
                prefs.edit().putBoolean(KEY_NOTIF_ASKED, true).apply();
                requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, REQ_NOTIF_PERMISSION);
            } else {
                callJs("__kuPermResult", JSONObject.quote(p));
            }
        });
    }

    void showNotification(String title, String body, String tag) {
        if (!"granted".equals(notifPermission())) return;
        Intent open = new Intent(this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pi = PendingIntent.getActivity(this, 0, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        android.app.Notification.Builder b = Build.VERSION.SDK_INT >= 26
                ? new android.app.Notification.Builder(this, CHANNEL_ID)
                : new android.app.Notification.Builder(this);
        b.setSmallIcon(R.drawable.ic_stat_ku)
                .setContentTitle(title)
                .setContentText(body)
                .setStyle(new android.app.Notification.BigTextStyle().bigText(body))
                .setColor(0xFF05A4BA)
                .setAutoCancel(true)
                .setContentIntent(pi);
        if (Build.VERSION.SDK_INT < 26) b.setPriority(android.app.Notification.PRIORITY_HIGH).setDefaults(android.app.Notification.DEFAULT_ALL);
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null) nm.notify(tag == null || tag.isEmpty() ? "ku" : tag, 1, b.build());
    }

    void cancelNotification(String tag) {
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null) nm.cancel(tag == null || tag.isEmpty() ? "ku" : tag, 1);
    }

    /* ------------------------------ сохранение файлов ------------------------------ */

    /** Файл из портала (blob/data-ссылка с download) — пользователь выбирает, куда сохранить */
    void saveFile(String name, String mime, String base64) {
        try {
            pendingSave = Base64.decode(base64, Base64.DEFAULT);
        } catch (IllegalArgumentException e) {
            toast("Не удалось сохранить файл");
            return;
        }
        runOnUiThread(() -> {
            Intent i = new Intent(Intent.ACTION_CREATE_DOCUMENT);
            i.addCategory(Intent.CATEGORY_OPENABLE);
            i.setType(mime == null || mime.isEmpty() ? "application/octet-stream" : mime);
            i.putExtra(Intent.EXTRA_TITLE, name == null || name.isEmpty() ? "ku-portal-file" : name);
            try {
                startActivityForResult(i, REQ_SAVE_FILE);
            } catch (ActivityNotFoundException e) {
                pendingSave = null;
                toast("Нет приложения для сохранения файлов");
            }
        });
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == REQ_FILE_CHOOSER) {
            if (fileCallback != null) {
                fileCallback.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(resultCode, data));
                fileCallback = null;
            }
        } else if (requestCode == REQ_SAVE_FILE) {
            byte[] bytes = pendingSave;
            pendingSave = null;
            if (resultCode != RESULT_OK || data == null || data.getData() == null || bytes == null) return;
            try (OutputStream out = getContentResolver().openOutputStream(data.getData())) {
                if (out == null) throw new Exception("нет доступа");
                out.write(bytes);
                toast("Файл сохранён");
            } catch (Exception e) {
                toast("Не удалось сохранить файл");
            }
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == REQ_NOTIF_PERMISSION) {
            callJs("__kuPermResult", JSONObject.quote(notifPermission()));
        }
    }

    /* ------------------------------ жизненный цикл ------------------------------ */

    @Override
    protected void onPause() {
        super.onPause();
        // web.onPause() переводит страницу в «скрытую» (портал тогда шлёт системные уведомления),
        // таймеры JS не останавливаем — опрос уведомлений продолжается, пока система не выгрузит приложение
        web.onPause();
        CookieManager.getInstance().flush();
    }

    @Override
    protected void onResume() {
        super.onResume();
        web.onResume();
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        web.saveState(outState);
    }

    @Override
    protected void onDestroy() {
        if (web != null) {
            web.setVisibility(View.GONE);
            web.destroy();
        }
        super.onDestroy();
    }

    void toast(String msg) {
        runOnUiThread(() -> Toast.makeText(this, msg, Toast.LENGTH_SHORT).show());
    }
}
