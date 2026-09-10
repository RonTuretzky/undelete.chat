export const platformOrder = ['whatsapp', 'telegram', 'signal', 'discord'];
export const platformGuides = {
  "whatsapp": {
    "name": "WhatsApp",
    "mode": "Cloud linked device · unofficial",
    "effort": "Scan a QR code · cloud capture",
    "summary": "Link WhatsApp from your phone and capture in the cloud.",
    "coverage": "Captures ordinary messages, edits, and deletions delivered to your linked device. Uses unofficial software, so WhatsApp changes or account restrictions can interrupt capture.",
    "needs": [
      "Your phone, signed in to WhatsApp",
      "An available linked-device slot"
    ],
    "finish": [
      "In Afterword, choose Connections → WhatsApp, name the account, and authorize hosted capture.",
      "iPhone: WhatsApp → Settings → Linked devices → Link a device. Android: WhatsApp → ⋮ → Linked devices → Link a device.",
      "Unlock your phone if asked, scan the code shown in Afterword, and approve the link. Wait for Connected."
    ],
    "exclusions": "No view-once or disappearing messages, past deleted content, or attachment file downloads.",
    "resources": [
      {
        "label": "WhatsApp: link a device",
        "url": "https://faq.whatsapp.com/1317564962315842/"
      },
      {
        "label": "Baileys project",
        "url": "https://github.com/WhiskeySockets/Baileys"
      }
    ]
  },
  "telegram": {
    "name": "Telegram",
    "mode": "Personal account · cloud capture",
    "effort": "Scan a QR code · cloud capture",
    "summary": "Scan a Telegram QR code. Afterword keeps capturing on its server.",
    "coverage": "Captures ordinary cloud-chat messages, revisions, and deletion events Telegram delivers. Telegram sometimes omits deletion notifications.",
    "needs": [
      "Your phone, signed in to Telegram",
      "Your two-step verification password, if enabled"
    ],
    "finish": [
      "In Afterword, choose Connections → Telegram, name the account, and authorize hosted capture.",
      "On your phone, open Telegram → Settings → Devices → Link Desktop Device. Scan the QR code shown in Afterword.",
      "If prompted, enter your Telegram two-step verification password in Afterword. Wait for Connected."
    ],
    "exclusions": "No secret chats, self-destructing messages, historical backfill, or attachment file downloads.",
    "resources": [
      {
        "label": "Telegram: application setup",
        "url": "https://core.telegram.org/api/obtaining_api_id"
      },
      {
        "label": "Telegram API terms",
        "url": "https://core.telegram.org/api/terms"
      }
    ]
  },
  "discord": {
    "name": "Discord",
    "mode": "Personal account · browser beta",
    "effort": "Chrome extension · no terminal",
    "available": true,
    "summary": "Capture DMs and group DMs delivered to your own Discord Web tab.",
    "coverage": "The experimental Afterword extension observes personal DM messages, edits, and deletions received by your signed-in Discord Web tab. It excludes server channels. Chrome and that tab must remain open.",
    "needs": [
      "Chrome 125 or newer on a computer",
      "Your own account signed in to Discord Web",
      "Permission to load the extension and observe your chosen tab"
    ],
    "finish": [
      "Download and extract the Afterword Discord extension ZIP.",
      "Open chrome://extensions, turn on Developer mode, choose Load unpacked, and select the extracted afterword-discord-extension folder.",
      "Open the Afterword extension, enter your archive address and pairing code, and allow access to that archive.",
      "Choose your signed-in Discord tab and click Start capturing DMs. The tab reloads once, so send or clear drafts first. Keep Chrome’s debugging notice active."
    ],
    "exclusions": "Only identified DMs and group DMs delivered after capture starts. No server channels, native-app capture, historical recovery, ephemeral interactions, or attachment file downloads. This unofficial beta may break or conflict with Discord policies; live account verification is still required.",
    "resources": [
      {
        "label": "Open Discord Web",
        "url": "https://discord.com/channels/@me"
      },
      {
        "label": "Chrome: load an unpacked extension",
        "url": "https://developer.chrome.com/docs/extensions/get-started/tutorial/hello-world#load-unpacked"
      },
      {
        "label": "Discord platform terms",
        "url": "https://discord.com/terms"
      }
    ]
  },
  "signal": {
    "name": "Signal",
    "mode": "Cloud linked device · unofficial",
    "effort": "Scan a QR code · cloud capture",
    "summary": "Link Signal from your phone; no desktop installation is needed.",
    "coverage": "Captures ordinary incoming messages, synced outgoing messages, edits, and remote deletion events received by the linked device. signal-cli is unofficial and must stay current.",
    "needs": [
      "Your phone, signed in to Signal",
      "An available linked-device slot"
    ],
    "finish": [
      "In Afterword, choose Connections → Signal, name the account, and authorize hosted capture.",
      "On your primary phone, open Signal → Settings (your profile) → Linked devices → Link a new device (or +).",
      "Scan the QR code shown in Afterword and approve the device named Afterword Cloud. Wait for Connected."
    ],
    "exclusions": "No disappearing or view-once messages, existing Signal Desktop database import, or attachment file downloads.",
    "resources": [
      {
        "label": "Signal: linked devices",
        "url": "https://support.signal.org/hc/en-us/articles/360007320551-Linked-Devices"
      }
    ]
  }
};

export const guides = {
  "getting-started": {
    "title": "Start your cloud archive",
    "description": "Connect your accounts without installing anything on your computer.",
    "category": "START HERE",
    "sections": [
      {
        "id": "account",
        "title": "Create your workspace",
        "steps": [
          "Choose Create your archive. Use a username and a unique password of at least 12 characters.",
          "Enter the invitation code if your Afterword instance requires one.",
          "Open Connections and choose WhatsApp, Telegram, or Signal. Discord currently has a separate browser-only integration."
        ],
        "note": "The signed-out preview contains sample messages. Your own archive starts empty. Save the one-time recovery key shown after registration in your password manager. Use Forgot your password? on the sign-in screen to reset your password with that key."
      },
      {
        "id": "pair",
        "title": "Scan once, capture in the cloud",
        "steps": [
          "Read the platform’s coverage and authorize Afterword to host your linked session.",
          "Open Linked devices (or Devices in Telegram) in the phone app and scan the code shown in Afterword.",
          "Complete any requested password or phone approval. Keep the setup page open until it shows Connected."
        ],
        "paragraphs": [
          "Hosted setup needs no downloads, extension, terminal commands, or personal developer credentials. Initial scanning is easiest with a second screen."
        ]
      },
      {
        "id": "verify",
        "title": "Verify your first captured message",
        "paragraphs": [
          "Connected confirms a running platform session. It does not prove all message types have been delivered. The connection screen separately checks whether a new message reached your archive."
        ],
        "steps": [
          "Send a harmless message in your own chat and check that it appears in Afterword.",
          "Edit that message and open its Afterword history to look for both versions.",
          "Delete it in the original app. If the platform delivers the deletion, Afterword marks it Deleted and preserves the versions it received."
        ],
        "note": "Afterword never sends a test message for you. It cannot recover content it did not receive before a change or deletion."
      },
      {
        "id": "keep-running",
        "title": "Capture continues in the cloud",
        "paragraphs": [
          "Once a hosted connection is established, you can close Afterword, turn off your computer, and use your messaging apps normally. The server receives messages in the background.",
          "A platform outage, expired linked device, or server interruption can still leave gaps. The server retries lost connections automatically; if phone approval is needed, Connections will show Needs attention."
        ],
        "links": [
          {
            "label": "Continuous capture and recovery",
            "url": "/docs/running"
          }
        ]
      },
      {
        "id": "discord",
        "title": "Discord availability",
        "paragraphs": [
          "The current Discord integration uses a Chrome extension and an open Discord Web tab. It covers personal DMs and group DMs, not server channels. It does not provide continuous cloud capture while your computer is off."
        ],
        "links": [
          {
            "label": "Discord coverage and setup",
            "url": "/docs/discord"
          }
        ]
      },
      {
        "id": "controls",
        "title": "Manage what stays",
        "paragraphs": [
          "Settings lets you choose retention and export your archive. Pause stops storing new events while the cloud session stays connected. Disconnect removes the saved cloud login and stops capture; your archive remains until you delete it. Account deletion removes the archive and stored sessions."
        ],
        "links": [
          {
            "label": "Privacy and retention",
            "url": "/docs/privacy"
          }
        ]
      }
    ]
  },
  "discord": {
    "title": "Connect your personal Discord",
    "description": "Capture DMs and group DMs delivered to your own Discord Web tab.",
    "category": "BROWSER EXTENSION · EXPERIMENTAL",
    "platform": "discord",
    "sections": [
      {
        "id": "coverage",
        "title": "Your DMs, in your own account",
        "paragraphs": [
          "The experimental Afterword extension observes personal DM messages, edits, and deletions received by your signed-in Discord Web tab. It excludes server channels. Chrome and that tab must remain open.",
          "This is a passive browser collector. You sign into Discord normally; Afterword does not request your Discord password or token, install a server bot, send messages, or open another Discord API session."
        ],
        "note": "Only identified DMs and group DMs delivered after capture starts. No server channels, native-app capture, historical recovery, ephemeral interactions, or attachment file downloads. This unofficial beta may break or conflict with Discord policies; live account verification is still required."
      },
      {
        "id": "before",
        "title": "Before you start",
        "bullets": [
          "Chrome 125 or newer on a computer",
          "Your own account signed in to Discord Web",
          "Permission to load the extension and observe your chosen tab"
        ],
        "note": "The extension is a downloadable beta, not a Chrome Web Store release. Chrome shows a broad debugging-permission notice: the implementation attaches only to the Discord tab you select and reads incoming Gateway frames. It ignores outgoing frames, HTTP bodies, cookies, and headers. Captured copies upload to your chosen Afterword archive."
      },
      {
        "id": "platform-setup",
        "title": "Install and pair the extension",
        "steps": [
          "In Connections, choose Connect Discord, name the source, and continue.",
          "Download and extract the Afterword Discord extension ZIP.",
          "Open chrome://extensions, turn on Developer mode, choose Load unpacked, and select the extracted afterword-discord-extension folder.",
          "Open the Afterword extension, enter your archive address and pairing code, and allow access to that archive.",
          "Choose your signed-in Discord tab and click Start capturing DMs. The tab reloads once, so send or clear drafts first. Keep Chrome’s debugging notice active."
        ],
        "links": [
          {
            "label": "Open Discord Web",
            "url": "https://discord.com/channels/@me"
          },
          {
            "label": "Chrome: load an unpacked extension",
            "url": "https://developer.chrome.com/docs/extensions/get-started/tutorial/hello-world#load-unpacked"
          },
          {
            "label": "Discord platform terms",
            "url": "https://discord.com/terms"
          }
        ],
        "note": "No Node.js, terminal, bot token, server selection, or developer application is needed. Keep the extracted extension folder: Chrome loads the extension from that location. Treat the Afterword pairing code as private."
      },
      {
        "id": "verify",
        "title": "Check that your first message arrived",
        "paragraphs": [
          "“Connected” means the platform session is running. A captured message confirms the full route to your archive works. The setup screen checks this automatically; allow up to 30 seconds for status updates."
        ],
        "steps": [
          "In a covered conversation, send a harmless test message such as “Afterword connection test.” Wait for it to appear in the archive.",
          "Edit that message. Open its history in Afterword and check that both versions are present.",
          "Delete it in the original app. If the platform delivers the deletion event, Afterword will show Deleted while preserving the captured text."
        ],
        "note": "Test with your own messages in conversations you are authorized to archive. Afterword does not send a test message for you."
      },
      {
        "id": "keep-running",
        "title": "Keep Discord Web open",
        "paragraphs": [
          "Keep Chrome running with your selected Discord Web tab open and signed in. Background tabs can receive events, but browser suspension, sleep, network gaps, and canceled debugging can interrupt capture.",
          "After restarting Chrome or updating the extension, open it and click Start capturing DMs again. Starting reloads the tab once so the collector sees the new Discord connection."
        ],
        "bullets": [
          "Stop capturing detaches from the tab while queued events can still upload.",
          "Pausing the source in Afterword discards incoming activity, matching other sources. Resume does not recover paused events.",
          "Use a separate Afterword source and Chrome profile for a different Discord account. A detected account switch stops capture to prevent mixing archives."
        ]
      },
      {
        "id": "storage",
        "title": "Local copies and your archive",
        "paragraphs": [
          "The extension keeps its archive key, DM metadata, and retry queue encrypted in its private IndexedDB storage. The encryption key lives in the same browser profile; this does not protect against someone who controls that profile or device.",
          "Queued events survive a browser restart and are removed after the server acknowledges them. A queue limit stops capture instead of silently dropping deliveries. Recent message metadata used to merge partial edits expires after seven days or on message deletion. Attachment metadata is stored; files are not downloaded.",
          "The hosted archive uses the retention setting in your Afterword workspace. Disconnecting the extension clears its local connection and metadata once the queue is empty. Uninstalling it removes local extension storage; export any required data first."
        ]
      },
      {
        "id": "fixes",
        "title": "If messages do not appear",
        "bullets": [
          "Finish ordinary Discord sign-in in the selected tab and click Start capturing DMs in the extension.",
          "Close DevTools for that Discord tab; another debugger can displace capture. Restart if Chrome’s debugging notice was canceled.",
          "Check the extension status. Paired only confirms the archive link. Waiting for Discord is not a verified message delivery.",
          "Only identified DMs and group DMs are captured. A server message, old message, or event Discord never delivers will not appear.",
          "If archive access is down, events remain encrypted locally. Restore access before the queue reaches its 10,000-event limit.",
          "Unsupported encoding/compression or an account switch stops capture visibly. Update the extension or create a separate account connection. Do not paste a Discord user token to work around an error."
        ],
        "links": [
          {
            "label": "Privacy and retention",
            "url": "/docs/privacy"
          }
        ]
      }
    ]
  },
  "whatsapp": {
    "title": "Connect WhatsApp in the cloud",
    "description": "Link WhatsApp from your phone and capture in the cloud.",
    "category": "HOSTED ACCOUNT LINKING",
    "platform": "whatsapp",
    "sections": [
      {
        "id": "coverage",
        "title": "What gets captured",
        "paragraphs": [
          "Captures ordinary messages, edits, and deletions delivered to your linked device. Uses unofficial software, so WhatsApp changes or account restrictions can interrupt capture."
        ],
        "note": "No view-once or disappearing messages, past deleted content, or attachment file downloads."
      },
      {
        "id": "before",
        "title": "Have your phone ready",
        "bullets": [
          "Your phone, signed in to WhatsApp",
          "An available linked-device slot"
        ],
        "paragraphs": [
          "Use a computer or a second screen to display the code while you scan with your phone. You do not need Node.js, a terminal, an extension, or a computer left running."
        ]
      },
      {
        "id": "platform-setup",
        "title": "Link your account",
        "steps": [
          "In Afterword, choose Connections → WhatsApp, name the account, and authorize hosted capture.",
          "iPhone: WhatsApp → Settings → Linked devices → Link a device. Android: WhatsApp → ⋮ → Linked devices → Link a device.",
          "Unlock your phone if asked, scan the code shown in Afterword, and approve the link. Wait for Connected."
        ],
        "links": [
          {
            "label": "WhatsApp: link a device",
            "url": "https://faq.whatsapp.com/1317564962315842/"
          },
          {
            "label": "Baileys project",
            "url": "https://github.com/WhiskeySockets/Baileys"
          }
        ],
        "note": "The QR code links your account to a server operated by Afterword. Keep it private and use the scanner inside the messaging app."
      },
      {
        "id": "verify",
        "title": "Verify your first captured message",
        "paragraphs": [
          "Connected confirms a running platform session. It does not prove all message types have been delivered. The connection screen separately checks whether a new message reached your archive."
        ],
        "steps": [
          "Send a harmless message in your own chat and check that it appears in Afterword.",
          "Edit that message and open its Afterword history to look for both versions.",
          "Delete it in the original app. If the platform delivers the deletion, Afterword marks it Deleted and preserves the versions it received."
        ],
        "note": "Afterword never sends a test message for you. It cannot recover content it did not receive before a change or deletion."
      },
      {
        "id": "keep-running",
        "title": "Capture continues in the cloud",
        "paragraphs": [
          "Once a hosted connection is established, you can close Afterword, turn off your computer, and use your messaging apps normally. The server receives messages in the background.",
          "A platform outage, expired linked device, or server interruption can still leave gaps. The server retries lost connections automatically; if phone approval is needed, Connections will show Needs attention."
        ],
        "links": [
          {
            "label": "Continuous capture and recovery",
            "url": "/docs/running"
          }
        ]
      },
      {
        "id": "fixes",
        "title": "If linking needs attention",
        "bullets": [
          "If the QR code expires, choose Get a fresh code or Try again. WhatsApp and Telegram refresh their codes automatically during setup.",
          "If your phone rejects the link, check that you are scanning with the matching app and have an available device slot.",
          "If the platform unlinked your device, open Connection check → Connection options → Relink account, then approve a new code. This clears the old platform login for that source and keeps the archive.",
          "A cloud capacity or configuration message means the operator must resolve it. Repeated scanning will not fix that condition."
        ]
      },
      {
        "id": "privacy",
        "title": "Where your data lives",
        "paragraphs": [
          "Afterword stores the linked session on its server so capture can continue while your devices are off. Stored credentials and captured message bodies are encrypted at rest, but the server can decrypt them to run the service. This is not end-to-end encrypted cloud storage."
        ],
        "links": [
          {
            "label": "Privacy and retention",
            "url": "/docs/privacy"
          }
        ]
      }
    ]
  },
  "telegram": {
    "title": "Connect Telegram in the cloud",
    "description": "Scan a Telegram QR code. Afterword keeps capturing on its server.",
    "category": "HOSTED ACCOUNT LINKING",
    "platform": "telegram",
    "sections": [
      {
        "id": "coverage",
        "title": "What gets captured",
        "paragraphs": [
          "Captures ordinary cloud-chat messages, revisions, and deletion events Telegram delivers. Telegram sometimes omits deletion notifications."
        ],
        "note": "No secret chats, self-destructing messages, historical backfill, or attachment file downloads."
      },
      {
        "id": "before",
        "title": "Have your phone ready",
        "bullets": [
          "Your phone, signed in to Telegram",
          "Your two-step verification password, if enabled"
        ],
        "paragraphs": [
          "Use a computer or a second screen to display the code while you scan with your phone. You do not need Node.js, a terminal, an extension, or a computer left running."
        ]
      },
      {
        "id": "platform-setup",
        "title": "Link your account",
        "steps": [
          "In Afterword, choose Connections → Telegram, name the account, and authorize hosted capture.",
          "On your phone, open Telegram → Settings → Devices → Link Desktop Device. Scan the QR code shown in Afterword.",
          "If prompted, enter your Telegram two-step verification password in Afterword. Wait for Connected."
        ],
        "links": [
          {
            "label": "Telegram: application setup",
            "url": "https://core.telegram.org/api/obtaining_api_id"
          },
          {
            "label": "Telegram API terms",
            "url": "https://core.telegram.org/api/terms"
          }
        ],
        "note": "Afterword’s operator configures the Telegram application credentials. You do not need to create your own Telegram developer application. Your sign-in password is used for the current step and is not stored in application logs."
      },
      {
        "id": "verify",
        "title": "Verify your first captured message",
        "paragraphs": [
          "Connected confirms a running platform session. It does not prove all message types have been delivered. The connection screen separately checks whether a new message reached your archive."
        ],
        "steps": [
          "Send a harmless message in your own chat and check that it appears in Afterword.",
          "Edit that message and open its Afterword history to look for both versions.",
          "Delete it in the original app. If the platform delivers the deletion, Afterword marks it Deleted and preserves the versions it received."
        ],
        "note": "Afterword never sends a test message for you. It cannot recover content it did not receive before a change or deletion."
      },
      {
        "id": "keep-running",
        "title": "Capture continues in the cloud",
        "paragraphs": [
          "Once a hosted connection is established, you can close Afterword, turn off your computer, and use your messaging apps normally. The server receives messages in the background.",
          "A platform outage, expired linked device, or server interruption can still leave gaps. The server retries lost connections automatically; if phone approval is needed, Connections will show Needs attention."
        ],
        "links": [
          {
            "label": "Continuous capture and recovery",
            "url": "/docs/running"
          }
        ]
      },
      {
        "id": "fixes",
        "title": "If linking needs attention",
        "bullets": [
          "If the QR code expires, choose Get a fresh code or Try again. WhatsApp and Telegram refresh their codes automatically during setup.",
          "If your phone rejects the link, check that you are scanning with the matching app and have an available device slot.",
          "If the platform unlinked your device, open Connection check → Connection options → Relink account, then approve a new code. This clears the old platform login for that source and keeps the archive.",
          "A cloud capacity or configuration message means the operator must resolve it. Repeated scanning will not fix that condition."
        ]
      },
      {
        "id": "privacy",
        "title": "Where your data lives",
        "paragraphs": [
          "Afterword stores the linked session on its server so capture can continue while your devices are off. Stored credentials and captured message bodies are encrypted at rest, but the server can decrypt them to run the service. This is not end-to-end encrypted cloud storage."
        ],
        "links": [
          {
            "label": "Privacy and retention",
            "url": "/docs/privacy"
          }
        ]
      }
    ]
  },
  "signal": {
    "title": "Connect Signal in the cloud",
    "description": "Link Signal from your phone; no desktop installation is needed.",
    "category": "HOSTED ACCOUNT LINKING",
    "platform": "signal",
    "sections": [
      {
        "id": "coverage",
        "title": "What gets captured",
        "paragraphs": [
          "Captures ordinary incoming messages, synced outgoing messages, edits, and remote deletion events received by the linked device. signal-cli is unofficial and must stay current."
        ],
        "note": "No disappearing or view-once messages, existing Signal Desktop database import, or attachment file downloads."
      },
      {
        "id": "before",
        "title": "Have your phone ready",
        "bullets": [
          "Your phone, signed in to Signal",
          "An available linked-device slot"
        ],
        "paragraphs": [
          "Use a computer or a second screen to display the code while you scan with your phone. You do not need Node.js, a terminal, an extension, or a computer left running."
        ]
      },
      {
        "id": "platform-setup",
        "title": "Link your account",
        "steps": [
          "In Afterword, choose Connections → Signal, name the account, and authorize hosted capture.",
          "On your primary phone, open Signal → Settings (your profile) → Linked devices → Link a new device (or +).",
          "Scan the QR code shown in Afterword and approve the device named Afterword Cloud. Wait for Connected."
        ],
        "links": [
          {
            "label": "Signal: linked devices",
            "url": "https://support.signal.org/hc/en-us/articles/360007320551-Linked-Devices"
          }
        ],
        "note": "The QR code links your account to a server operated by Afterword. Keep it private and use the scanner inside the messaging app."
      },
      {
        "id": "verify",
        "title": "Verify your first captured message",
        "paragraphs": [
          "Connected confirms a running platform session. It does not prove all message types have been delivered. The connection screen separately checks whether a new message reached your archive."
        ],
        "steps": [
          "Send a harmless message in your own chat and check that it appears in Afterword.",
          "Edit that message and open its Afterword history to look for both versions.",
          "Delete it in the original app. If the platform delivers the deletion, Afterword marks it Deleted and preserves the versions it received."
        ],
        "note": "Afterword never sends a test message for you. It cannot recover content it did not receive before a change or deletion."
      },
      {
        "id": "keep-running",
        "title": "Capture continues in the cloud",
        "paragraphs": [
          "Once a hosted connection is established, you can close Afterword, turn off your computer, and use your messaging apps normally. The server receives messages in the background.",
          "A platform outage, expired linked device, or server interruption can still leave gaps. The server retries lost connections automatically; if phone approval is needed, Connections will show Needs attention."
        ],
        "links": [
          {
            "label": "Continuous capture and recovery",
            "url": "/docs/running"
          }
        ]
      },
      {
        "id": "fixes",
        "title": "If linking needs attention",
        "bullets": [
          "If the QR code expires, choose Get a fresh code or Try again. WhatsApp and Telegram refresh their codes automatically during setup.",
          "If your phone rejects the link, check that you are scanning with the matching app and have an available device slot.",
          "If the platform unlinked your device, open Connection check → Connection options → Relink account, then approve a new code. This clears the old platform login for that source and keeps the archive.",
          "A cloud capacity or configuration message means the operator must resolve it. Repeated scanning will not fix that condition."
        ]
      },
      {
        "id": "privacy",
        "title": "Where your data lives",
        "paragraphs": [
          "Afterword stores the linked session on its server so capture can continue while your devices are off. Stored credentials and captured message bodies are encrypted at rest, but the server can decrypt them to run the service. This is not end-to-end encrypted cloud storage."
        ],
        "links": [
          {
            "label": "Privacy and retention",
            "url": "/docs/privacy"
          }
        ]
      }
    ]
  },
  "troubleshooting": {
    "title": "Get your connection back on track",
    "description": "Clear next steps for QR codes, cloud sessions, and missing messages.",
    "category": "HELP",
    "sections": [
      {
        "id": "qr",
        "title": "QR code expired or rejected",
        "bullets": [
          "Use the scanner inside the matching phone app, not the normal camera app.",
          "Choose Try again or Get a fresh code if the code has expired.",
          "Check your linked-device slots and phone connectivity. If the platform unlinked your session, use Connection options → Relink account."
        ]
      },
      {
        "id": "offline",
        "title": "Cloud source is offline",
        "paragraphs": [
          "Wait briefly while the server retries. If the error persists, open Connection check. You may need to approve a fresh phone link. A server configuration or capacity error needs the operator’s attention."
        ],
        "note": "Closing the website does not stop a hosted collector. Local companions and Discord’s browser extension do depend on the computer running them."
      },
      {
        "id": "missing",
        "title": "Connected, but a message is missing",
        "bullets": [
          "Confirm this is your real workspace rather than the signed-out demo.",
          "Send a new ordinary message to your own chat after the connection shows Connected.",
          "Check whether the source is paused and whether the conversation/message type is covered.",
          "Deletion events are not guaranteed on every platform. Messages edited or deleted during a capture gap may be incomplete."
        ]
      },
      {
        "id": "account",
        "title": "Cannot sign in to Afterword",
        "paragraphs": [
          "Check your username and password. New accounts may require an invitation code. Password changes sign out other sessions. Use Forgot your password? with your saved recovery key. Successful recovery signs out previous sessions and gives you a replacement key. If you are signed in, Settings lets you create or replace a key after confirming your password. Without both the password and recovery key, contact the operator; access cannot be automatically restored."
        ]
      }
    ]
  },
  "running": {
    "title": "Continuous capture and recovery",
    "description": "How hosted connections behave when you close the browser or a connection drops.",
    "category": "USING AFTERWORD",
    "sections": [
      {
        "id": "keep-running",
        "title": "Capture continues in the cloud",
        "paragraphs": [
          "Once a hosted connection is established, you can close Afterword, turn off your computer, and use your messaging apps normally. The server receives messages in the background.",
          "A platform outage, expired linked device, or server interruption can still leave gaps. The server retries lost connections automatically; if phone approval is needed, Connections will show Needs attention."
        ],
        "links": [
          {
            "label": "Continuous capture and recovery",
            "url": "/docs/running"
          }
        ]
      },
      {
        "id": "restart",
        "title": "Restarts and connection gaps",
        "paragraphs": [
          "Hosted sessions are saved in encrypted per-connection storage. The service resumes enabled connections after a normal server restart and retries unexpected collector exits with a delay. Expired logins may require a fresh scan.",
          "Signal requires working session files while running. These live on a temporary in-memory filesystem in production and are checkpointed into encrypted storage every five seconds. A sudden machine failure can lose the latest checkpoint interval; the service cannot promise gap-free capture through an outage."
        ]
      },
      {
        "id": "controls",
        "title": "Pause, disconnect, and relink",
        "bullets": [
          "Pause: keep the platform session connected but discard new captured events.",
          "Disconnect: stop the collector and remove its stored cloud session. Previously captured messages remain.",
          "Relink: reset one connection’s platform login and scan again. Previously captured messages remain.",
          "A message that changes before Afterword receives it cannot be reconstructed."
        ]
      },
      {
        "id": "local",
        "title": "Older local connections and Discord",
        "paragraphs": [
          "Connections identifies whether each source captures in the cloud or uses a local companion. Older local companions still depend on their computer. Choose Continue setup and authorize Move connection to cloud to replace one with a hosted session.",
          "Discord’s extension remains local and requires Chrome with the selected Discord Web tab open. This is not a cloud connector."
        ]
      },
      {
        "id": "capacity",
        "title": "Hosted capacity",
        "paragraphs": [
          "The operator sets a server-wide collector limit and each account can have up to four hosted connections. If capacity is full, setup shows a clear error. A small development server is not unlimited production capacity."
        ]
      }
    ]
  },
  "privacy": {
    "title": "Your data, privacy, and retention",
    "description": "What Afterword stores and how to remove it.",
    "category": "PRIVACY",
    "sections": [
      {
        "id": "storage",
        "title": "Hosted sessions and message copies",
        "paragraphs": [
          "Hosted collectors run on Afterword’s server. Platform login sessions, ordinary captured messages, and the revisions received by each collector are stored separately for each source. QR codes and pending login responses are temporary and visible only through the authenticated owner’s setup.",
          "Saved platform credentials and message bodies are encrypted at rest. The server has the decryption keys and can read them to provide the service; this is not end-to-end encrypted storage.",
          "Legacy local collectors keep their platform sessions on that computer. The Discord extension stores its own queue in the browser and uploads captured messages to the archive."
        ]
      },
      {
        "id": "coverage",
        "title": "Coverage and limits",
        "bullets": [
          "Only messages/events received by a collector can be archived. Past deleted messages cannot be recovered.",
          "Disappearing, self-destructing, and view-once content is excluded.",
          "Attachment names and metadata may be recorded. File contents are not downloaded.",
          "Unofficial Signal and WhatsApp integrations can break when their platforms change. Discord cloud capture is unavailable."
        ]
      },
      {
        "id": "retention",
        "title": "Retention and export",
        "paragraphs": [
          "Choose 7, 30, 90, or 365 days, or keep messages until you delete them. Retention is measured from first capture and applies to saved messages as well. Lowering retention immediately removes older messages. Export includes all captured versions in JSON."
        ]
      },
      {
        "id": "deletion",
        "title": "Disconnecting and deleting",
        "bullets": [
          "Disconnect removes the hosted login for that source and stops capture; it keeps your existing archive.",
          "Deleting an archived message removes its revisions and prevents later retries from recreating that item.",
          "Account deletion removes that account’s archive, sign-in sessions, and hosted platform sessions.",
          "Deleting here does not delete messages in the messaging platform. You can also unlink Afterword from the platform’s device settings. Deleted archive data may remain in restricted operational backups until those snapshots rotate out; the server keeps its latest seven snapshots."
        ]
      },
      {
        "id": "use",
        "title": "Archive with authorization",
        "paragraphs": [
          "Connect only accounts you control and retain only conversations you are authorized to keep. Captured copies may remain after a participant edits or deletes the original."
        ]
      }
    ]
  }
};
