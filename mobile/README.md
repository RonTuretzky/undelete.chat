# undelete.chat for iOS and Android

Native apps for the App Store and Google Play, built with [Capacitor](https://capacitorjs.com). The apps load the live web app from `https://undelete.chat` inside a native web view, so sign-in stays first-party and every web release reaches phones immediately. What is native: the app icon and splash screen, push notifications for recovered deletions (APNs on iOS, Firebase Cloud Messaging on Android), the system browser for external pages, and store-safe billing (plans are shown, purchases happen on the website).

Bundle identifier / application id: `chat.undelete.app`. Version `1.0.0` (build 1).

## Layout

- `ios/App` — Xcode project (Swift Package Manager). Push entitlement, background mode, and the App Delegate hooks are configured.
- `android` — Gradle project. Release signing reads the upload key from the environment; Firebase is applied only when `android/app/google-services.json` exists.
- `assets` — 1024 px icon and 2732 px splash sources; regenerate platform images with `npx @capacitor/assets generate --iconBackgroundColor '#f6f8f7' --iconBackgroundColorDark '#111817' --splashBackgroundColor '#f6f8f7' --splashBackgroundColorDark '#111817'`.
- `scripts/build-ios.sh`, `scripts/build-android.sh` — release builds.

## One-time setup (the parts only the account owner can do)

**Apple (about $99/year).** Enrol at developer.apple.com/programs. Then:
1. Certificates, Identifiers & Profiles → Identifiers → register `chat.undelete.app` with the Push Notifications capability.
2. Keys → create a key with Apple Push Notifications service (APNs) enabled. Download the `.p8` once and note the Key ID. Note the Team ID from the membership page.
3. Save the key as `~/.config/afterword/apns.p8` (mode 600) and create `~/.config/afterword/native-push-config.json`:
   ```json
   { "apns": { "key_id": "ABCDE12345", "team_id": "TEAM123456", "bundle_id": "chat.undelete.app", "key_file": "apns.p8", "sandbox": false } }
   ```
4. App Store Connect → My Apps → New App: iOS, name `undelete.chat`, bundle id `chat.undelete.app`, SKU `undelete-ios`.
5. Sign in to Xcode with the same Apple ID (Xcode → Settings → Accounts).

**Google (one-time $25).** Register at play.google.com/console. Then:
1. Create a Firebase project at console.firebase.google.com, add an Android app with package `chat.undelete.app`, download `google-services.json` into `mobile/android/app/` (gitignored).
2. Project settings → Service accounts → Generate new private key. Save it as `~/.config/afterword/fcm-service-account.json` (mode 600) and add `"fcm_service_account_file": "fcm-service-account.json"` to `native-push-config.json`.
3. Play Console → Create app: `undelete.chat`, app, free. Under Setup → App integrity choose Play App Signing (default) and upload the certificate of the upload key when asked (`keytool -export -rfc -keystore ~/.config/afterword/android-upload.jks -alias upload`). The upload keystore was generated during setup and lives only in `~/.config/afterword/`; back it up with the archive key.

Then deploy the server so it can send native notifications: `python3 deploy/deploy.py`. Until then the apps build and run but Settings shows that notifications are not switched on.

## Build and upload

```sh
cd mobile && npm install
UNDELETE_APPLE_TEAM_ID=TEAM123456 ./scripts/build-ios.sh     # produces build/export/App.ipa
./scripts/build-android.sh                                  # produces android/app/build/outputs/bundle/release/app-release.aab
```

Upload the `.ipa` with Xcode Organizer (Window → Organizer → Distribute App) or Transporter, and the `.aab` in Play Console → Production → Create new release. Bump `MARKETING_VERSION`/`CURRENT_PROJECT_VERSION` in `ios/App/App.xcodeproj/project.pbxproj` and `versionName`/`versionCode` in `android/app/build.gradle` for every store release.

Simulator check without an Apple account: `cd ios/App && GIT_TERMINAL_PROMPT=0 xcodebuild -project App.xcodeproj -scheme App -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO build`, then install the built `App.app` with `xcrun simctl`.

For a device test without the stores: `npx cap open ios` and run on a connected iPhone; `npx cap run android` for a connected Android phone or emulator.

## Store listing

- Name: undelete.chat. Subtitle / short description: They deleted it. You still have it.
- Description: undelete.chat links to your own WhatsApp, Telegram, and Signal accounts and keeps the messages other people delete, with the edits they made before deleting. Nothing else is stored: recent messages are held only for a short watch window and discarded. Get a notification the moment a deleted message is recovered. Your archive is sealed to a key only you hold, exportable, and yours to erase.
- Category: Utilities (iOS), Tools (Android). Age rating: 17+ / Mature 17+ (user-generated content from private chats).
- Privacy policy URL: https://undelete.chat/docs/privacy. Support URL: https://undelete.chat/docs. Marketing URL: https://undelete.chat.
- App privacy (Apple) / Data safety (Google): collects account identifiers (username) and user content (messages, linked to the user) for app functionality only; no tracking, no third-party advertising; data is encrypted in transit, and stored messages are sealed to a user-held key the operator cannot open; users can request deletion in-app (Settings → Delete account). Push tokens are collected for notifications.
- Screenshots: the app is the responsive web UI, so capture the deleted-messages list, a message history, Connections, and Settings on an iPhone 6.7-inch simulator and a Pixel-class emulator.

## Review notes (paste into the reviewer notes field)

- Demo account: create one in the app; registration is open and starts a free trial without a card. Reviewers can also use the demo at https://undelete.chat/demo without signing in.
- Native functionality: push notifications for recovered deletions, home-screen presence, and system-browser handoff. Subscriptions are sold on the website only; the app displays the plan state and never links to external purchase.
- The app links to the user's own messaging accounts through those platforms' device-linking flows. It never posts, sends, or modifies messages. WhatsApp and Signal are accessed through linked-device clients; the in-app guides tell users about each platform's rules before they link.
- Message content shown in the app is the user's own chat history. Notifications contain only a platform name and a count.

## Status

Both projects compile (see the readiness log). Native push, store metadata, and signing are wired but the Apple and Google accounts, the APNs key, and the Firebase project have to be created by the account owner before a submission can be made.
