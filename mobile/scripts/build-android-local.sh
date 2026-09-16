#!/bin/sh
# Builds the phone-only Android edition: the web interface is bundled from
# ../dist, the app id is chat.undelete.local, and it never contacts a server.
# Output: android/app/build/outputs/apk/local/release/app-local-release.apk (signed with the upload key when configured).
set -eu
cd "$(dirname "$0")/.."
ROOT="$(pwd)"
[ -d ../dist ] || (cd .. && npm run build)
cp "$ROOT/capacitor.config.json" "$ROOT/capacitor.cloud.config.backup.json"
cp "$ROOT/capacitor.local.config.json" "$ROOT/capacitor.config.json"
# Always put the cloud configuration back, whatever directory the script is in when it exits.
trap 'cp "$ROOT/capacitor.cloud.config.backup.json" "$ROOT/capacitor.config.json"; rm -f "$ROOT/capacitor.cloud.config.backup.json"; (cd "$ROOT" && npx cap sync android >/dev/null 2>&1) || true' EXIT
npx cap sync android
CONFIG="$HOME/.config/afterword/android-signing.json"
if [ -f "$CONFIG" ]; then
  export UNDELETE_KEYSTORE="$HOME/.config/afterword/$(python3 -c "import json;print(json.load(open('$CONFIG'))['keystore'])")"
  export UNDELETE_KEYSTORE_PASSWORD="$(python3 -c "import json;print(json.load(open('$CONFIG'))['store_password'])")"
  export UNDELETE_KEY_ALIAS="$(python3 -c "import json;print(json.load(open('$CONFIG'))['alias'])")"
  export UNDELETE_KEY_PASSWORD="$(python3 -c "import json;print(json.load(open('$CONFIG'))['key_password'])")"
fi
cd android && ./gradlew --quiet assembleLocalRelease
ls -la app/build/outputs/apk/local/release/app-local-release.apk
shasum -a 256 app/build/outputs/apk/local/release/app-local-release.apk
