package com.lottery.picker;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.Bridge;
import android.os.Bundle;
import android.webkit.WebView;
import android.view.View;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // 修正：Capacitor 在 WebView < 140 时把 systemBars inset 先清零再算安全区，
        // 导致注入的 --safe-area-inset-* 恒为 0（已知 bug），env(safe-area-inset-*) 也因
        // Chromium bug 返回 0。这里用 WindowInsetsCompat 读取真实状态栏/导航栏高度，
        // 写入自定义 CSS 变量 --lp-safe-top / --lp-safe-bottom，供全局 CSS 预留安全区，
        // 避免顶栏被系统状态栏遮挡。WebView ≥ 140 时原生 env() 生效，本注入同样安全兼容。
        View decor = getWindow().getDecorView();
        decor.post(this::injectSafeArea);
        ViewCompat.setOnApplyWindowInsetsListener(decor, (v, insets) -> {
            injectSafeArea();
            return insets;
        });
    }

    private void injectSafeArea() {
        Bridge bridge = getBridge();
        if (bridge == null) return;
        WebView wv = bridge.getWebView();
        if (wv == null) return;
        WindowInsetsCompat wi = ViewCompat.getRootWindowInsets(getWindow().getDecorView());
        if (wi == null) return;
        float density = getResources().getDisplayMetrics().density;
        // 用 statusBars() | displayCutout() 而非 systemBars()：
        // systemBars() 含 captionBar/waterfall 等"非视觉"区域，在某些 AVD 上会把顶留白撑到
        // 50+dp，导致 header 视觉上空太多。这里只取状态栏+刘海，保留避让但不撑高。
        int topPx = wi.getInsets(WindowInsetsCompat.Type.statusBars() | WindowInsetsCompat.Type.displayCutout()).top;
        int bottomPx = wi.getInsets(WindowInsetsCompat.Type.systemBars()).bottom;
        float topDp = topPx / density;
        float bottomDp = bottomPx / density;
        // 打印真实测量的状态栏/导航栏高度，便于 adb logcat 验证注入值是否与系统真实 inset 一致
        android.util.Log.d("LpSafeArea", "insets top=" + topPx + "px(" + topDp + "dp) bottom=" + bottomPx + "px(" + bottomDp + "dp) density=" + density);
        final String top = topDp + "px";
        final String bottom = bottomDp + "px";
        wv.post(() -> wv.evaluateJavascript(
            "try{var d=document.documentElement;if(d){d.style.setProperty('--lp-safe-top','" + top + "');d.style.setProperty('--lp-safe-bottom','" + bottom + "');}}catch(e){}",
            null));
    }
}
