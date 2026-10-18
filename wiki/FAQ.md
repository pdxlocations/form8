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

Look for **Radio ACK** from the intended station. That means its radio saved the form. The matrix’s **Human** column shows each station’s saved manual acknowledgment, including your own. An unknown callsign is shown as its node ID. A local save or a cleared unread indicator is not a remote receipt.

## How long does delivery take?

There is no guaranteed delivery time. It depends on message length, radio settings, signal conditions, relays, and other traffic. Short messages require less airtime.

Pending local messages are retried automatically: an initial send, followed by waits of **1 minute**, **5 minutes**, and **15 minutes** after completed transmissions. Further retries stay at 15-minute intervals until the first remote ACK arrives for a broadcast, or the named recipient ACKs an addressed form. A busy channel, Radio transmission set to Off, or queued traffic can delay these attempts. See [all automatic traffic and retry rules](https://github.com/pdxlocations/form8/wiki/Radio-Traffic).

## Who receives a broadcast? Who receives an addressed message?

Radios with the same active incident and compatible radio settings can store and relay both. A broadcast is radio-acknowledged after the first remote station confirms a saved copy. That clears its pending/outgoing indicator and stops full-form retries even if other tracked stations are offline. The matrix still shows each station’s individual receipt status. A callsign-addressed message waits for that callsign's receipt. Neither is private.

## Can radios relay messages through other radios?

Yes. Compatible Form8 radios can forward packets through multiple hops. Actual range and delivery still depend on the radio path; no particular distance has been validated here.

## Why does a station still show Pending when it is offline?

Known stations remain on a message's tracked list, even when they stop announcing themselves. A missing station stays Pending in the matrix so you can distinguish individual reception from the overall broadcast status. It does not keep a broadcast pending after another station has acknowledged. A station is shown offline after **90 minutes** without a valid packet carrying its origin ID. Routine announcements are hourly (60–65 minutes with jitter); relayed packets and repair responses can keep an origin recently heard even if its original station is absent. Use the Nodes tab to inspect last-heard time and last-hop signal readings.

## Where are drafts, messages, and archives saved?

| Item | Saved where? |
|---|---|
| Unsent drafts | Your browser or companion on that device |
| Sent and received forms | The radio's flash storage |
| Copies made with Archive | Your browser or companion on that device |
| Exported archive JSON | Wherever you save the exported file |

Browser drafts and archives use IndexedDB, a local browser database. They do not automatically sync between devices or browsers. Clearing site data can remove them.

## How many messages fit on a radio?

The firmware caps storage at **512 records across all retained incidents**, and also checks available space. Long forms and receipt information use more storage. Archiving frees message-body space, but retained metadata still counts toward the record limit. **Remove incident…** deletes that incident’s local history and frees its record slots; export or archive any forms you want to keep first.

The project aims for 10–200 forms per day and up to 30 nodes. Those are design targets, not measured RF capacity claims.

## Will my phone reopen the app while disconnected from the radio?

The radio-hosted webpage needs the radio to load initially. It cannot reliably reopen after you close the browser while disconnected. A preinstalled companion bundles the interface for offline use. Companion packaging exists, but signed, device-tested releases are not available from this project yet.

## Does this work with Meshtastic, MeshCore, or VHF radios?

It uses a separate protocol and does not communicate with Meshtastic or MeshCore. Heltec V3, Heltec V4 OLED, XIAO ESP32S3 with Wio-SX1262 B2B, and T3-S3 SX1262/SX1276 have ESP32 build targets. Check the [board guide](https://github.com/pdxlocations/form8/wiki/Board-Guide) for exact variants. T-Beam BPF VHF support is experimental and incomplete. nRF52 boards are excluded. A VHF-to-UHF bridge and Form 1 support are not implemented.

## Can I see locations without internet?

Yes. GPS and LoRa position reports work without internet. Download USGS topo tiles ahead of time to see the U.S. basemap offline; station coordinates and markers remain available without tiles. See [Location sharing and offline maps](Map-and-Location). Phone GPS on the radio’s plain HTTP browser page is restricted by most browsers; use the mobile companion app or onboard GPS.

## Is TX power in dBm, and can I select 22?

Yes. SX1262 targets accept 2–22 dBm, SX1276 accepts 2–20 dBm, and T-Beam BPF is limited to 2–10 dBm. Radio setup shows the connected board's range. For Heltec V4 the field is labeled **TX chip drive**, because its external amplifier changes final output. See [board power settings](Board-Guide#tx-power-settings).

## Can I use an nRF52 board?

Yes. Nine nRF52840 targets use Bluetooth or USB CDC serial with the Android companion. The app holds the interface and message bodies; keep it open for durable receiving and ACKs. There is no Wi-Fi hotspot on these targets. See [nRF52 and Android](https://github.com/pdxlocations/form8/wiki/nRF52-and-Android) for compatible boards, bootloader prerequisites, and APK installation.

## Which firmware does my RAK4631 need?

Double-press Reset and read the **SoftDevice** line in `INFO_UF2.TXT`. **S140 6.1.1** needs `form8-rak4631-s140-6-1-1.uf2`; **S140 7.3.0** needs `form8-rak4631.uf2`. The bootloader version (for example, 0.4.2) is a separate number. The flasher requires an explicit matching SoftDevice selection for every nRF target and blocks unchecked or mismatched downloads. The 6.1.1 build works with that stock setup without a bootloader upgrade. [Complete selection and installation steps](nRF52-and-Android#which-rak4631-firmware-should-i-install).

## How do I remove old messages and incidents?

In the Traffic list, **Archive** saves a verified device copy and **Remove…** removes the message without making an archive. Both appear beside **Open**. The same actions are available inside the message. Both hide the entry from normal Traffic. **Show archived and removed entries** reveals the retained delivery history.

In **Incidents**, **Leave** stops participating while keeping data. **Remove incident…** deletes that incident’s local forms, delivery records, and chat; if active, it leaves first. Saved device archives and other nodes’ copies are kept. [Complete cleanup instructions](Archives).


### Does every node relay packets?

No. **Radio setup → Enable packet relaying** defaults to off. Enable it on nodes that need to bridge a gap or extend coverage. Nodes with it off can still send, receive, acknowledge, and serve requested stored forms. To advertise your active incident immediately, use **Incidents → Announce incident**, or **Announce** beside its saved entry.


### Can I manually acknowledge my own form?

No. Only receiving stations can human-acknowledge a form. Its originating node is labeled Origin instead. The app and radio enforce this by node ID, including after a callsign change. Old originator human ACKs are hidden and are not repeated.
