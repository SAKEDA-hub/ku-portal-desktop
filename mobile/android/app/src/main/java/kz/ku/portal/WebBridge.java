package kz.ku.portal;

import android.webkit.JavascriptInterface;

/**
 * Объект window.KUApp в WebView. Методы вызываются из потока JavaBridge, поэтому каждый
 * проверяет, что запрос пришёл со своей страницы: экраны приложения (assets) или выбранный сервер.
 * Сменить сервер можно только с экрана «Подключение».
 */
final class WebBridge {
    private final MainActivity a;

    WebBridge(MainActivity activity) {
        this.a = activity;
    }

    private boolean fromApp() {
        return MainActivity.isAsset(a.currentUrl);
    }

    private boolean trusted() {
        return fromApp() || a.isServerUrl(a.currentUrl);
    }

    /* ---------- экран «Подключение» ---------- */

    @JavascriptInterface
    public String getServer() {
        if (!fromApp()) return "";
        return a.server == null ? "" : a.server;
    }

    @JavascriptInterface
    public String defaultServer() {
        return BuildConfig.DEFAULT_SERVER;
    }

    @JavascriptInterface
    public String version() {
        return BuildConfig.VERSION_NAME;
    }

    @JavascriptInterface
    public void testServer(String base) {
        if (!fromApp() || base == null) return;
        String o = MainActivity.originOf(base);
        if (o.isEmpty() || !(o.startsWith("http://") || o.startsWith("https://"))) return;
        a.testServer(o);
    }

    @JavascriptInterface
    public void connect(String base) {
        if (!fromApp() || base == null) return;
        String o = MainActivity.originOf(base);
        if (o.isEmpty() || !(o.startsWith("http://") || o.startsWith("https://"))) return;
        a.runOnUiThread(() -> {
            a.saveServer(o);
            a.openServer();
        });
    }

    @JavascriptInterface
    public void forgetServer() {
        if (!fromApp()) return;
        a.runOnUiThread(a::forgetServer);
    }

    /** С портала: «Сменить сервер» (открывает экран подключения, сервер не стирается) */
    @JavascriptInterface
    public void openConnect() {
        if (!trusted()) return;
        a.runOnUiThread(() -> a.openConnect(null));
    }

    /* ---------- уведомления (Notification API для портала и онлайн-экзамена) ---------- */

    @JavascriptInterface
    public String notifPermission() {
        if (!trusted()) return "denied";
        return a.notifPermission();
    }

    @JavascriptInterface
    public void requestNotifPermission() {
        if (!trusted()) return;
        a.requestNotifPermission();
    }

    @JavascriptInterface
    public void showNotification(String title, String body, String tag) {
        if (!trusted()) return;
        a.runOnUiThread(() -> a.showNotification(
                title == null ? "KU Portal" : title.substring(0, Math.min(title.length(), 200)),
                body == null ? "" : body.substring(0, Math.min(body.length(), 1000)),
                tag == null ? "" : tag.substring(0, Math.min(tag.length(), 100))));
    }

    @JavascriptInterface
    public void cancelNotification(String tag) {
        if (!trusted()) return;
        a.runOnUiThread(() -> a.cancelNotification(tag));
    }

    /* ---------- файлы ---------- */

    @JavascriptInterface
    public void saveFile(String name, String mime, String base64) {
        if (!trusted() || base64 == null || base64.length() > 30_000_000) return;
        String safe = name == null ? "" : name.replaceAll("[\\\\/:*?\"<>|]", "_");
        a.saveFile(safe.substring(0, Math.min(safe.length(), 120)), mime, base64);
    }

    @JavascriptInterface
    public void toast(String msg) {
        if (!trusted() || msg == null) return;
        a.toast(msg.substring(0, Math.min(msg.length(), 200)));
    }
}
