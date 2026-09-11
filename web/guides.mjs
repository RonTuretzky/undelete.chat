import { privacyPolicy } from './privacy-policy.mjs';
export const platformOrder = ["whatsapp","telegram","signal","discord"];
export const discordBrowserGuide = {
  "name": "Discord",
  "mode": "Personal account · browser beta",
  "effort": "Chrome extension · no terminal",
  "available": true,
  "summary": "Watch DMs and group DMs delivered to your own Discord Web tab and keep the ones that get deleted.",
  "coverage": "The experimental Undelete extension observes personal DM messages, edits, and deletions received by your signed-in Discord Web tab. Only messages that are later deleted are kept. It excludes server channels. Chrome and that tab must remain open.",
  "needs": [
    "Chrome 125 or newer on a computer",
    "Your own account signed in to Discord Web",
    "Permission to load the extension and observe your chosen tab"
  ],
  "finish": [
    "Download and extract the Undelete Discord extension ZIP.",
    "Open chrome://extensions, turn on Developer mode, choose Load unpacked, and select the extracted afterword-discord-extension folder.",
    "Open the Undelete extension, enter your archive address and pairing code, and allow access to that archive.",
    "Choose your signed-in Discord tab and click Start capturing DMs. The tab reloads once, so send or clear drafts first. Keep Chrome’s debugging notice active."
  ],
  "exclusions": "Only identified DMs and group DMs delivered after the watch starts and deleted within the watch window. No server channels, native-app capture, historical recovery, ephemeral interactions, or attachment file downloads. This unofficial beta may break or conflict with Discord policies; live account verification is still required.",
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
};
export const platformGuides = {
  "whatsapp": {
    "name": "WhatsApp",
    "mode": "Cloud linked device · unofficial",
    "effort": "Scan a QR code · watched in the cloud",
    "summary": "Link WhatsApp from your phone and keep the messages that get deleted.",
    "coverage": "Watches ordinary messages and their edits delivered to your linked device, and keeps only the ones that are later deleted. Uses unofficial software, so WhatsApp changes or account restrictions can interrupt the watch.",
    "needs": [
      "Your phone, signed in to WhatsApp",
      "An available linked-device slot"
    ],
    "finish": [
      "In Undelete, choose Connections → WhatsApp, name the account, and authorize the hosted connection.",
      "iPhone: WhatsApp → Settings → Linked devices → Link a device. Android: WhatsApp → ⋮ → Linked devices → Link a device.",
      "Unlock your phone if asked, scan the code shown in Undelete, and approve the link. Wait for Connected."
    ],
    "exclusions": "No view-once or disappearing messages, messages deleted before linking, messages that outlive the watch window, or attachment file downloads.",
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
    "mode": "Personal account · watched in the cloud",
    "effort": "Scan a QR code · watched in the cloud",
    "summary": "Scan a Telegram QR code. Undelete keeps watching on its server.",
    "coverage": "Watches ordinary cloud-chat messages and their edits, and keeps only the ones Telegram later reports as deleted. Telegram sometimes omits deletion notifications, so some deleted messages are missed.",
    "needs": [
      "Your phone, signed in to Telegram",
      "Your two-step verification password, if enabled"
    ],
    "finish": [
      "In Undelete, choose Connections → Telegram, name the account, and authorize the hosted connection.",
      "On your phone, open Telegram → Settings → Devices → Link Desktop Device. Scan the QR code shown in Undelete.",
      "If prompted, enter your Telegram two-step verification password in Undelete. Wait for Connected."
    ],
    "exclusions": "No secret chats, self-destructing messages, historical backfill, messages that outlive the watch window, or attachment file downloads.",
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
    "mode": "Personal cloud session · experimental",
    "effort": "Phone QR approval · account restrictions apply",
    "available": true,
    "summary": "An experimental personal session can watch DMs on the server after phone approval.",
    "coverage": "Watches identified personal DMs and group DMs delivered to a hosted Discord session, and keeps only the ones later deleted, together with the edits received before deletion. Server channels are excluded. Discord forbids automated personal accounts and may terminate accounts that use them.",
    "needs": [
      "Your phone, signed in to your own Discord account",
      "Acceptance of the account risk before starting this unofficial connection"
    ],
    "finish": [
      "In Undelete, choose Connections → Discord. Read the account-risk notice, name the source, and acknowledge both consent boxes.",
      "On your phone, open Discord → your profile → Settings → Scan QR Code. Scan the code generated in your signed-in Undelete workspace.",
      "Review the phone approval screen and approve the login only if you intend to give Undelete a personal session on its server. Wait for Connected, then send and delete a harmless DM to confirm it appears in your archive."
    ],
    "exclusions": "Experimental and not approved by Discord. No server channels, historical backfill, ephemeral interactions, messages that outlive the watch window, or attachment file downloads. Discord restrictions, missing events, or revoked sessions can interrupt the watch.",
    "resources": [
      {
        "label": "Discord: personal-account automation policy",
        "url": "https://support.discord.com/hc/en-us/articles/115002192352-Automated-User-Accounts-Self-Bots"
      },
      {
        "label": "Discord: phone QR login",
        "url": "https://support.discord.com/hc/en-us/articles/360039213771-QR-Code-Login-FAQ"
      }
    ]
  },
  "signal": {
    "name": "Signal",
    "mode": "Cloud linked device · unofficial",
    "effort": "Scan a QR code · watched in the cloud",
    "summary": "Link Signal from your phone; no desktop installation is needed.",
    "coverage": "Watches ordinary incoming messages, synced outgoing messages, and their edits received by the linked device, and keeps only the ones removed by a remote delete. signal-cli is unofficial and must stay current.",
    "needs": [
      "Your phone, signed in to Signal",
      "An available linked-device slot"
    ],
    "finish": [
      "In Undelete, choose Connections → Signal, name the account, and authorize the hosted connection.",
      "On your primary phone, open Signal → Settings (your profile) → Linked devices → Link a new device (or +).",
      "Scan the QR code shown in Undelete and approve the device named Undelete Cloud. Wait for Connected."
    ],
    "exclusions": "No disappearing or view-once messages, existing Signal Desktop database import, messages that outlive the watch window, or attachment file downloads.",
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
    "title": "Start keeping deleted messages",
    "description": "Connect your accounts without installing anything on your computer. Undelete keeps only the messages that are later deleted.",
    "category": "START HERE",
    "sections": [
      {
        "id": "account",
        "title": "Create your workspace",
        "steps": [
          "Choose Create your archive. Use a username and a unique password of at least 12 characters.",
          "Enter the invitation code if your Undelete instance requires one.",
          "Open Connections and choose an account. WhatsApp, Telegram, and Signal use hosted phone linking. Discord offers an explicitly experimental personal cloud connection when the operator enables it, plus an optional browser extension."
        ],
        "note": "The signed-out preview contains sample deleted messages. Your own archive starts empty and stays empty until a message you are watching is deleted. Save the one-time recovery key shown after registration in your password manager. Use Forgot your password? on the sign-in screen to reset your password with that key."
      },
      {
        "id": "pair",
        "title": "Scan once, watch in the cloud",
        "steps": [
          "Read the platform’s coverage and authorize Undelete to host your linked session.",
          "Open the phone’s linking screen: Linked devices for WhatsApp/Signal, Devices for Telegram, or Scan QR Code in Discord Settings. Scan the code shown in Undelete.",
          "Complete any requested password or phone approval. Keep the setup page open until it shows Connected."
        ],
        "paragraphs": [
          "Hosted setup needs no downloads, extension, terminal commands, or personal developer credentials. Initial scanning is easiest with a second screen."
        ]
      },
      {
        "id": "verify",
        "title": "Verify your first deleted message",
        "paragraphs": [
          "Connected confirms a running platform session. It does not prove that deletions reach your archive. New messages wait privately in the watch window and are not shown; only a deletion moves a message into Undelete. The connection screen separately checks whether a deleted message has reached your archive."
        ],
        "steps": [
          "Send a harmless message in your own chat. It does not appear in Undelete yet.",
          "Optionally edit it once or twice. Edits alone do not keep a message.",
          "Delete it for everyone in the original app, then confirm it appears in Undelete marked Deleted, with each edit it had before deletion."
        ],
        "note": "Undelete never sends or deletes a test message for you. It cannot keep a message it did not receive before the deletion, and it cannot keep one whose deletion the platform never delivered."
      },
      {
        "id": "history",
        "title": "Read a deleted message and its edits",
        "steps": [
          "Open a deleted message in your archive. Timeline shows the events received before the deletion, newest first; each saved text revision has a version number.",
          "Choose Compare changes to see additions and removals between consecutive versions. Very long or substantially different revisions show both complete texts instead.",
          "For longer histories, use Older, Newer, or the page number. First captured activity jumps to the beginning; Latest activity returns to the most recent page.",
          "If another event arrives while you read, choose Refresh history when you are ready. Your current page stays in place until then."
        ],
        "note": "A page contains up to 30 events, including the deletion. Version comparisons continue across page boundaries. Export includes every stored version of every deleted message, regardless of the page you are viewing."
      },
      {
        "id": "keep-running",
        "title": "The watch continues in the cloud",
        "paragraphs": [
          "Once a hosted connection is established, you can close Undelete, turn off your computer, and use your messaging apps normally. The server receives messages and deletions in the background.",
          "A platform outage, expired linked device, or server interruption can still leave gaps: a message deleted while the connection is down is missed. The server retries lost connections automatically; if phone approval is needed, Connections will show Needs attention."
        ],
        "links": [
          {
            "label": "Continuous watching and recovery",
            "url": "/docs/running"
          }
        ]
      },
      {
        "id": "discord",
        "title": "Discord availability",
        "paragraphs": [
          "Discord offers an experimental personal cloud connection when the operator enables it. It can run while your computer is off, but Discord forbids automated personal accounts and may terminate them. Read its account-risk notice before linking. The optional browser extension still requires an open Discord Web tab."
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
          "Settings lets you choose the watch window (1, 3, 7, or 30 days; 7 days by default), how long preserved deleted messages are retained, and export your archive. A message that is not deleted within its watch window is discarded and cannot be recovered later. Pause stops storing new events while the cloud session stays connected. Disconnect removes the saved cloud login and stops the watch; your archive remains until you delete it. Account deletion removes the archive, the messages waiting in the watch window, and stored sessions."
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
    "category": "CONNECT AN ACCOUNT",
    "platform": "discord",
    "title": "Connect personal Discord in the cloud",
    "description": "Phone-approved, experimental access to your own DMs. Understand Discord’s account restrictions before linking.",
    "sections": [
      {
        "id": "access",
        "title": "Understand the account risk",
        "paragraphs": [
          "Discord does not offer a supported general-purpose cloud API for watching a personal account’s DMs. This connector uses an unofficial personal session. Discord forbids automated personal accounts and can terminate accounts that use them.",
          "The operator must enable this experiment. It is not an approved Discord integration, and phone approval does not make it compliant with Discord’s rules. Do not rely on uninterrupted access or a production service guarantee."
        ],
        "links": [
          {
            "label": "Read Discord’s policy",
            "url": "https://support.discord.com/hc/en-us/articles/115002192352-Automated-User-Accounts-Self-Bots"
          }
        ]
      },
      {
        "id": "platform-setup",
        "title": "Have your phone ready",
        "bullets": [
          "Your phone, signed in to your own Discord account",
          "Acceptance of the account risk before starting this unofficial connection"
        ],
        "paragraphs": [
          "No browser extension, bot token, developer application, or terminal is required for the cloud experiment. The account session is created only after you approve it on your phone."
        ]
      },
      {
        "id": "connect",
        "title": "Link your own account",
        "steps": [
          "In Undelete, choose Connections → Discord. Read the account-risk notice, name the source, and acknowledge both consent boxes.",
          "On your phone, open Discord → your profile → Settings → Scan QR Code. Scan the code generated in your signed-in Undelete workspace.",
          "Review the phone approval screen and approve the login only if you intend to give Undelete a personal session on its server. Wait for Connected, then send and delete a harmless DM to confirm it appears in your archive."
        ],
        "note": "Approving this QR signs your personal account into Undelete’s server. Generate the code yourself inside your signed-in workspace and keep it private.",
        "links": [
          {
            "label": "Discord: phone QR login",
            "url": "https://support.discord.com/hc/en-us/articles/360039213771-QR-Code-Login-FAQ"
          }
        ]
      },
      {
        "id": "verify",
        "title": "Verify a deletion before relying on it",
        "steps": [
          "Wait until the platform connection reports Connected.",
          "Send a harmless DM to a person who has agreed to help test, or use an existing conversation you are authorized to archive. It does not appear in Undelete yet; new messages wait privately in the watch window.",
          "Delete the test message in Discord. Confirm it appears in Undelete marked Deleted, with any edits you made before deleting.",
          "Close the Undelete website and your computer. The hosted collector continues while its server and Discord session remain available."
        ],
        "note": "Only messages received while the watch is active and deleted within the watch window can be kept. Live account linking and deletion verification remain required to validate this experimental connector."
      },
      {
        "id": "privacy",
        "title": "What the server stores",
        "paragraphs": [
          "The approved personal session is stored encrypted in the source’s private queue. It is never returned by the Undelete API or placed in application logs. The server holds the decryption key.",
          "Only allowlisted fields from identified DMs/group DMs enter the encrypted holding buffer, where they wait for the length of your watch window. A message Discord never deletes is discarded at the end of that window. A deleted one moves to your archive with the edits received before the deletion. The connector does not send Discord messages, mark them read, download attachments, or retain server-channel messages. Temporary message metadata used for partial edits expires after seven days.",
          "Pause drops new activity while keeping the session connected. Disconnect stops the watch and deletes the saved session from active storage; deleted messages already in your archive remain. Use Discord’s device/session controls to revoke its login as well. Restricted backups can retain older encrypted copies until rotation."
        ]
      },
      {
        "id": "fixes",
        "title": "When linking or the watch stops",
        "paragraphs": [
          "Expired code: request a fresh one from Undelete and approve it before it expires.",
          "Additional verification or CAPTCHA: this connector stops. Complete account checks in the official Discord app; it does not solve or bypass verification challenges.",
          "Session revoked: choose Relink, review the warning again, and approve the intended account. The original source is bound to one Discord account; use another source for a different account.",
          "Repeated protocol failures or account restrictions require operator attention. Do not repeatedly retry a rejected login."
        ]
      },
      {
        "id": "browser",
        "title": "Optional browser extension",
        "paragraphs": [
          "If cloud access is disabled or you choose the browser option during setup, the existing experimental extension can observe a selected Discord Web tab. It requires Chrome and that tab to stay open."
        ],
        "links": [
          {
            "label": "Browser extension instructions",
            "url": "/docs/discord-extension"
          }
        ]
      }
    ]
  },
  "whatsapp": {
    "title": "Connect WhatsApp in the cloud",
    "description": "Link WhatsApp from your phone and keep the messages that get deleted.",
    "category": "HOSTED ACCOUNT LINKING",
    "platform": "whatsapp",
    "sections": [
      {
        "id": "coverage",
        "title": "What gets kept",
        "paragraphs": [
          "Watches ordinary messages and their edits delivered to your linked device, and keeps only the ones that are later deleted. Uses unofficial software, so WhatsApp changes or account restrictions can interrupt the watch.",
          "Every other message waits privately in the encrypted holding buffer for your watch window and is then discarded. Edits alone do not keep a message. Nothing that was never deleted is kept."
        ],
        "note": "No view-once or disappearing messages, messages deleted before linking, messages that outlive the watch window, or attachment file downloads."
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
          "In Undelete, choose Connections → WhatsApp, name the account, and authorize the hosted connection.",
          "iPhone: WhatsApp → Settings → Linked devices → Link a device. Android: WhatsApp → ⋮ → Linked devices → Link a device.",
          "Unlock your phone if asked, scan the code shown in Undelete, and approve the link. Wait for Connected."
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
        "note": "The QR code links your account to a server operated by Undelete. Keep it private and use the scanner inside the messaging app."
      },
      {
        "id": "verify",
        "title": "Verify your first deleted message",
        "paragraphs": [
          "Connected confirms a running platform session. It does not prove that deletions reach your archive. New messages wait privately in the watch window and are not shown; only a deletion moves a message into Undelete. The connection screen separately checks whether a deleted message has reached your archive."
        ],
        "steps": [
          "Send a harmless message in your own chat. It does not appear in Undelete yet.",
          "Optionally edit it once or twice. Edits alone do not keep a message.",
          "Delete it for everyone in WhatsApp, then confirm it appears in Undelete marked Deleted, with each edit it had before deletion."
        ],
        "note": "Undelete never sends or deletes a test message for you. It cannot keep a message it did not receive before the deletion, and it cannot keep one whose deletion the platform never delivered."
      },
      {
        "id": "keep-running",
        "title": "The watch continues in the cloud",
        "paragraphs": [
          "Once a hosted connection is established, you can close Undelete, turn off your computer, and use your messaging apps normally. The server receives messages and deletions in the background.",
          "A platform outage, expired linked device, or server interruption can still leave gaps: a message deleted while the connection is down is missed. The server retries lost connections automatically; if phone approval is needed, Connections will show Needs attention."
        ],
        "links": [
          {
            "label": "Continuous watching and recovery",
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
          "Undelete stores the linked session on its server so the watch can continue while your devices are off. Stored credentials, messages waiting in the watch window, and preserved deleted messages are encrypted at rest, but the server can decrypt them to run the service. This is not end-to-end encrypted cloud storage."
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
    "description": "Scan a Telegram QR code. Undelete keeps watching on its server.",
    "category": "HOSTED ACCOUNT LINKING",
    "platform": "telegram",
    "sections": [
      {
        "id": "coverage",
        "title": "What gets kept",
        "paragraphs": [
          "Watches ordinary cloud-chat messages and their edits, and keeps only the ones Telegram later reports as deleted. Telegram sometimes omits deletion notifications, so some deleted messages are missed.",
          "Every other message waits privately in the encrypted holding buffer for your watch window and is then discarded. Edits alone do not keep a message. Nothing that was never deleted is kept."
        ],
        "note": "No secret chats, self-destructing messages, historical backfill, messages that outlive the watch window, or attachment file downloads."
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
          "In Undelete, choose Connections → Telegram, name the account, and authorize the hosted connection.",
          "On your phone, open Telegram → Settings → Devices → Link Desktop Device. Scan the QR code shown in Undelete.",
          "If prompted, enter your Telegram two-step verification password in Undelete. Wait for Connected."
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
        "note": "Undelete’s operator configures the Telegram application credentials. You do not need to create your own Telegram developer application. Your sign-in password is used for the current step and is not stored in application logs."
      },
      {
        "id": "verify",
        "title": "Verify your first deleted message",
        "paragraphs": [
          "Connected confirms a running platform session. It does not prove that deletions reach your archive. New messages wait privately in the watch window and are not shown; only a deletion moves a message into Undelete. The connection screen separately checks whether a deleted message has reached your archive."
        ],
        "steps": [
          "Send a harmless message in your own chat. It does not appear in Undelete yet.",
          "Optionally edit it once or twice. Edits alone do not keep a message.",
          "Delete it for everyone in Telegram, then confirm it appears in Undelete marked Deleted, with each edit it had before deletion."
        ],
        "note": "Undelete never sends or deletes a test message for you. It cannot keep a message it did not receive before the deletion, and it cannot keep one whose deletion Telegram never delivered."
      },
      {
        "id": "keep-running",
        "title": "The watch continues in the cloud",
        "paragraphs": [
          "Once a hosted connection is established, you can close Undelete, turn off your computer, and use your messaging apps normally. The server receives messages and deletions in the background.",
          "A platform outage, expired linked device, or server interruption can still leave gaps: a message deleted while the connection is down is missed. The server retries lost connections automatically; if phone approval is needed, Connections will show Needs attention."
        ],
        "links": [
          {
            "label": "Continuous watching and recovery",
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
          "Undelete stores the linked session on its server so the watch can continue while your devices are off. Stored credentials, messages waiting in the watch window, and preserved deleted messages are encrypted at rest, but the server can decrypt them to run the service. This is not end-to-end encrypted cloud storage."
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
        "title": "What gets kept",
        "paragraphs": [
          "Watches ordinary incoming messages, synced outgoing messages, and their edits received by the linked device, and keeps only the ones removed by a remote delete. signal-cli is unofficial and must stay current.",
          "Every other message waits privately in the encrypted holding buffer for your watch window and is then discarded. Edits alone do not keep a message. Nothing that was never deleted is kept."
        ],
        "note": "No disappearing or view-once messages, existing Signal Desktop database import, messages that outlive the watch window, or attachment file downloads."
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
          "In Undelete, choose Connections → Signal, name the account, and authorize the hosted connection.",
          "On your primary phone, open Signal → Settings (your profile) → Linked devices → Link a new device (or +).",
          "Scan the QR code shown in Undelete and approve the device named Undelete Cloud. Wait for Connected."
        ],
        "links": [
          {
            "label": "Signal: linked devices",
            "url": "https://support.signal.org/hc/en-us/articles/360007320551-Linked-Devices"
          }
        ],
        "note": "The QR code links your account to a server operated by Undelete. Keep it private and use the scanner inside the messaging app."
      },
      {
        "id": "verify",
        "title": "Verify your first deleted message",
        "paragraphs": [
          "Connected confirms a running platform session. It does not prove that deletions reach your archive. New messages wait privately in the watch window and are not shown; only a deletion moves a message into Undelete. The connection screen separately checks whether a deleted message has reached your archive."
        ],
        "steps": [
          "Send a harmless message in your own chat. It does not appear in Undelete yet.",
          "Optionally edit it once or twice. Edits alone do not keep a message.",
          "Delete it for everyone in Signal, then confirm it appears in Undelete marked Deleted, with each edit it had before deletion."
        ],
        "note": "Undelete never sends or deletes a test message for you. It cannot keep a message it did not receive before the deletion, and it cannot keep one whose deletion the platform never delivered."
      },
      {
        "id": "keep-running",
        "title": "The watch continues in the cloud",
        "paragraphs": [
          "Once a hosted connection is established, you can close Undelete, turn off your computer, and use your messaging apps normally. The server receives messages and deletions in the background.",
          "A platform outage, expired linked device, or server interruption can still leave gaps: a message deleted while the connection is down is missed. The server retries lost connections automatically; if phone approval is needed, Connections will show Needs attention."
        ],
        "links": [
          {
            "label": "Continuous watching and recovery",
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
          "Undelete stores the linked session on its server so the watch can continue while your devices are off. Stored credentials, messages waiting in the watch window, and preserved deleted messages are encrypted at rest, but the server can decrypt them to run the service. This is not end-to-end encrypted cloud storage."
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
    "description": "Clear next steps for QR codes, cloud sessions, and deleted messages that do not show up.",
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
        "title": "Connected, but a deleted message is missing",
        "bullets": [
          "Confirm this is your real workspace rather than the signed-out demo.",
          "Remember that messages which were never deleted are not shown. Send a new ordinary message to your own chat after the connection shows Connected, then delete it for everyone.",
          "Check that the message was sent after the connection was Connected and deleted within your watch window. A message deleted after its watch window ended has already been discarded.",
          "Check whether the source is paused and whether the conversation/message type is covered.",
          "Deletion events are not guaranteed on every platform. A message whose deletion the platform never delivered, or that was deleted during a connection gap, cannot be kept."
        ]
      },
      {
        "id": "account",
        "title": "Cannot sign in to Undelete",
        "paragraphs": [
          "Check your username and password. New accounts may require an invitation code. Password changes sign out other sessions. Use Forgot your password? with your saved recovery key. Successful recovery signs out previous sessions and gives you a replacement key. If you are signed in, Settings lets you create or replace a key after confirming your password. Without both the password and recovery key, contact the operator; access cannot be automatically restored."
        ]
      }
    ]
  },
  "running": {
    "title": "Continuous watching and recovery",
    "description": "How hosted connections behave when you close the browser or a connection drops.",
    "category": "USING UNDELETE",
    "sections": [
      {
        "id": "keep-running",
        "title": "The watch continues in the cloud",
        "paragraphs": [
          "Once a hosted connection is established, you can close Undelete, turn off your computer, and use your messaging apps normally. The server receives messages and deletions in the background.",
          "A platform outage, expired linked device, or server interruption can still leave gaps: a message deleted while the connection is down is missed. The server retries lost connections automatically; if phone approval is needed, Connections will show Needs attention."
        ],
        "links": [
          {
            "label": "Continuous watching and recovery",
            "url": "/docs/running"
          }
        ]
      },
      {
        "id": "restart",
        "title": "Restarts and connection gaps",
        "paragraphs": [
          "Hosted sessions are saved in encrypted per-connection storage. The service resumes enabled connections after a normal server restart and retries unexpected collector exits with a delay. Expired logins may require a fresh scan.",
          "Signal requires working session files while running. These live on a temporary in-memory filesystem in production and are checkpointed into encrypted storage every five seconds. A sudden machine failure can lose the latest checkpoint interval; the service cannot promise that every deletion is seen through an outage."
        ]
      },
      {
        "id": "controls",
        "title": "Pause, disconnect, and relink",
        "bullets": [
          "Pause: keep the platform session connected but discard new events. A message deleted while paused is not kept.",
          "Disconnect: stop the collector and remove its stored cloud session. Deleted messages already in your archive remain.",
          "Relink: reset one connection’s platform login and scan again. Deleted messages already in your archive remain.",
          "A message that changes or is deleted before Undelete receives it cannot be reconstructed."
        ]
      },
      {
        "id": "local",
        "title": "Older local connections and Discord",
        "paragraphs": [
          "Connections identifies whether each source watches in the cloud or uses a local companion. Older local companions still depend on their computer. Choose Continue setup and authorize Move connection to cloud to replace one with a hosted session.",
          "Discord’s optional extension remains local and requires Chrome with the selected Discord Web tab open. The separate experimental cloud connector continues on the server, subject to Discord’s account restrictions."
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
  privacy: privacyPolicy,
  "discord-extension": {
    "title": "Use the optional Discord browser extension",
    "description": "Watch DMs and group DMs delivered to your own Discord Web tab and keep the ones that get deleted.",
    "category": "BROWSER EXTENSION · EXPERIMENTAL",
    "platform": "discord",
    "sections": [
      {
        "id": "coverage",
        "title": "Your deleted DMs, in your own account",
        "paragraphs": [
          "The experimental Undelete extension observes personal DM messages, edits, and deletions received by your signed-in Discord Web tab. Only messages that are later deleted are kept. It excludes server channels. Chrome and that tab must remain open.",
          "This is a passive browser collector. You sign into Discord normally; Undelete does not request your Discord password or token, install a server bot, send messages, or open another Discord API session.",
          "The extension uploads what it observes to your archive, where each message waits privately in the encrypted holding buffer for your watch window. A message Discord never deletes is discarded at the end of that window. A deleted one is kept with the edits received before the deletion."
        ],
        "note": "Only identified DMs and group DMs delivered after the watch starts and deleted within the watch window. No server channels, native-app capture, historical recovery, ephemeral interactions, or attachment file downloads. This unofficial beta may break or conflict with Discord policies; live account verification is still required."
      },
      {
        "id": "before",
        "title": "Before you start",
        "bullets": [
          "Chrome 125 or newer on a computer",
          "Your own account signed in to Discord Web",
          "Permission to load the extension and observe your chosen tab"
        ],
        "note": "The extension is a downloadable beta, not a Chrome Web Store release. Chrome shows a broad debugging-permission notice: the implementation attaches only to the Discord tab you select and reads incoming Gateway frames. It ignores outgoing frames, HTTP bodies, cookies, and headers. Observed messages upload to your chosen Undelete archive."
      },
      {
        "id": "platform-setup",
        "title": "Install and pair the extension",
        "steps": [
          "In Connections, choose Connect Discord, name the source, and continue.",
          "Download and extract the Undelete Discord extension ZIP.",
          "Open chrome://extensions, turn on Developer mode, choose Load unpacked, and select the extracted afterword-discord-extension folder.",
          "Open the Undelete extension, enter your archive address and pairing code, and allow access to that archive.",
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
        "note": "No Node.js, terminal, bot token, server selection, or developer application is needed. Keep the extracted extension folder: Chrome loads the extension from that location. Treat the Undelete pairing code as private."
      },
      {
        "id": "verify",
        "title": "Check that your first deleted message arrived",
        "paragraphs": [
          "“Connected” means the platform session is running. A deleted message in your archive confirms the full route works. New messages wait privately in the watch window and are not shown until they are deleted. The setup screen checks this automatically; allow up to 30 seconds for status updates."
        ],
        "steps": [
          "In a covered conversation, send a harmless test message such as “Undelete connection test.” It does not appear in the archive yet.",
          "Optionally edit that message. Edits alone do not keep it.",
          "Delete it in Discord. Confirm it appears in Undelete marked Deleted, with each edit it had before deletion."
        ],
        "note": "Test with your own messages in conversations you are authorized to archive. Undelete does not send or delete a test message for you."
      },
      {
        "id": "keep-running",
        "title": "Keep Discord Web open",
        "paragraphs": [
          "Keep Chrome running with your selected Discord Web tab open and signed in. Background tabs can receive events, but browser suspension, sleep, network gaps, and canceled debugging can interrupt the watch, and a deletion that arrives during a gap is missed.",
          "After restarting Chrome or updating the extension, open it and click Start capturing DMs again. Starting reloads the tab once so the collector sees the new Discord connection."
        ],
        "bullets": [
          "Stop capturing detaches from the tab while queued events can still upload.",
          "Pausing the source in Undelete discards incoming activity, matching other sources. Resume does not recover paused events.",
          "Use a separate Undelete source and Chrome profile for a different Discord account. A detected account switch stops the watch to prevent mixing archives."
        ]
      },
      {
        "id": "storage",
        "title": "Local copies and your archive",
        "paragraphs": [
          "The extension keeps its archive key, DM metadata, and retry queue encrypted in its private IndexedDB storage. The encryption key lives in the same browser profile; this does not protect against someone who controls that profile or device.",
          "Queued events survive a browser restart and are removed after the server acknowledges them. A queue limit stops the watch instead of silently dropping deliveries. Recent message metadata used to merge partial edits expires after seven days or on message deletion. Attachment metadata is stored; files are not downloaded.",
          "The hosted archive uses the watch window and retention settings in your Undelete workspace. Disconnecting the extension clears its local connection and metadata once the queue is empty. Uninstalling it removes local extension storage; export any required data first."
        ]
      },
      {
        "id": "fixes",
        "title": "If deleted messages do not appear",
        "bullets": [
          "Finish ordinary Discord sign-in in the selected tab and click Start capturing DMs in the extension.",
          "Close DevTools for that Discord tab; another debugger can displace the watch. Restart if Chrome’s debugging notice was canceled.",
          "Check the extension status. Paired only confirms the archive link. Waiting for Discord is not a verified delivery.",
          "Only identified DMs and group DMs are watched, and only deleted ones are kept. A server message, a message from before the watch started, a message that was never deleted, or an event Discord never delivers will not appear.",
          "If archive access is down, events remain encrypted locally. Restore access before the queue reaches its 10,000-event limit.",
          "Unsupported encoding/compression or an account switch stops the watch visibly. Update the extension or create a separate account connection. Do not paste a Discord user token to work around an error."
        ],
        "links": [
          {
            "label": "Privacy and retention",
            "url": "/docs/privacy"
          }
        ]
      }
    ]
  }
  ,
  "billing": {
    "title": "Plans, trials, and billing",
    "description": "How the free trial works, what a subscription covers, and how to cancel.",
    "category": "USING UNDELETE",
    "sections": [
      {
        "id": "trial",
        "title": "Your free trial",
        "paragraphs": [
          "Every new workspace starts with a free trial. No payment method is needed to connect accounts and keep deleted messages during the trial. Settings → Your plan shows the exact end date.",
          "When the trial ends without a subscription, the watch pauses: hosted connections stop and new events wait at the collector. Deleted messages already in your archive stay available to read, search, and export, and nothing already kept is deleted by the pause. Retention settings still apply as usual."
        ]
      },
      {
        "id": "subscribe",
        "title": "Starting a subscription",
        "steps": [
          "Open Settings → Your plan and choose Start subscription, or Add payment method during the trial.",
          "Complete checkout on Stripe’s secure page. Undelete never sees your card number; it receives only a customer reference and the subscription status.",
          "Return to Undelete. The plan card updates once Stripe confirms the subscription, usually within a few seconds.",
          "If any connection shows Capture stopped, open Connections and choose Resume capture."
        ],
        "note": "Adding a payment method during the trial does not shorten it. The first charge happens when the trial ends."
      },
      {
        "id": "manage",
        "title": "Invoices, payment methods, and cancellation",
        "paragraphs": [
          "Manage billing opens Stripe’s customer portal, where you can download invoices, change the payment method, or cancel. A cancelled subscription keeps watching until the end of the paid period, shown as Access ends in Settings; you can reactivate before then.",
          "If a payment fails, the watch continues for a short grace period while Stripe retries. Update the payment method from Manage billing to avoid a pause.",
          "Deleting your account cancels the subscription and removes the archive; see the privacy guide for what deletion covers."
        ]
      }
    ]
  },
  "terms": {
    "title": "Terms of service",
    "description": "The agreement that applies to every Undelete workspace.",
    "category": "PRIVACY",
    "sections": [
      {
        "id": "service",
        "title": "The service",
        "paragraphs": [
          "Undelete is operated by [Operator legal name] (“we”). It watches messages delivered to personal messaging accounts that you link, and keeps only the messages that are later deleted on the platform, together with the edits they had before deletion, in a private workspace for you to read, search, and export. Messages that are not deleted within your watch window are discarded and are never kept.",
          "Undelete is not affiliated with, endorsed by, or supported by Discord, Telegram, Signal, or WhatsApp. Linking a personal account uses that platform’s own device-linking or an unofficial method described in each platform guide. Some platforms restrict automated personal accounts; you are responsible for reviewing and complying with each platform’s terms, and you accept the risk of account limits or termination that a platform may impose."
        ]
      },
      {
        "id": "responsibilities",
        "title": "Your responsibilities",
        "paragraphs": [
          "You may only link accounts that belong to you, and you must have the right to keep the deleted messages the service preserves. Do not use Undelete to monitor another person without a lawful basis, and do not use it in a way that violates the law where you live or the rights of the people you communicate with.",
          "Keep your password and recovery key private. You are responsible for activity in your workspace. We cannot restore access to an account whose password and recovery key are both lost."
        ]
      },
      {
        "id": "payment",
        "title": "Trials, fees, and cancellation",
        "paragraphs": [
          "New workspaces include a free trial. After the trial, continued watching requires a paid subscription billed in advance by Stripe at the price shown at checkout, plus any applicable taxes. You can cancel at any time from Manage billing; the watch continues until the end of the paid period, and fees already paid are not refunded except where the law requires.",
          "We may change prices with at least 30 days’ notice shown in the app. Continuing to use a paid plan after the change takes effect means you accept the new price."
        ]
      },
      {
        "id": "limits",
        "title": "Coverage, availability, and liability",
        "paragraphs": [
          "The service depends on third-party platforms and on your linked sessions staying connected. Messages sent or deleted while a connection is offline, deletions the platform never delivers, messages deleted after their watch window ended, disappearing messages, and file bodies are not kept. The service is provided as is, without a guarantee of uninterrupted availability or that every deleted message is kept.",
          "To the fullest extent permitted by law, our total liability for any claim relating to the service is limited to the fees you paid in the twelve months before the claim. We are not liable for indirect or consequential loss, including loss of messages or platform account restrictions."
        ]
      },
      {
        "id": "changes",
        "title": "Termination and changes",
        "paragraphs": [
          "You can delete your workspace at any time from Settings, which removes your archive and revokes every connection. We may suspend or end access for misuse, for non-payment after the trial, or if we discontinue the service, in which case we will give reasonable notice and a chance to export your archive where practical.",
          "We may update these terms; material changes are announced in the app before they apply. These terms are governed by the laws of [Governing jurisdiction]. Questions go to [Support contact]. Last updated September 11, 2026."
        ]
      }
    ]
  }
};
