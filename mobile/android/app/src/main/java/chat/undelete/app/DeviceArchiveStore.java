package chat.undelete.app;

import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteOpenHelper;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * Device mode storage. Messages read from notifications live only in this
 * app-private database on the phone; nothing here is ever uploaded. Each row is
 * one message identified by app, conversation, sender, and the message time the
 * notification carries. A later notification for the same key with different
 * text is an edit; text that matches the platform's deletion marker is a
 * deletion, and the original text is kept.
 */
public class DeviceArchiveStore extends SQLiteOpenHelper {
    private static final String NAME = "device-archive.db";
    private static final int VERSION = 1;
    private static DeviceArchiveStore instance;

    public static synchronized DeviceArchiveStore get(Context context) {
        if (instance == null) instance = new DeviceArchiveStore(context.getApplicationContext());
        return instance;
    }

    private DeviceArchiveStore(Context context) { super(context, NAME, null, VERSION); }

    @Override
    public void onCreate(SQLiteDatabase db) {
        db.execSQL("CREATE TABLE messages (id INTEGER PRIMARY KEY AUTOINCREMENT, package TEXT NOT NULL, chat TEXT NOT NULL, sender TEXT NOT NULL, "
            + "message_time INTEGER NOT NULL, text TEXT NOT NULL, versions TEXT NOT NULL DEFAULT '[]', first_seen INTEGER NOT NULL, last_seen INTEGER NOT NULL, "
            + "deleted_at INTEGER, is_group INTEGER NOT NULL DEFAULT 0, UNIQUE(package, chat, sender, message_time))");
        db.execSQL("CREATE INDEX messages_recent ON messages(last_seen DESC)");
        db.execSQL("CREATE INDEX messages_deleted ON messages(deleted_at)");
    }

    @Override
    public void onUpgrade(SQLiteDatabase db, int oldVersion, int newVersion) {}

    /** Returns "created", "edited", "deleted", or "unchanged". */
    public synchronized String record(String pkg, String chat, String sender, long messageTime, String text, boolean isGroup, boolean deletionMarker) {
        SQLiteDatabase db = getWritableDatabase();
        long now = System.currentTimeMillis();
        try (Cursor c = db.query("messages", new String[]{"id", "text", "versions", "deleted_at"}, "package=? AND chat=? AND sender=? AND message_time=?",
            new String[]{pkg, chat, sender, String.valueOf(messageTime)}, null, null, null)) {
            if (!c.moveToFirst()) {
                if (deletionMarker) {
                    // A deletion for a message we never saw: keep the tombstone so the archive shows it happened.
                    ContentValues v = new ContentValues();
                    v.put("package", pkg); v.put("chat", chat); v.put("sender", sender); v.put("message_time", messageTime);
                    v.put("text", ""); v.put("first_seen", now); v.put("last_seen", now); v.put("deleted_at", now); v.put("is_group", isGroup ? 1 : 0);
                    db.insert("messages", null, v);
                    return "deleted";
                }
                ContentValues v = new ContentValues();
                v.put("package", pkg); v.put("chat", chat); v.put("sender", sender); v.put("message_time", messageTime);
                v.put("text", text); v.put("first_seen", now); v.put("last_seen", now); v.put("is_group", isGroup ? 1 : 0);
                db.insert("messages", null, v);
                return "created";
            }
            long id = c.getLong(0);
            String current = c.getString(1);
            boolean alreadyDeleted = !c.isNull(3);
            ContentValues v = new ContentValues();
            v.put("last_seen", now);
            if (deletionMarker) {
                if (alreadyDeleted) { db.update("messages", v, "id=?", new String[]{String.valueOf(id)}); return "unchanged"; }
                v.put("deleted_at", now);
                db.update("messages", v, "id=?", new String[]{String.valueOf(id)});
                return "deleted";
            }
            if (text.equals(current) || alreadyDeleted) { db.update("messages", v, "id=?", new String[]{String.valueOf(id)}); return "unchanged"; }
            try {
                JSONArray versions = new JSONArray(c.getString(2));
                JSONObject previous = new JSONObject(); previous.put("text", current); previous.put("until", now);
                versions.put(previous);
                v.put("versions", versions.toString());
            } catch (JSONException ignored) {}
            v.put("text", text);
            db.update("messages", v, "id=?", new String[]{String.valueOf(id)});
            return "edited";
        }
    }

    public synchronized JSONObject list(int offset, int limit, String query, boolean deletedOnly) throws JSONException {
        SQLiteDatabase db = getReadableDatabase();
        StringBuilder where = new StringBuilder("1=1");
        java.util.List<String> args = new java.util.ArrayList<>();
        if (deletedOnly) where.append(" AND deleted_at IS NOT NULL");
        if (query != null && !query.trim().isEmpty()) {
            where.append(" AND (text LIKE ? OR sender LIKE ? OR chat LIKE ?)");
            String like = "%" + query.trim() + "%";
            args.add(like); args.add(like); args.add(like);
        }
        JSONArray rows = new JSONArray();
        try (Cursor c = db.query("messages", null, where.toString(), args.toArray(new String[0]), null, null, "last_seen DESC", offset + "," + limit)) {
            while (c.moveToNext()) {
                JSONObject row = new JSONObject();
                row.put("id", c.getLong(c.getColumnIndexOrThrow("id")));
                row.put("package", c.getString(c.getColumnIndexOrThrow("package")));
                row.put("chat", c.getString(c.getColumnIndexOrThrow("chat")));
                row.put("sender", c.getString(c.getColumnIndexOrThrow("sender")));
                row.put("messageTime", c.getLong(c.getColumnIndexOrThrow("message_time")));
                row.put("text", c.getString(c.getColumnIndexOrThrow("text")));
                row.put("versions", new JSONArray(c.getString(c.getColumnIndexOrThrow("versions"))));
                row.put("firstSeen", c.getLong(c.getColumnIndexOrThrow("first_seen")));
                row.put("lastSeen", c.getLong(c.getColumnIndexOrThrow("last_seen")));
                int deletedIndex = c.getColumnIndexOrThrow("deleted_at");
                row.put("deletedAt", c.isNull(deletedIndex) ? JSONObject.NULL : c.getLong(deletedIndex));
                row.put("isGroup", c.getInt(c.getColumnIndexOrThrow("is_group")) == 1);
                rows.put(row);
            }
        }
        JSONObject result = new JSONObject();
        result.put("messages", rows);
        result.put("total", count(db, where.toString(), args.toArray(new String[0])));
        result.put("deleted", count(db, "deleted_at IS NOT NULL", new String[0]));
        result.put("all", count(db, "1=1", new String[0]));
        return result;
    }

    private static long count(SQLiteDatabase db, String where, String[] args) {
        try (Cursor c = db.rawQuery("SELECT count(*) FROM messages WHERE " + where, args)) { return c.moveToFirst() ? c.getLong(0) : 0; }
    }

    public synchronized long counts(boolean deletedOnly) { return count(getReadableDatabase(), deletedOnly ? "deleted_at IS NOT NULL" : "1=1", new String[0]); }

    public synchronized int remove(long id) { return getWritableDatabase().delete("messages", "id=?", new String[]{String.valueOf(id)}); }

    public synchronized int clear() { return getWritableDatabase().delete("messages", null, null); }

    /** Drops messages older than the given number of days; deleted messages are kept unless keepDeleted is false. */
    public synchronized int purge(int days, boolean keepDeleted) {
        long cutoff = System.currentTimeMillis() - days * 86400000L;
        return getWritableDatabase().delete("messages", "last_seen<?" + (keepDeleted ? " AND deleted_at IS NULL" : ""), new String[]{String.valueOf(cutoff)});
    }
}
