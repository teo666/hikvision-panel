// Parse the camera's event stream (/ISAPI/Event/notification/alertStream).
// It is a never-ending multipart response; each part is an <EventNotificationAlert>.
// Pure string handling, so it runs in Node tests too.

const ALERT = /<EventNotificationAlert\b[\s\S]*?<\/EventNotificationAlert>/g;

/**
 * Pull complete alerts out of a growing buffer.
 * @returns {{ alerts: string[], rest: string }} rest = text to keep for the next chunk
 */
export function extractAlerts(buffer) {
  const alerts = [];
  let end = 0;
  for (const m of buffer.matchAll(ALERT)) {
    alerts.push(m[0]);
    end = m.index + m[0].length;
  }
  let rest = buffer.slice(end);
  // Don't let junk (part headers, heartbeats without XML) grow forever.
  const open = rest.lastIndexOf('<EventNotificationAlert');
  rest = open >= 0 ? rest.slice(open) : rest.slice(-64);
  return { alerts, rest };
}

const tag = (xml, name) => xml.match(new RegExp(`<${name}>([^<]*)</${name}>`))?.[1];

/**
 * @returns {{ type: string, state: string, time: string, description: string, count: number }}
 */
export function parseAlert(xml) {
  return {
    type: tag(xml, 'eventType') ?? '',
    state: tag(xml, 'eventState') ?? '',
    time: tag(xml, 'dateTime') ?? '',
    description: tag(xml, 'eventDescription') ?? '',
    count: Number(tag(xml, 'activePostCount') ?? 1),
    targets: [...xml.matchAll(/<targetType>([^<]*)<\/targetType>/g)].map((m) => m[1]),
  };
}

/** The camera sends "videoloss inactive" every few seconds as a keep-alive. */
export const isHeartbeat = (a) => a.type === 'videoloss' && a.state === 'inactive';
