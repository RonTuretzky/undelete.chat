package chat.undelete.app;

import android.content.ComponentName;
import android.content.Intent;
import android.provider.Settings;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONObject;

/** Bridge between the web app and the on-device notification archive. */
@CapacitorPlugin(name = "DeviceArchive")
public class DeviceArchivePlugin extends Plugin {
    private boolean listenerEnabled() {
        String flat = Settings.Secure.getString(getContext().getContentResolver(), "enabled_notification_listeners");
        if (flat == null) return false;
        ComponentName ours = new ComponentName(getContext(), NotificationCapture.class);
        for (String entry : flat.split(":")) {
            ComponentName name = ComponentName.unflattenFromString(entry);
            if (name != null && name.equals(ours)) return true;
        }
        return false;
    }

    @PluginMethod
    public void status(PluginCall call) {
        JSObject result = new JSObject();
        result.put("supported", true);
        result.put("enabled", listenerEnabled());
        DeviceArchiveStore store = DeviceArchiveStore.get(getContext());
        result.put("all", store.counts(false));
        result.put("deleted", store.counts(true));
        call.resolve(result);
    }

    @PluginMethod
    public void openSettings(PluginCall call) {
        Intent intent = new Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(intent);
        call.resolve();
    }

    @PluginMethod
    public void list(PluginCall call) {
        try {
            JSONObject result = DeviceArchiveStore.get(getContext()).list(call.getInt("offset", 0), Math.min(200, call.getInt("limit", 50)), call.getString("query", ""), Boolean.TRUE.equals(call.getBoolean("deletedOnly", false)));
            call.resolve(JSObject.fromJSONObject(result));
        } catch (Exception e) { call.reject("Could not read the device archive."); }
    }

    @PluginMethod
    public void remove(PluginCall call) {
        Long id = call.getLong("id");
        if (id == null) { call.reject("Missing id"); return; }
        JSObject result = new JSObject();
        result.put("removed", DeviceArchiveStore.get(getContext()).remove(id));
        call.resolve(result);
    }

    @PluginMethod
    public void clear(PluginCall call) {
        JSObject result = new JSObject();
        result.put("removed", DeviceArchiveStore.get(getContext()).clear());
        call.resolve(result);
    }

    @PluginMethod
    public void purge(PluginCall call) {
        JSObject result = new JSObject();
        result.put("removed", DeviceArchiveStore.get(getContext()).purge(Math.max(1, call.getInt("days", 90)), !Boolean.FALSE.equals(call.getBoolean("keepDeleted", true))));
        call.resolve(result);
    }
}
