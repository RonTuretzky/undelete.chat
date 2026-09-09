const base = Date.now();
const ago = minutes => new Date(base - minutes * 60_000).toISOString();
const definitions = [
  ['discord', 'Maya Chen', 'Design team · #general', ['Let’s ship the new onboarding on Thursday.', 'Let’s ship the new onboarding on Friday.'], false, 8],
  ['telegram', 'Alex Rivera', 'Weekend plans', ['Table booked for 7:30 at the usual place.'], true, 24],
  ['signal', 'Jamie Park', 'Jamie Park', ['The spare key is with the neighbor.', 'The spare key is with Sam, next door.'], false, 46],
  ['whatsapp', 'Sofia Patel', 'Studio group', ['Here’s the first draft. Feedback welcome!'], false, 67],
  ['discord', 'Leo Martin', 'Product team · #launch', ['Launch checklist is ready for review.', 'Launch checklist is ready — please add your notes by 3pm.', 'Launch checklist is ready — please add your notes by 4pm.'], false, 91],
  ['whatsapp', 'Noah Williams', 'Saturday dinner', ['I can bring dessert!'], true, 123],
  ['telegram', 'Emma Wilson', 'Book club', ['Next up: The Creative Act. Who’s in?'], false, 165],
  ['signal', 'Oliver Kim', 'Oliver Kim', ['Can you take a look at this before the meeting?'], true, 198],
];
export const demoMessages = definitions.map(([platform, authorName, chatName, texts, deleted, minutes], i) => {
  const versions = texts.map((text, j) => ({ eventId: `demo-${i}-${j}`, kind: j ? 'edit' : 'create', text, authorName, chatName, occurredAt: ago(minutes + (texts.length - j) * 4), receivedAt: ago(minutes + (texts.length - j) * 4), attachments: [] }));
  if (deleted) versions.push({ eventId: `demo-${i}-delete`, kind: 'delete', occurredAt: ago(minutes), receivedAt: ago(minutes) });
  return { id: `demo-${i}`, platform, authorName, chatName, text: texts.at(-1), status: deleted ? 'deleted' : texts.length > 1 ? 'edited' : 'captured', saved: i === 0 || i === 4, originalMissing: false, versionCount: texts.length, versions, attachments: [], firstSeen: versions[0].receivedAt, lastSeen: ago(minutes) };
});
