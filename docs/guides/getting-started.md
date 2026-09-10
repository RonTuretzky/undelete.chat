# Start your first archive

From a new workspace to your first captured message, one step at a time.

<a id="how-it-works"></a>

## Two parts, one archive

Afterword is your private web archive. The companion is a small program that runs on your computer, receives messages from the accounts you link, and sends captured copies to that archive.

You can browse the archive on your phone. Initial setup needs a computer. Discord uses a Chrome extension; Telegram, Signal, and WhatsApp use a terminal companion. There is no phone-only installation or background desktop app in this release.

<a id="account"></a>

## 1. Create your workspace

1. Choose Create your archive and pick a username and a password with at least 12 characters.
2. If asked, enter the invitation code supplied by your Afterword administrator. This is different from the pairing code you generate later.
3. After signing in, open Connections and choose a platform. Check its coverage and prerequisites before continuing. For Discord, follow the browser extension guide; the terminal steps below apply to the other platforms.

> The signed-out preview contains sample messages. Your own archive starts empty. If you forget your account password, contact the operator of your Afterword instance; self-service email recovery is not available.

<a id="computer"></a>

## 2. Prepare your computer

1. Install a current Node.js LTS version (22.13 or newer) from nodejs.org. Choose the installer for your computer, then close and reopen your terminal.
2. In the connection setup screen, download the companion ZIP and extract it. Keep this folder somewhere you can find again.
3. Open a terminal in the extracted afterword-companion folder. It should contain package.json and a companion folder.

> macOS: open Terminal, type cd followed by a space, drag the extracted folder into the window, and press Return. Windows: right-click inside the extracted folder and choose Open in Terminal. If PowerShell blocks npm.ps1, use npm.cmd in the commands below; you do not need to weaken your execution policy. Linux: use your file manager’s Open in Terminal action or cd to the folder.

- [Download Node.js](https://nodejs.org/en/download)

<a id="pair"></a>

## 3. Pair the companion

The setup screen provides two commands with your archive server already filled in. Run the install command once, then the pairing command.

1. Copy the short pairing code from the browser into the terminal when asked. Codes expire after 10 minutes and work only once.
2. The companion shows the platform and connection name it has paired. Follow its prompts to sign in or scan a platform QR code.
3. Keep the setup screen open. It will advance when the companion reports that the platform is connected.

```sh
npm ci --omit=dev
npm start -- pair --server https://YOUR-AFTERWORD-SERVER
```

> A pairing code gives the companion access to send data to one source. Treat it as private. Do not paste it into platform chats. The long-lived connection key is stored automatically on your computer and does not go into your command history.

<a id="verify"></a>

## Check that your first message arrived

“Connected” means the platform session is running. A captured message confirms the full route to your archive works. The setup screen checks this automatically; allow up to 30 seconds for status updates.

1. In a covered conversation, send a harmless test message such as “Afterword connection test.” Wait for it to appear in the archive.
2. Edit that message. Open its history in Afterword and check that both versions are present.
3. Delete it in the original app. If the platform delivers the deletion event, Afterword will show Deleted while preserving the captured text.

> Test with your own messages in conversations you are authorized to archive. Afterword does not send a test message for you.

<a id="keep-running"></a>

## Keep capture running

Leave the companion terminal open and keep the computer awake and connected to the internet. Closing it, sleeping, or unlinking the device interrupts capture. Messages that change during a gap may never be recoverable.

1. To stop, press Ctrl+C in the companion terminal.
2. To resume, reopen a terminal in the companion folder and run the Resume command shown beside that source in Connections.
3. For a second account, create another connection and pair it in another terminal. Afterword assigns separate profiles automatically.

- [Continuous capture and storage guide](./running.md)

<a id="next"></a>

## You control what stays

Open Settings to choose how long messages are retained, export your archive, or change your password. Deleting a connection stops syncing but keeps its captured history. Deleting an archived message removes its saved versions from the server.

- [Privacy, retention, and deletion](./privacy.md)
- [Something not working?](./troubleshooting.md)

Instructions reviewed September 9, 2026. Platform screens may change.

Generated from `web/guides.mjs`, the same content shown in the public help center.
