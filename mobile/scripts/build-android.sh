#!/bin/sh
# Builds the signed Android App Bundle for Google Play using the upload key in
# ~/.config/afterword (never committed). Output: mobile/android/app/build/outputs/bundle/release/app-release.aab
set -eu
cd "$(dirname "$0")/.."
CONFIG="$HOME/.config/afterword/android-signing.json"
[ -f "$CONFIG" ] || { echo "Missing $CONFIG (created by the operator setup)"; exit 1; }
export UNDELETE_KEYSTORE="$HOME/.config/afterword/$(python3 -c "import json;print(json.load(open('$CONFIG'))['keystore'])")"
export UNDELETE_KEYSTORE_PASSWORD="$(python3 -c "import json;print(json.load(open('$CONFIG'))['store_password'])")"
export UNDELETE_KEY_ALIAS="$(python3 -c "import json;print(json.load(open('$CONFIG'))['alias'])")"
export UNDELETE_KEY_PASSWORD="$(python3 -c "import json;print(json.load(open('$CONFIG'))['key_password'])")"
[ -f android/app/google-services.json ] || echo "Note: android/app/google-services.json is absent, so this build has no push notifications."
npx cap sync android
cd android && ./gradlew --quiet bundleRelease
ls -la app/build/outputs/bundle/release/app-release.aab
