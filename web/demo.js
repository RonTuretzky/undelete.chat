const base = Date.now();
const ago = minutes => new Date(base - minutes * 60_000).toISOString();
// Sample data shows the only thing the archive keeps: messages the other side deleted,
// with any edits they made before deleting.
const definitions = [
  ['whatsapp', 'Maya Chen', 'Maya Chen', ['Can you send me the login for the shared account?'], 8],
  ['telegram', 'Alex Rivera', 'Weekend plans', ['Table booked for 7:30 at the usual place.', 'Table booked for 8:00 at the usual place.'], 24],
  ['signal', 'Jamie Park', 'Jamie Park', ['I never said that to her.'], 46],
  ['whatsapp', 'Sofia Patel', 'Studio group', ['Here’s the first draft. Feedback welcome!'], 67],
  ['telegram', 'Leo Martin', 'Launch planning', ['Launch checklist is ready for review.', 'Launch checklist is ready. Please add your notes by 4pm.'], 91],
  ['whatsapp', 'Noah Williams', 'Saturday dinner', ['Honestly I’d rather not come if Sam is there.'], 123],
  ['telegram', 'Emma Wilson', 'Book club', ['Next up: The Creative Act. Who’s in?'], 165],
  ['signal', 'Oliver Kim', 'Oliver Kim', ['Wrong chat, ignore this.'], 198],
];
export const demoMessages = definitions.map(([platform, authorName, chatName, texts, minutes], i) => {
  const versions = texts.map((text, j) => ({ eventId: `demo-${i}-${j}`, kind: j ? 'edit' : 'create', text, authorName, chatName, occurredAt: ago(minutes + (texts.length - j) * 4), receivedAt: ago(minutes + (texts.length - j) * 4) }));
  versions.push({ eventId: `demo-${i}-deleted`, kind: 'delete', authorName, chatName, occurredAt: ago(minutes), receivedAt: ago(minutes) });
  const last = versions.at(-2);
  return { id: `demo-${i}`, platform, authorName, chatName, text: last.text, status: 'deleted', saved: i === 0 || i === 5, firstSeen: versions[0].occurredAt, lastSeen: ago(minutes),
    versionCount: texts.length, versions, attachments: [], externalId: `demo-${i}`, connectionId: 'demo', originalMissing: false, held: false };
});
