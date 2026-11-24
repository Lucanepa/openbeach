package com.openvolley.beach;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * The page's "Exit" after it asked "Exit OpenBeach?" on the Back button
 * (src_beach/utils_beach/appLifecycle_beach.js; MainActivity.handleBackButton).
 * A local plugin, not @capacitor/app: one method, no new dependency.
 */
@CapacitorPlugin(name = "OpenBeachApp")
public class AppExitPlugin extends Plugin {

    @PluginMethod
    public void exitApp(PluginCall call) {
        call.resolve();
        getActivity().runOnUiThread(() -> getActivity().finish());
    }
}
