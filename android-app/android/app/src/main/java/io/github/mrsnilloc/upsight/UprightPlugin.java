package io.github.mrsnilloc.upsight;

import android.content.pm.ActivityInfo;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Lets the web side choose whether the screen may turn with the phone.
 * JS: Capacitor.Plugins.Upright.set({ free: true })  -> turns with the phone (follows the phone's auto-rotate setting)
 *     Capacitor.Plugins.Upright.set({ free: false }) -> held upright
 * Used by js/platform.js setRotation(); which screens may turn is in js/config.js (rotatingViews).
 */
@CapacitorPlugin(name = "Upright")
public class UprightPlugin extends Plugin {
    @PluginMethod
    public void set(PluginCall call) {
        final boolean free = Boolean.TRUE.equals(call.getBoolean("free", false));
        getActivity().runOnUiThread(() -> getActivity().setRequestedOrientation(
            free ? ActivityInfo.SCREEN_ORIENTATION_USER : ActivityInfo.SCREEN_ORIENTATION_PORTRAIT));
        call.resolve();
    }
}
