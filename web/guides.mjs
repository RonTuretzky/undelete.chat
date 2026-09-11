import { privacyPolicy } from './privacy-policy.mjs';
export const platformOrder = ["whatsapp","telegram","signal"];
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
      "In undelete.chat, choose Connections → WhatsApp, name the account, and authorize the hosted connection.",
      "iPhone: WhatsApp → Settings → Linked devices → Link a device. Android: WhatsApp → ⋮ → Linked devices → Link a device.",
      "Unlock your phone if asked, scan the code shown in undelete.chat, and approve the link. Wait for Connected."
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
    "summary": "Scan a Telegram QR code. undelete.chat keeps watching on its server.",
    "coverage": "Watches ordinary cloud-chat messages and their edits, and keeps only the ones Telegram later reports as deleted. Telegram sometimes omits deletion notifications, so some deleted messages are missed.",
    "needs": [
      "Your phone, signed in to Telegram",
      "Your two-step verification password, if enabled"
    ],
    "finish": [
      "In undelete.chat, choose Connections → Telegram, name the account, and authorize the hosted connection.",
      "On your phone, open Telegram → Settings → Devices → Link Desktop Device. Scan the QR code shown in undelete.chat.",
      "If prompted, enter your Telegram two-step verification password in undelete.chat. Wait for Connected."
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
      "In undelete.chat, choose Connections → Signal, name the account, and authorize the hosted connection.",
      "On your primary phone, open Signal → Settings (your profile) → Linked devices → Link a new device (or +).",
      "Scan the QR code shown in undelete.chat and approve the device named undelete.chat Cloud. Wait for Connected."
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
    "description": "Connect your accounts without installing anything on your computer. undelete.chat keeps only the messages that are later deleted.",
    "category": "START HERE",
    "sections": [
      {
        "id": "account",
        "title": "Create your workspace",
        "steps": [
          "Choose Create your archive. Use a username and a unique password of at least 12 characters.",
          "Enter the invitation code if your undelete.chat instance requires one.",
          "Open Connections and choose an account. WhatsApp, Telegram, and Signal use hosted phone linking."
        ],
        "note": "The signed-out preview contains sample deleted messages. Your own archive starts empty and stays empty until a message you are watching is deleted. Save the one-time recovery key shown after registration in your password manager. Use Forgot your password? on the sign-in screen to reset your password with that key."
      },
      {
        "id": "pair",
        "title": "Scan once, watch in the cloud",
        "steps": [
          "Read the platform’s coverage and authorize undelete.chat to host your linked session.",
          "Open the phone’s linking screen: Linked devices for WhatsApp/Signal, or Devices for Telegram. Scan the code shown in undelete.chat.",
          "Complete any requested password or phone approval. Keep the setup page open until it shows Connected."
        ],
        "paragraphs": [
          "Hosted setup needs no downloads, terminal commands, or personal developer credentials. Initial scanning is easiest with a second screen."
        ]
      },
      {
        "id": "verify",
        "title": "Verify your first deleted message",
        "paragraphs": [
          "Connected confirms a running platform session. It does not prove that deletions reach your archive. New messages wait privately in the watch window and are not shown; only a deletion moves a message into undelete.chat. The connection screen separately checks whether a deleted message has reached your archive."
        ],
        "steps": [
          "Send a harmless message in your own chat. It does not appear in undelete.chat yet.",
          "Optionally edit it once or twice. Edits alone do not keep a message.",
          "Delete it for everyone in the original app, then confirm it appears in undelete.chat marked Deleted, with each edit it had before deletion."
        ],
        "note": "undelete.chat never sends or deletes a test message for you. It cannot keep a message it did not receive before the deletion, and it cannot keep one whose deletion the platform never delivered."
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
          "Once a hosted connection is established, you can close undelete.chat, turn off your computer, and use your messaging apps normally. The server receives messages and deletions in the background.",
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
          "In undelete.chat, choose Connections → WhatsApp, name the account, and authorize the hosted connection.",
          "iPhone: WhatsApp → Settings → Linked devices → Link a device. Android: WhatsApp → ⋮ → Linked devices → Link a device.",
          "Unlock your phone if asked, scan the code shown in undelete.chat, and approve the link. Wait for Connected."
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
        "note": "The QR code links your account to a server operated by undelete.chat. Keep it private and use the scanner inside the messaging app."
      },
      {
        "id": "verify",
        "title": "Verify your first deleted message",
        "paragraphs": [
          "Connected confirms a running platform session. It does not prove that deletions reach your archive. New messages wait privately in the watch window and are not shown; only a deletion moves a message into undelete.chat. The connection screen separately checks whether a deleted message has reached your archive."
        ],
        "steps": [
          "Send a harmless message in your own chat. It does not appear in undelete.chat yet.",
          "Optionally edit it once or twice. Edits alone do not keep a message.",
          "Delete it for everyone in WhatsApp, then confirm it appears in undelete.chat marked Deleted, with each edit it had before deletion."
        ],
        "note": "undelete.chat never sends or deletes a test message for you. It cannot keep a message it did not receive before the deletion, and it cannot keep one whose deletion the platform never delivered."
      },
      {
        "id": "keep-running",
        "title": "The watch continues in the cloud",
        "paragraphs": [
          "Once a hosted connection is established, you can close undelete.chat, turn off your computer, and use your messaging apps normally. The server receives messages and deletions in the background.",
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
          "undelete.chat stores the linked session on its server so the watch can continue while your devices are off. Stored credentials, messages waiting in the watch window, and preserved deleted messages are encrypted at rest, but the server can decrypt them to run the service. This is not end-to-end encrypted cloud storage."
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
    "description": "Scan a Telegram QR code. undelete.chat keeps watching on its server.",
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
          "In undelete.chat, choose Connections → Telegram, name the account, and authorize the hosted connection.",
          "On your phone, open Telegram → Settings → Devices → Link Desktop Device. Scan the QR code shown in undelete.chat.",
          "If prompted, enter your Telegram two-step verification password in undelete.chat. Wait for Connected."
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
        "note": "undelete.chat’s operator configures the Telegram application credentials. You do not need to create your own Telegram developer application. Your sign-in password is used for the current step and is not stored in application logs."
      },
      {
        "id": "verify",
        "title": "Verify your first deleted message",
        "paragraphs": [
          "Connected confirms a running platform session. It does not prove that deletions reach your archive. New messages wait privately in the watch window and are not shown; only a deletion moves a message into undelete.chat. The connection screen separately checks whether a deleted message has reached your archive."
        ],
        "steps": [
          "Send a harmless message in your own chat. It does not appear in undelete.chat yet.",
          "Optionally edit it once or twice. Edits alone do not keep a message.",
          "Delete it for everyone in Telegram, then confirm it appears in undelete.chat marked Deleted, with each edit it had before deletion."
        ],
        "note": "undelete.chat never sends or deletes a test message for you. It cannot keep a message it did not receive before the deletion, and it cannot keep one whose deletion Telegram never delivered."
      },
      {
        "id": "keep-running",
        "title": "The watch continues in the cloud",
        "paragraphs": [
          "Once a hosted connection is established, you can close undelete.chat, turn off your computer, and use your messaging apps normally. The server receives messages and deletions in the background.",
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
          "undelete.chat stores the linked session on its server so the watch can continue while your devices are off. Stored credentials, messages waiting in the watch window, and preserved deleted messages are encrypted at rest, but the server can decrypt them to run the service. This is not end-to-end encrypted cloud storage."
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
          "In undelete.chat, choose Connections → Signal, name the account, and authorize the hosted connection.",
          "On your primary phone, open Signal → Settings (your profile) → Linked devices → Link a new device (or +).",
          "Scan the QR code shown in undelete.chat and approve the device named undelete.chat Cloud. Wait for Connected."
        ],
        "links": [
          {
            "label": "Signal: linked devices",
            "url": "https://support.signal.org/hc/en-us/articles/360007320551-Linked-Devices"
          }
        ],
        "note": "The QR code links your account to a server operated by undelete.chat. Keep it private and use the scanner inside the messaging app."
      },
      {
        "id": "verify",
        "title": "Verify your first deleted message",
        "paragraphs": [
          "Connected confirms a running platform session. It does not prove that deletions reach your archive. New messages wait privately in the watch window and are not shown; only a deletion moves a message into undelete.chat. The connection screen separately checks whether a deleted message has reached your archive."
        ],
        "steps": [
          "Send a harmless message in your own chat. It does not appear in undelete.chat yet.",
          "Optionally edit it once or twice. Edits alone do not keep a message.",
          "Delete it for everyone in Signal, then confirm it appears in undelete.chat marked Deleted, with each edit it had before deletion."
        ],
        "note": "undelete.chat never sends or deletes a test message for you. It cannot keep a message it did not receive before the deletion, and it cannot keep one whose deletion the platform never delivered."
      },
      {
        "id": "keep-running",
        "title": "The watch continues in the cloud",
        "paragraphs": [
          "Once a hosted connection is established, you can close undelete.chat, turn off your computer, and use your messaging apps normally. The server receives messages and deletions in the background.",
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
          "undelete.chat stores the linked session on its server so the watch can continue while your devices are off. Stored credentials, messages waiting in the watch window, and preserved deleted messages are encrypted at rest, but the server can decrypt them to run the service. This is not end-to-end encrypted cloud storage."
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
        "note": "Closing the website does not stop a hosted collector. Local companions do depend on the computer running them."
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
        "title": "Cannot sign in to undelete.chat",
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
          "Once a hosted connection is established, you can close undelete.chat, turn off your computer, and use your messaging apps normally. The server receives messages and deletions in the background.",
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
          "A message that changes or is deleted before undelete.chat receives it cannot be reconstructed."
        ]
      },
      {
        "id": "local",
        "title": "Older local connections",
        "paragraphs": [
          "Connections identifies whether each source watches in the cloud or uses a local companion. Older local companions still depend on their computer. Choose Continue setup and authorize Move connection to cloud to replace one with a hosted session."
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
          "Complete checkout on Stripe’s secure page. undelete.chat never sees your card number; it receives only a customer reference and the subscription status.",
          "Return to undelete.chat. The plan card updates once Stripe confirms the subscription, usually within a few seconds.",
          "If any connection shows Capture stopped, open Connections and choose Resume capture."
        ],
        "note": "Adding a payment method during the trial does not shorten it. The first charge happens when the trial ends."
      },
      {
        "id": "premium",
        "title": "Premium: trusted execution environments",
        "paragraphs": [
          "On the standard plan, message content is encrypted at rest but the server holds the decryption key, so the people operating undelete.chat could technically read stored data. Premium is for people who need stronger guarantees: the collectors and the archive run inside a confidential-computing enclave (a trusted execution environment) with keys sealed to attested hardware. Operators, backups, and the hosting provider cannot decrypt the data.",
          "Premium is arranged individually and can include dedicated capacity, more linked accounts, a longer watch window, priority support, and a written data-handling agreement. Email turetzkyron@gmail.com with the accounts you want to link and roughly how many people need it; expect a reply within two business days."
        ]
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
    "description": "The agreement that applies to every undelete.chat workspace.",
    "category": "PRIVACY",
    "sections": [
      {
        "id": "service",
        "title": "The service",
        "paragraphs": [
          "undelete.chat is operated by [Operator legal name] (“we”). It watches messages delivered to personal messaging accounts that you link, and keeps only the messages that are later deleted on the platform, together with the edits they had before deletion, in a private workspace for you to read, search, and export. Messages that are not deleted within your watch window are discarded and are never kept.",
          "undelete.chat is not affiliated with, endorsed by, or supported by Telegram, Signal, or WhatsApp. Linking a personal account uses that platform’s own device-linking or an unofficial method described in each platform guide. Some platforms restrict automated personal accounts; you are responsible for reviewing and complying with each platform’s terms, and you accept the risk of account limits or termination that a platform may impose."
        ]
      },
      {
        "id": "responsibilities",
        "title": "Your responsibilities",
        "paragraphs": [
          "You may only link accounts that belong to you, and you must have the right to keep the deleted messages the service preserves. Do not use undelete.chat to monitor another person without a lawful basis, and do not use it in a way that violates the law where you live or the rights of the people you communicate with.",
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
