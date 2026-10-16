# Form8 experimental protocol v1

This protocol is deliberately independent of radio band. A future bridge must preserve incident IDs, record IDs and original node identities rather than generate a new form for each crossing. Bridge transport, rate control and loop policy are not implemented.

## Wire format

All multibyte integers are little-endian. IDs are 16 opaque bytes. The browser sends a random 128-bit submission token, persisted with the draft, which becomes its record ID. This makes retries after an ambiguous HTTP response idempotent. Incident IDs are random 64-bit values; node IDs are stable eFuse MAC-derived 64-bit values, separate from callsigns.

| Offset | Bytes | Meaning |
|---|---:|---|
| 0 | 2 | ASCII `F8` |
| 2 | 1 | Version = 1 |
| 3 | 1 | Kind: hello=1, inventory=2, request=3, data=4, receipt=5, human acknowledgment=6 |
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

Hello payload is JSON containing callsign and active incident name. Inventory payload contains up to eight `(record ID:16, body CRC32:4)` entries for bodies actually retained by its publisher. A request references a missing record and checksum. Receipt/human acknowledgment reference a record and checksum and contain no payload. A node intentionally archiving/discarding retains a local record tombstone and therefore does not request that body again.

Nodes forward valid new packets with decremented TTL. Data, inventories, requests and receipts must match the receiver's active incident. Hello advertisements are allowed across incidents so operators can discover and explicitly join them. Frames use a bounded 256-entry duplicate cache with a two-minute lifetime; payload fingerprints normalize TTL before comparison. This is a corruption/duplicate check, not identity authentication.

## Scheduling and repair

There are at most 48 queued frames, four outbound body jobs, and three inbound assemblies. Higher precedence wins, with every eighth selection serving the oldest eligible item. Radio transmission uses random inter-frame delay and relay jitter. Queue overflow increments a visible dropped counter; inventories and originating-node retries recover from lost frames.

A hello is queued as soon as transmission is allowed after startup, incident joining, or radio reconfiguration, then roughly every 30 seconds. An inventory page of up to eight stored bodies is queued every 15 seconds; at 200 bodies one full pass takes approximately 6.25 minutes before congestion. Missing bodies are requested. Inventory publication supplies an implicit durable radio receipt, and explicit receipts reduce initial latency. Local human acknowledgments are periodically re-advertised for stored bodies. Originated forms with missing tracked receipts are considered for round-robin replay every 30 seconds.

## Known limitations

- Random backoff and carrier detection do not solve hidden-node collisions. Dense-network relay suppression, directed repair, adaptive inventory timing, airtime budgeting and measured throughput remain field-test work.
- All-node flooding can be expensive at 30 nodes. The system has not demonstrated the target load over RF. Do not extrapolate capacity from storage size or host tests.
- Receipts arriving before a matching body/metadata are ignored; subsequent inventory passes repair radio receipts. Acknowledgment recovery for bodies already offloaded needs a metadata synchronization extension.
- Expected-node membership is local, rather than a consensus roster. A new node is added to a form's tracked list when receipt evidence arrives. A callsign change does not change its node ID.
- The cache is bounded; traffic exceeding it can cause redundant forwarding. TTL still limits each forwarding chain.
- Reboot resets the duplicate cache. Publisher sequences are randomly seeded at boot to reduce collisions with recently seen control packets.
- Forms from previous incidents remain in storage but are neither advertised nor transmitted until that incident becomes active again.
- Archive/discard metadata is retained indefinitely up to the global record cap. Purging or compacting it without causing unwanted repair is future work.
- There is no cryptographic authentication, encryption, replay protection or protection against a malicious node impersonating another callsign.
