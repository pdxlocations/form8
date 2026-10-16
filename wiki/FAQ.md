# Frequently asked questions

## How long can messages be?

The **Message / reply** field allows **2,800 UTF-8 bytes**. With ordinary English letters, numbers, and punctuation, that is about 2,800 characters. Emoji and some other characters use multiple bytes, so fewer fit. The counter below the message shows the byte count.

The separate **Chat** tab allows **200 UTF-8 bytes** per message or reply. Emoji count toward that limit. Chat has its own radio receipts and does not add to form queued/unread counts.

The complete form, including its other fields and metadata, must fit within **4,096 bytes**. A nearly full message combined with many long fields can exceed that total. Subject, names, positions, and typed signatures each have a **160-byte** limit.

## Is data encrypted?

**No. LoRa radio messages are sent in readable form, without encryption.** The hotspot password protects access to the radio's Wi-Fi; it does not encrypt the radio messages sent between nodes.

## Can I trust the sender's callsign or signature?

The protocol does not cryptographically verify senders. Someone could impersonate a callsign. A typed signature is text, not proof of identity. Error checks detect damaged packets, but do not authenticate them.

## Do I need internet or cell service?

No, once the firmware and any needed companion software are installed. Your device talks to your radio over its local Wi-Fi, and radios exchange messages over LoRa. Downloading development tools and dependencies for installation usually needs internet.

## Can I send photos, PDFs, or other attachments?

No. Forms are text-only. Optional coordinates are supported.

## How do I know a message arrived?

Look for **Radio ACK** from the intended station. That means its radio saved the form. The **Manually acknowledged by** list shows every station with a saved manual acknowledgment, including your own. An unknown callsign is shown as its node ID. A local save or a cleared unread indicator is not a remote receipt.

## How long does delivery take?

There is no guaranteed delivery time. It depends on message length, radio settings, signal conditions, relays, and other traffic. Short messages require less airtime.

Pending local messages are retried automatically: an initial send plus up to three quick retries spaced three seconds after the previous complete transmission, then waits of **1 minute**, **5 minutes**, and **15 minutes**. Further retries stay at 15-minute intervals until the required radio receipts arrive. A busy channel, paused transmission, or queued traffic can delay these attempts. See [all automatic traffic and retry rules](https://github.com/pdxlocations/form8/wiki/Radio-Traffic).

## Who receives a broadcast? Who receives an addressed message?

Radios with the same active incident and compatible radio settings can store and relay both. A broadcast waits for receipts from tracked stations, or at least one remote station if none were known. A callsign-addressed message waits for that callsign's receipt. Neither is private.

## Can radios relay messages through other radios?

Yes. Compatible Form8 radios can forward packets through multiple hops. Actual range and delivery still depend on the radio path; no particular distance has been validated here.

## Why does a station still show Pending when it is offline?

Known stations remain on a message's tracked list, even when they stop announcing themselves. This avoids treating an absent station as a successful delivery. A station is shown offline after **10 minutes** without an announcement. This allows several missed announcements at the quieter 2–2½ minute interval.

## Where are drafts, messages, and archives saved?

| Item | Saved where? |
|---|---|
| Unsent drafts | Your browser or companion on that device |
| Sent and received forms | The radio's flash storage |
| Copies made with Archive | Your browser or companion on that device |
| Exported archive JSON | Wherever you save the exported file |

Browser drafts and archives use IndexedDB, a local browser database. They do not automatically sync between devices or browsers. Clearing site data can remove them.

## How many messages fit on a radio?

The firmware caps storage at **512 records across all retained incidents**, and also checks available space. Long forms and receipt information use more storage. Archiving frees message-body space, but retained metadata still counts toward the record limit.

The project aims for 10–200 forms per day and up to 30 nodes. Those are design targets, not measured RF capacity claims.

## Will my phone reopen the app while disconnected from the radio?

The radio-hosted webpage needs the radio to load initially. It cannot reliably reopen after you close the browser while disconnected. A preinstalled companion bundles the interface for offline use. Companion packaging exists, but signed, device-tested releases are not available from this project yet.

## Does this work with Meshtastic, MeshCore, or VHF radios?

It uses a separate protocol and does not communicate with Meshtastic or MeshCore. Heltec V3, Heltec V4 OLED, XIAO ESP32S3 with Wio-SX1262 B2B, and T3-S3 SX1262/SX1276 have ESP32 build targets. Check the [board guide](https://github.com/pdxlocations/form8/wiki/Board-Guide) for exact variants. T-Beam BPF VHF support is experimental and incomplete. nRF52 boards are excluded. A VHF-to-UHF bridge and Form 1 support are not implemented.
