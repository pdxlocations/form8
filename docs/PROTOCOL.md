# Form8 experimental protocol v1

This protocol is deliberately independent of radio band. A future bridge must preserve incident IDs, record IDs and original node identities rather than generate a new form for each crossing. Bridge transport, rate control and loop policy are not implemented.

## Wire format

All multibyte integers are little-endian. IDs are 16 opaque bytes. The browser sends a random 128-bit submission token, persisted with the draft, which becomes its record ID. This makes retries after an ambiguous HTTP response idempotent. Incident IDs are random 64-bit values; node IDs are stable eFuse MAC-derived 64-bit values, separate from callsigns.

| Offset | Bytes | Meaning |
|---|---:|---|
| 0 | 2 | ASCII `F8` |
| 2 | 1 | Version = 1 |
| 3 | 1 | Kind: hello=1, inventory=2, request=3, data=4, receipt=5, human acknowledgment=6, chat=7, chat receipt=8 |
| 4 | 1 | Remaining forwarding TTL, initially 5 |
| 5 | 1 | Precedence: routine=0, health/welfare=1, priority=2, emergency=3 |
| 6 | 1 | Fragment index |
| 7 | 1 | Fragment count |
| 8 | 8 | Original packet publisher node ID |
| 16 | 8 | Incident ID (zero allowed only for hello) |
| 24 | 16 | Record ID (zero allowed for hello/inventory) |
| 40 | 4 | Publisher's session sequence nonce |
| 44 | 4 | Complete body CRC32, or referenced record checksum |
| 48 | 2 | Complete record length, or control payload length |
| 50 | 0–160 | Payload |
| end | 4 | IEEE CRC32 of preceding frame bytes |

Maximum frame length is 214 bytes. Form bodies are UTF-8 JSON with `type: net-form-8` and at most 4,096 bytes, fragmented into 160-byte chunks (at most 26 fragments). Replies/corrections use a `parent` record ID. A typed signature is text, not a cryptographic signature. Three simultaneous assemblies expire after two minutes and require a matching complete-body checksum before persistence.

Hello payload is JSON containing callsign, active incident name, and an optional numeric boot-session marker. The marker lets peers detect a restart even when the stable node ID and incident are unchanged; older publishers omit it and are treated as session zero. Inventory payload contains up to eight `(record ID:16, body CRC32:4)` entries for bodies actually retained by its publisher. A request references a missing record and checksum. Receipt/human acknowledgment reference a record and checksum and contain no payload. A node intentionally archiving/discarding retains a local record tombstone and therefore does not request that body again.

Nodes forward valid new packets with decremented TTL. Data, inventories, requests and receipts must match the receiver's active incident. Hello advertisements are allowed across incidents so operators can discover and explicitly join them. Frames use a bounded 256-entry duplicate cache with a two-minute lifetime; payload fingerprints normalize TTL before comparison. This is a corruption/duplicate check, not identity authentication.

## Scheduling and repair

### Chat extension

Chat uses the same framing, CRC checks, fragmentation, incident isolation, duplicate suppression, relay TTL, and durable-save requirement as forms, with distinct kinds **7** and **8**. Old implementations that accept only kinds 1–6 drop chat, so all participating relays must be updated. The form wire format remains compatible.

Kind 7 carries a UTF-8 JSON event of at most **768 bytes** (up to five 160-byte fragments). A `chat-message` has `sender`, `sentAt`, `text` (1–200 UTF-8 bytes), and optional `parent` (a 32-hex chat ID). A `chat-reaction` has `sender`, `sentAt`, `target`, `emoji`, `active` (boolean), and a per-origin monotonic 32-bit `sequence`. The sequence is persisted across local reboot. The newest sequence for each `(origin, target, emoji)` determines the reaction state, independently of reception order. Supported reactions are 👍, 👎, ❤️, ✅, ❓, 🚨, and 👀.

Kind 8 is a payload-free receipt referencing the chat ID and complete-event checksum. It cannot mark a form delivered or human-acknowledged. Already-known chat events must match the stored checksum before the first fragment prompts another receipt. Replies and reactions may arrive before their target; their reference remains intact until local history retention removes it.

Chat is stored under `/chat`, separately from `/records`. Its bounded history retains 96 events across incidents; the HTTP feed returns the latest 30 text messages plus radio receipts and current retained reaction states, and accepts `before=<message ID>` to load earlier pages. It also returns the IDs and origins of retained text messages so clients can count unread messages without downloading every body. Revision-aware HTTP polling avoids rescanning unchanged chat history every two seconds. At capacity, radios and companions evict the oldest incoming or remotely acknowledged event; locally originated events without a remote receipt are retained, and a new event is rejected if no safe eviction candidate exists. Form inventories, form archives, form queue/unread counters, and LCD message counts exclude chat. Chat and its receipts are also excluded from the status API's queue count; raw RF diagnostics still count them.

An originating chat event has at most three completed transmissions: initial send, a retry 15 seconds after completion, and a retry 45 seconds after the second completion. Any matching remote chat receipt cancels further sends. Retry checks run once per second and respect pause/TX settings and channel availability. Failed body-job enqueue attempts wait two seconds; at most two body jobs can be occupied by chat, leaving capacity for forms. Complete local chat events have the same three-second receive window as forms. Radio start failures use the normal two-second frame retry; if requeue fails, the event is unblocked for a complete replay. Chat has no periodic inventory, repair, or human-ACK traffic. Reboot/incident changes stop chat retry state; same-incident reconfiguration resumes only the remaining budget. Retained chat is not automatically replayed after a reboot or incident rejoin.

### Form scheduling

There are at most 48 queued frames, four outbound body jobs, and three inbound assemblies. Higher precedence wins, with every eighth selection serving the oldest eligible item. Radio transmission uses random inter-frame delay and relay jitter. Queue overflow increments a visible dropped counter; inventories and originating-node retries recover from lost frames.

Scheduling constants are in `lib/Form8Mesh/src/TrafficSchedule.h` and `DeliveryRetry.h`. See [the complete operator-facing timing table](https://github.com/pdxlocations/form8/wiki/Radio-Traffic) for all transmission reasons.

- Hello: one pending startup announcement, manual announcements/ID requests, and responses to newly heard, restarted, or 90-minute-returning origins. No repeating timer and no announcement merely for joining/reconfiguration. Discovery responses wait 1–5 seconds, with at least 30 seconds since the last queued announcement; arrivals are coalesced. Online status expires after 90 minutes without a valid packet.
- Quiet inventory: up to eight retained bodies every 300–360 seconds; empty inventories emit no frame. At 200 bodies, one pass takes about 125–150 minutes before congestion.
- New/restarted same-incident peers trigger one accelerated inventory pass, first page immediately and subsequent pages every 10–12 seconds. Pass starts are at least two minutes apart; discoveries during a pass are coalesced. An inventory supplies implicit durable radio-receipt evidence; missing bodies produce requests.
- Local full-form retries: three retries with a three-second post-transmission wait, then waits of 60 seconds, 300 seconds, and 900 seconds. Further retries stay at 900 seconds. Required radio receipts cancel the replay. The scheduler checks eligible retries once per second; all timing is subject to radio availability and queue/channel delays.
- A saved operator acknowledgment is queued immediately and has up to two early repeats at approximately 15 and 60 seconds after its initial successful queue attempt. Subsequent periodic recovery is limited to a form's quiet inventory-page visit at least 30 minutes after its last tracked ACK queue attempt. ACK timing is not persisted across reboot/configuration changes.
- Repair-body responses re-advertise the publisher's own saved human ACK after the final body fragment, avoiding an ACK being ignored because its body has not arrived. Offloaded-body acknowledgment synchronization remains incomplete.
- Local still-unsent identical control packets are coalesced. Full queues retry scheduled Hello/inventory/manual-ACK work after two seconds. A failed radio start retries its frame after two seconds; if a local Data frame cannot be requeued, its full-form retry is unblocked.
- Relaying remains event-driven, with 100–1,299 ms jitter and no independent periodic replay timer. Channel-busy backoff is 500–2,999 ms; ordinary inter-frame gaps are 100–699 ms. Complete local form transmissions retain a three-second receive-only window.
- Archiving/discarding cancels the selected body's jobs, buffered Data copies, and stale local inventory pages. It does not reset unrelated retries, the incident, or discovery timers.

## Known limitations

- Random backoff and carrier detection do not solve hidden-node collisions. Dense-network relay suppression, directed repair, adaptive inventory timing, airtime budgeting and measured throughput remain field-test work.
- All-node flooding can be expensive at 30 nodes. The system has not demonstrated the target load over RF. Do not extrapolate capacity from storage size or host tests.
- Receipts arriving before matching body/metadata are ignored. Inventories repair radio receipts, early manual-ACK repeats and slower ACK recovery repair missed human acknowledgments, and repair responses place their human ACK after the body. Acknowledgment recovery for bodies already offloaded still needs a metadata synchronization extension.
- Expected-node membership is local, rather than a consensus roster. A new node is added to a form's tracked list when receipt evidence arrives. A callsign change does not change its node ID.
- The cache is bounded; traffic exceeding it can cause redundant forwarding. TTL still limits each forwarding chain.
- Reboot resets the duplicate cache. Publisher sequences are randomly seeded at boot to reduce collisions with recently seen control packets.
- Forms from previous incidents remain in storage but are neither advertised nor transmitted until that incident becomes active again.
- Archive/discard metadata is retained indefinitely up to the global record cap. Purging or compacting it without causing unwanted repair is future work.
- There is no cryptographic authentication, encryption, replay protection or protection against a malicious node impersonating another callsign.
