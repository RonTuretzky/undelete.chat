# Continuous watching and recovery

How hosted connections behave when you close the browser or a connection drops.

<a id="keep-running"></a>

## The watch continues in the cloud

Once a hosted connection is established, you can close Undelete, turn off your computer, and use your messaging apps normally. The server receives messages and deletions in the background.

A platform outage, expired linked device, or server interruption can still leave gaps: a message deleted while the connection is down is missed. The server retries lost connections automatically; if phone approval is needed, Connections will show Needs attention.

- [Continuous watching and recovery](./running.md)

<a id="restart"></a>

## Restarts and connection gaps

Hosted sessions are saved in encrypted per-connection storage. The service resumes enabled connections after a normal server restart and retries unexpected collector exits with a delay. Expired logins may require a fresh scan.

Signal requires working session files while running. These live on a temporary in-memory filesystem in production and are checkpointed into encrypted storage every five seconds. A sudden machine failure can lose the latest checkpoint interval; the service cannot promise that every deletion is seen through an outage.

<a id="controls"></a>

## Pause, disconnect, and relink

- Pause: keep the platform session connected but discard new events. A message deleted while paused is not kept.
- Disconnect: stop the collector and remove its stored cloud session. Deleted messages already in your archive remain.
- Relink: reset one connection’s platform login and scan again. Deleted messages already in your archive remain.
- A message that changes or is deleted before Undelete receives it cannot be reconstructed.

<a id="local"></a>

## Older local connections and Discord

Connections identifies whether each source watches in the cloud or uses a local companion. Older local companions still depend on their computer. Choose Continue setup and authorize Move connection to cloud to replace one with a hosted session.

Discord’s optional extension remains local and requires Chrome with the selected Discord Web tab open. The separate experimental cloud connector continues on the server, subject to Discord’s account restrictions.

<a id="capacity"></a>

## Hosted capacity

The operator sets a server-wide collector limit and each account can have up to four hosted connections. If capacity is full, setup shows a clear error. A small development server is not unlimited production capacity.

Instructions reviewed September 10, 2026. Platform screens may change.

Generated from `web/guides.mjs`, the same content shown in the public help center.
