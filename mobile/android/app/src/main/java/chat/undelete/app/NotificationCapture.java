package chat.undelete.app;

import android.app.Notification;
import android.app.Person;
import android.os.Bundle;
import android.os.Parcelable;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;

import java.util.Arrays;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;

/**
 * Reads messaging notifications and records them in the on-device archive.
 * Runs only after the user grants notification access in Android settings, and
 * only looks at the messaging apps listed here. It never sends anything anywhere.
 */
public class NotificationCapture extends NotificationListenerService {
    static final Set<String> PACKAGES = new HashSet<>(Arrays.asList(
        "com.whatsapp", "com.whatsapp.w4b", "org.telegram.messenger", "org.telegram.messenger.web", "org.thoughtcrime.securesms"));
    // Text a platform substitutes when a message is deleted for everyone.
    static final String[] DELETION_MARKERS = {
        "this message was deleted", "you deleted this message", "message deleted", "this message has been deleted",
        "mensaje eliminado", "este mensaje fue eliminado", "diese nachricht wurde gelöscht", "ce message a été supprimé",
        "questo messaggio è stato eliminato", "esta mensagem foi apagada", "это сообщение удалено", "此消息已删除", "הודעה זו נמחקה"
    };

    static boolean isDeletionMarker(CharSequence text) {
        if (text == null) return false;
        String t = text.toString().trim().toLowerCase(Locale.ROOT).replace("🚫", "").replace("🚫", "").trim();
        for (String marker : DELETION_MARKERS) if (t.equals(marker) || t.endsWith(marker)) return true;
        return false;
    }

    @Override
    public void onNotificationPosted(StatusBarNotification sbn) {
        try {
            if (sbn == null || !PACKAGES.contains(sbn.getPackageName())) return;
            Notification notification = sbn.getNotification();
            if (notification == null) return;
            Bundle extras = notification.extras;
            if (extras == null) return;
            DeviceArchiveStore store = DeviceArchiveStore.get(this);
            String pkg = sbn.getPackageName();
            CharSequence conversation = extras.getCharSequence(Notification.EXTRA_CONVERSATION_TITLE);
            CharSequence title = extras.getCharSequence(Notification.EXTRA_TITLE);
            boolean group = extras.getBoolean(Notification.EXTRA_IS_GROUP_CONVERSATION, false);
            String chat = conversation != null ? conversation.toString() : title != null ? title.toString() : "";
            Parcelable[] messages = extras.getParcelableArray(Notification.EXTRA_MESSAGES);
            if (messages != null && messages.length > 0) {
                for (Parcelable p : messages) {
                    if (!(p instanceof Bundle)) continue;
                    Bundle m = (Bundle) p;
                    CharSequence text = m.getCharSequence("text");
                    long time = m.getLong("time", sbn.getPostTime());
                    String sender = senderOf(m, chat);
                    if (text == null && !isDeletionMarker(text)) continue;
                    String value = text == null ? "" : text.toString();
                    store.record(pkg, chat, sender, time, value, group, isDeletionMarker(text));
                }
                return;
            }
            // Summary-style notifications (no per-message list): one row keyed by post time.
            CharSequence text = extras.getCharSequence(Notification.EXTRA_TEXT);
            if (text == null || (notification.flags & Notification.FLAG_GROUP_SUMMARY) != 0) return;
            store.record(pkg, chat, chat, sbn.getPostTime(), text.toString(), group, isDeletionMarker(text));
        } catch (Exception ignored) {
            // A malformed notification must never take the listener down.
        }
    }

    private static String senderOf(Bundle message, String fallback) {
        Object person = message.get("sender_person");
        if (person instanceof Person) { CharSequence name = ((Person) person).getName(); if (name != null && name.length() > 0) return name.toString(); }
        CharSequence sender = message.getCharSequence("sender");
        if (sender != null && sender.length() > 0) return sender.toString();
        return fallback;
    }

    @Override
    public void onNotificationRemoved(StatusBarNotification sbn) {
        // Removal alone is ambiguous (the user may simply have read the chat), so it is not treated as a deletion.
    }
}
