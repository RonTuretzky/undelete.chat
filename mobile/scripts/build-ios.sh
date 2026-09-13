#!/bin/sh
# Archives the iOS app and exports an App Store build. Requires Xcode signed in
# to the Apple Developer account. Usage: UNDELETE_APPLE_TEAM_ID=ABCDE12345 ./scripts/build-ios.sh
set -eu
cd "$(dirname "$0")/.."
: "${UNDELETE_APPLE_TEAM_ID:?Set UNDELETE_APPLE_TEAM_ID to the ten-character Apple team identifier}"
# Swift Package Manager fetches public repositories; never let git block on a credential prompt.
export GIT_TERMINAL_PROMPT=0 GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=credential.helper GIT_CONFIG_VALUE_0=""
npx cap sync ios
mkdir -p build
xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration Release -destination 'generic/platform=iOS' \
  -archivePath build/App.xcarchive archive -allowProvisioningUpdates UNDELETE_APPLE_TEAM_ID="$UNDELETE_APPLE_TEAM_ID" | tail -3
sed "s/TEAM_ID_PLACEHOLDER/$UNDELETE_APPLE_TEAM_ID/" scripts/ExportOptions.plist > build/ExportOptions.plist
xcodebuild -exportArchive -archivePath build/App.xcarchive -exportOptionsPlist build/ExportOptions.plist -exportPath build/export -allowProvisioningUpdates | tail -3
ls -la build/export/*.ipa
echo "Upload with: xcrun altool --upload-app -f build/export/App.ipa -t ios --apiKey KEY_ID --apiIssuer ISSUER_ID   (or use Transporter / Xcode Organizer)"
