# Form8 firmware — implementation interview

Status: initial implementation created; host tests and Heltec compilation performed. Hardware validation and companion release builds remain.

## Agreed requirements

- New radio protocol, independent of Meshtastic and MeshCore.
- Radio messages are plaintext, without encryption features. Local Wi-Fi is password protected, as accepted in the final interview round.
- Off-grid incident messaging using the supplied Portland NET Form 8 / ICS 213, revised 25APR2022. Form 1 is a future structured form type, using the supplied damage assessment example as reference.
- Text-only forms initially, including message bodies of one or two paragraphs. Attachments are out of scope. Byte limits and fragmentation must accommodate these bodies.
- Form 8 fields: incident name; to (name/position); from (name/position); subject; date/time; message; approver name/signature/position; reply; replying person's name/signature/position and reply date/time. Radio addressing and operator callsign are separate from the form's human recipient/sender fields.
- The supplied form defines precedence as Emergency, Priority, Health & Welfare, and Routine. Higher-priority forms transmit first; scheduling must also allow ordinary traffic and synchronization to progress.
- First hardware target (updated by user): Heltec WiFi LoRa 32 V3 at 919.500 MHz, without relying on PSRAM.
- Later targets include LILYGO T-Beam BPF, ESP32-S3 with SX1278, at 146.780 MHz, and the user's 915 MHz T-Beam (exact revision remains unspecified).
- Nodes provide a Wi-Fi hotspot and a locally hosted web interface.
- Support phones and computers across major platforms, including drafts made while disconnected from the radio. Operators preinstall a companion for the full offline experience; the radio-hosted website provides browser access without installation. Packaging/framework remains undecided.
- Multi-hop relaying, with every node storing and relaying all forms regardless of recipient.
- Broadcast and callsign-addressed forms. Each radio has a callsign.
- Show per-node receipts for nodes known when a form is sent, adding late-arriving nodes as they synchronize. Missing original recipients remain pending.
- Distinguish destination radio receipt from explicit human acknowledgment.
- Support replies linked to originals; sent forms are immutable, with corrections sent as linked follow-ups.
- Incident-based storage. Any operator may create an incident. Each node has one active incident and retains previous incident archives. Nearby advertised incidents appear in a list and require explicit operator joining. Switching pauses queued traffic for the previous incident.
- Manual offload to a phone/laptop after verifying the archive copy, with visible storage warnings.
- Keep undelivered forms on the radio by default. Offer older, delivered forms for offload first. Operators may explicitly archive despite missing receipts; archiving does not imply delivery.
- Operators may explicitly discard selected form bodies locally to free storage, retaining compact metadata that prevents immediate automatic re-download. Discard does not delete other nodes' copies.
- Plan for 2–30 nodes and 10–200 forms per day.
- Size radio storage for one day without offloading, including form bodies, replies, receipt records, and metadata. Numeric byte limits require form limits and hardware verification. Earlier archives must also fit within an explicit storage budget or be offloaded.
- Sending queues a form for automatic radio transmission and retries, with a pause control and a visible queue.
- Operators configure frequency and modem settings locally, with separate VHF and UHF profiles and primary/backup presets. Exact preset frequencies and modem parameters remain undecided.
- User-provided frequencies: 146.780 MHz VHF and 919.500 MHz UHF, interpreted as primary presets. Backup frequencies and modem parameters remain unspecified. Frequency, occupied bandwidth, power, and operating constraints must be considered together before enabling RF transmission; a preset alone is not a validated operating configuration.
- Plan protocol addressing and duplicate handling for a future VHF/UHF bridge; implementing a bridge is outside the initial scope.
- Time source: GPS where available, otherwise connected phone/laptop, recording its source. Message identity and ordering must not depend on a trustworthy wall clock.
- Optional location uses an explicit attach action showing source and fix age, with manual coordinate entry supported. Heltec V3 relies on phone/laptop or manual coordinates; onboard GPS integration is deferred to BPF support.

## Initial implementation decisions

- Shared client interface for the radio-hosted website, Electron desktop wrapper, and Capacitor mobile packaging foundation.
- Unique message IDs, explicit per-node receipts, and compact inventory reconciliation to recover missing messages.
- Persist forms and receipt state in flash rather than relying on RAM.
- Preserve compact message metadata after offloading bodies so deliberate offload is not interpreted as accidental message loss.

## Open decisions

- Companion platform builds, signing, permission setup, and distribution.
- Incident advertisement and receipt behavior across differing active incidents.
- Pending receipt behavior after incident switching and intentional archive/discard.
- Radio configuration, channel access, identification, hop limits, and synchronization airtime budget.
- Field byte limits, exports, and optional GPS capture/confirmation workflow.
- Full-storage warning and explicit discard workflow details.
- Hardware verification of Heltec V3 radio behavior and later BPF pin/power integration; exact 915 MHz T-Beam revision.

## References

- User-supplied Form 8: `/Users/benlipsey/Desktop/Form_8.General_Message.pdf` (text and AcroForm field names inspected).
- User-supplied future Form 1 reference: `/Users/benlipsey/Desktop/Form_1.DamageAssessment.filled.pdf` (text inspected; handwritten example is not a source of live incident data).
- https://volunteerpdx.net/index.php/NET_Incident_Command_System_(ICS)_Forms
- Indexed form reference (marked retired): https://volunteerpdx.net/images/c/c1/Form_8.retiredNETversion.pdf
- https://wiki.lilygo.cc/products/t-beam-series/t-beam-bpf/
