# Continuous capture and recovery

How hosted connections behave when you close the browser or a connection drops.

<a id="keep-running"></a>

## Capture continues in the cloud

Once a hosted connection is established, you can close Afterword, turn off your computer, and use your messaging apps normally. The server receives messages in the background.

A platform outage, expired linked device, or server interruption can still leave gaps. The server retries lost connections automatically; if phone approval is needed, Connections will show Needs attention.

- [Continuous capture and recovery](./running.md)

<a id="restart"></a>

## Restarts and connection gaps

Hosted sessions are saved in encrypted per-connection storage. The service resumes enabled connections after a normal server restart and retries unexpected collector exits with a delay. Expired logins may require a fresh scan.

Signal requires working session files while running. These live on a temporary in-memory filesystem in production and are checkpointed into encrypted storage every five seconds. A sudden machine failure can lose the latest checkpoint interval; the service cannot promise gap-free capture through an outage.

<a id="controls"></a>

## Pause, disconnect, and relink

- Pause: keep the platform session connected but discard new captured events.
- Disconnect: stop the collector and remove its stored cloud session. Previously captured messages remain.
- Relink: reset one connection’s platform login and scan again. Previously captured messages remain.
- A message that changes before Afterword receives it cannot be reconstructed.

<a id="local"></a>

## Older local connections and Discord

Connections identifies whether each source captures in the cloud or uses a local companion. Older local companions still depend on their computer. Choose Continue setup and authorize Move connection to cloud to replace one with a hosted session.

Discord’s extension remains local and requires Chrome with the selected Discord Web tab open. This is not a cloud connector.

<a id="capacity"></a>

## Hosted capacity

The operator sets a server-wide collector limit and each account can have up to four hosted connections. If capacity is full, setup shows a clear error. A small development server is not unlimited production capacity.

Instructions reviewed September 10, 2026. Platform screens may change.

Generated from `web/guides.mjs`, the same content shown in the public help center.
