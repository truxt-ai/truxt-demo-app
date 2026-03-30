# WebSocket Protocol

## Connection
```
ws://host/ws?token=<jwt>
```

## Server → Client Messages
| Type | Payload | Description |
|------|---------|-------------|
| `connected` | `{ userId }` | Authentication successful |
| `notification` | `{ data: Notification }` | New notification pushed |
| `pong` | `{ timestamp }` | Response to client ping |

## Client → Server Messages
| Type | Payload | Description |
|------|---------|-------------|
| `ping` | `{}` | Keepalive check |
| `subscribe` | `{ channel }` | Subscribe to a topic |

## Reconnection Strategy
1. On disconnect, wait 1s then retry
2. Double the wait on each failure (max 30s)
3. After 10 failures, show "connection lost" to user
4. On reconnect, fetch missed notifications via REST API
