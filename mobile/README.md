# undelete.chat mobile

Native shells for the App Store and Google Play, built with [Capacitor](https://capacitorjs.com). The shell loads the live web app from `https://undelete.chat`, so sign-in cookies stay first-party and every release of the web app reaches phones without a store update. The bundled `www/index.html` is only shown when the server cannot be reached.

The Progressive Web App is the primary phone experience today: it installs from the browser on Android and iOS (16.4+) and supports push notifications for recovered deletions. Build these shells when store presence matters.

## Build

Requires Node 22, Xcode 16+ with an Apple Developer account for iOS, and Android Studio with the SDK for Android.

```sh
cd mobile
npm install
npx cap add ios        # once; creates ios/ (gitignored)
npx cap add android    # once; creates android/ (gitignored)
npx cap sync
npx cap open ios       # set the team and bundle identifier chat.undelete.app, then archive
npx cap open android   # build a signed bundle for Play
```

App icons: regenerate from `../web/public/icons/icon.svg` with the `@capacitor/assets` tool (`npx @capacitor/assets generate --iconBackgroundColor '#f6f8f7'`) after placing a 1024×1024 PNG at `assets/icon.png`.

## Store review notes

- Apple's guideline 4.2 rejects apps that only wrap a website. Native push notifications are the concrete native capability to add before submission: install `@capacitor/push-notifications`, register the device token with a new `/api/push/native` endpoint, and send through APNs and FCM from the server. Web Push does not work inside the iOS web view, so this is required for parity with the PWA.
- Both stores require a privacy policy URL: `https://undelete.chat/docs/privacy`. Declare that the app collects account identifiers and user content (messages) linked to the user, used for app functionality only, with no tracking.
- Subscriptions bought on the website are used inside the app. Do not sell subscriptions inside the native app without Apple's in-app purchase; the current shell only shows the account's plan, and the Stripe checkout opens in the system browser.
- The platform terms of WhatsApp and Signal on unofficial clients apply to users regardless of how they open the app; keep the setup guides' warnings visible.
