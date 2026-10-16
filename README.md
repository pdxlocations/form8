# Form8

**Send text messages between LoRa radios using a phone or laptop—without internet or cell service.**

Each message uses a Portland NET Form 8 / ICS 213 general-message form. Your phone or laptop connects to a radio's Wi-Fi hotspot. The radio sends the message to other Form8 radios.

The first hardware target is the **Heltec WiFi LoRa 32 V3 with 915 MHz hardware**. Form8 is experimental: software tests and firmware builds pass, but range, reliability, and capacity still need physical radio testing. It does not communicate with Meshtastic or MeshCore.

**Radio messages are not encrypted. Treat them as public information.**

## Find what you need

- [Try it without radios](#try-it-without-radios)
- [Install firmware for the first time](#install-firmware-for-the-first-time)
- [Connect your phone or laptop](#connect-your-phone-or-laptop)
- [First test with two radios](#first-test-with-two-radios)
- [Read, acknowledge, reply, or correct](#read-acknowledge-reply-or-correct)
- [Save an archive and free storage](#save-an-archive-and-free-storage)
- [Update an existing radio](#update-an-existing-radio)
- [Frequently asked questions](#frequently-asked-questions)
- [Troubleshooting](#troubleshooting)
- [Developer notes](#developer-notes)

## Try it without radios

You can try the screens on a computer before setting up hardware.

1. Install Node.js 22 or later.
2. Open a terminal in this project's folder.
3. Run:

   ```sh
   npm run dev
   ```

4. Open **http://127.0.0.1:8848** in your browser.
5. Open **Incidents**, enter `Practice drill`, and click **Create and join**.
6. Open **Compose**, enter a subject and message, and click **Send to radio queue**.
7. Open **Traffic** to read the message and try the controls.

The header says **Simulation · no RF**. This demo does not transmit over a radio or test delivery between radios. Its saved data is in `tmp/demo.local.json`. You do not need to run `npm install` for the demo.

## Install firmware for the first time

These steps are for an **empty Heltec V3**, with no Form8 messages you need to keep.

1. Install PlatformIO Core.
2. Connect the radio to your computer using a USB data cable. Attach its antenna before enabling transmission.
3. Open a terminal in this project's folder.
4. Build the firmware:

   ```sh
   pio run -e heltec-v3
   ```

5. Upload the firmware:

   ```sh
   pio run -e heltec-v3 -t upload
   ```

6. Set up the radio's file storage **once, on the empty radio**:

   ```sh
   pio run -e heltec-v3 -t uploadfs
   ```

7. Wait for the radio to restart. Its screen shows its Wi-Fi name, password, and web address when no phones or laptops are connected.
8. Repeat for the second radio.

**`uploadfs` replaces the radio's file storage and erases stored forms.** For later updates, use [Update an existing radio](#update-an-existing-radio). The webpage is bundled in the firmware; updating it does not require `uploadfs`.

If you need to see startup messages, run:

```sh
pio device monitor -b 115200
```

## Connect your phone or laptop

1. Power on the radio.
2. In your phone or laptop's Wi-Fi settings, connect to the network shown on the radio, such as `form8-abcd`.
3. Enter the eight-digit password shown on that radio's screen. Each radio has its own password.
4. Stay connected even if your device reports that this Wi-Fi network has no internet.
5. Open **http://192.168.4.1** in your browser. Use `http`, not `https`.
6. Open **Radio setup** and enter your callsign, such as `NET-A`.
7. Check the radio settings, then click **Save settings**.

When a device is connected, the radio's screen shows outgoing messages waiting for radio ACK and unread incoming messages. Disconnect all Wi-Fi clients to show the Wi-Fi credentials again. Credentials are also printed over USB serial.

## First test with two radios

Use one phone or laptop connected to each radio. In this example, their callsigns are `NET-A` and `NET-B`.

### 1. Match the radio settings

On **both** radios, open **Radio setup** and use the same profile:

| Setting | Heltec V3 starting value |
|---|---|
| Primary frequency | 919.500 MHz |
| Bandwidth | 500 kHz |
| Spreading factor | 9 |
| Coding rate | 4/8 |
| TX power | 14 dBm |
| Use backup preset | Unchecked |
| Enable radio transmission | Checked |
| Pause all radio transmission | Unchecked |

Click **Save settings** on each radio. Transmission starts disabled on a fresh device. These are starting settings for testing, not a field-validated radio configuration. Radios that already have saved settings keep them after a firmware update; check the actual values on each radio.

### 2. Create one incident on NET-A

1. On `NET-A`, open **Incidents**.
2. Enter `Practice drill` under **New incident name**.
3. Click **Create and join**.
4. Note the **Incident ID** in the header.

An incident is the group of messages your radio is currently working with.

### 3. Join that incident on NET-B

1. On `NET-B`, open **Incidents**.
2. Look under **Nearby incidents** for `Practice drill`.
3. Click **Join** beside it.
4. Confirm that both radios show the **same Incident ID**.

**Do not create a second incident with the same name on NET-B.** Creating an incident gives it a new ID. Matching names alone do not put radios in the same incident.

Joining queues an announcement immediately when transmission is allowed. Announcements repeat roughly every 30 seconds; radio traffic can delay them. Use **Refresh data** to check again without reloading the page. The header shows both nodes heard and nodes in your active incident.

### 4. Send a test message from NET-A

1. On `NET-A`, open **Compose**.
2. Leave **Radio destination** set to **Broadcast to everyone**.
3. Fill in this example:

   | Field | Example |
   |---|---|
   | To · name and position | Drill team |
   | From · name and position | Alex, staging lead |
   | Subject | Radio check |
   | Precedence | Routine |
   | Message / reply | This is a practice message. Please acknowledge receipt. |

4. Click **Send to radio queue**.
5. On `NET-B`, open **Traffic**. The message should appear after successful radio delivery.
6. Click **Open** to read it.

Sending saves the form on your radio and queues it for transmission. It does **not** by itself mean another radio has received it.

### 5. Acknowledge it on NET-B

1. With the message open on `NET-B`, click **Acknowledge**.
2. After it is saved, the button changes to **Acknowledged** and becomes disabled.
3. On `NET-A`, open the message and look for **Human acknowledged by NET-B** once the acknowledgment arrives.

A **radio ACK** means another radio saved the form. A **human acknowledgment** means someone explicitly clicked **Acknowledge**. Opening a message only marks it read locally.

### Send to a particular station

To address a later message to `NET-B`:

1. In **Compose**, change **Radio destination** to **Callsign**.
2. Enter `NET-B` in **Destination callsign**.
3. Fill in the form and send it.

The **To** field names the person or position; **Destination callsign** addresses the radio station. Other radios in the same incident still store the form. Callsign addressing does not make it private.

## Read, acknowledge, reply, or correct

Open **Traffic** to see a compact message list. Click **Open** to show one message at a time.

- **Back to traffic** returns to your list page.
- **Previous message / Next message** appear when another message is available in that view, including across pages.
- **Acknowledge** records your station's human acknowledgment.
- **Reply** starts a new form linked to the original. Enter your response and send it.
- **Correction** copies the original into a new draft, prefixes the subject with `Correction:`, and links it to the original. Make your changes and send it.

**Sent forms cannot be edited.** For example, if you sent “Bring 10 chairs” but meant 20, use **Correction**, change the text to “Bring 20 chairs,” and send the new form. The original remains available.

Radio data updates every two seconds while the page is running. Each tab also has **Refresh data**, which keeps your current tab, open message, and unsaved edits.

### Attach a location

1. In **Compose**, expand **Optional location**.
2. Click **Use phone / laptop location** and allow location access if requested.
3. Check the filled-in **Latitude** and **Longitude** fields before sending.

You can also type both coordinates manually. **Remove location** clears them. Location access may be unavailable in a browser connected directly to the radio's HTTP webpage; use manual coordinates or a configured native companion. The Heltec V3 has no onboard GPS.

### Switch incidents

Open **Incidents** and join a nearby or retained incident. Your radio has one active incident at a time. Switching stops transmission of the previous incident's forms until you join it again; its saved forms remain on the radio. **Include previous incidents** in Traffic lets you view retained traffic from other incidents.

## Save an archive and free storage

Use this when you want to keep a message on your phone or laptop and free space on the radio.

1. Open the message in **Traffic**.
2. Click **Archive & free radio storage**.
3. Review the notice, including any stations still waiting for delivery, and confirm.
4. The app saves and verifies a local copy before removing the message body from this radio.
5. Open **Device archive** to read the saved copy.
6. Click **Export archive JSON** and save the file somewhere safe for backup.

The archive belongs to that browser or companion on that device. Clearing browser storage can erase it. Exported files can be imported using **Import an archive JSON file**.

**Discard locally** removes the message body from this radio without making an archive. Both actions keep receipt metadata, leave other radios' copies alone, and prevent this radio from automatically downloading that body again. An archived or discarded message is not marked delivered just because you removed it.

## Update an existing radio

1. Connect the radio by USB.
2. Open a terminal in this project's folder.
3. Upload firmware only:

   ```sh
   pio run -e heltec-v3 -t upload
   ```

4. Reconnect to its hotspot after it restarts, then reopen the webpage.
5. Check **Radio setup**. Saved callsigns, radio settings, and the active incident selection remain.

Firmware-only updates preserve radio forms when the partition layout is unchanged. **Do not run `uploadfs` for routine updates.** It erases the stored forms.

If the filesystem was replaced, the saved active incident selection can still survive in separate settings storage. The firmware restores that incident's list entry at startup. This does not recover erased message bodies.

## Frequently asked questions

### How long can messages be?

The **Message / reply** field allows **2,800 UTF-8 bytes**. With ordinary English letters, numbers, and punctuation, that is about 2,800 characters. Emoji and some other characters use multiple bytes, so fewer fit. The counter below the message shows the byte count.

The complete form, including its other fields and metadata, must fit within **4,096 bytes**. A nearly full message combined with many long fields can exceed that total. Subject, names, positions, and typed signatures each have a **160-byte** limit.

### Is data encrypted?

**No. LoRa radio messages are sent in readable form, without encryption.** The hotspot password protects access to the radio's Wi-Fi; it does not encrypt the radio messages sent between nodes.

### Can I trust the sender's callsign or signature?

The protocol does not cryptographically verify senders. Someone could impersonate a callsign. A typed signature is text, not proof of identity. Error checks detect damaged packets, but do not authenticate them.

### Do I need internet or cell service?

No, once the firmware and any needed companion software are installed. Your device talks to your radio over its local Wi-Fi, and radios exchange messages over LoRa. Downloading development tools and dependencies for installation usually needs internet.

### Can I send photos, PDFs, or other attachments?

No. Forms are text-only. Optional coordinates are supported.

### How do I know a message arrived?

Look for **Radio ACK** from the intended station. That means its radio saved the form. Look for **Human acknowledged by** when you need confirmation that an operator acknowledged it. A local save or a cleared unread indicator is not a remote receipt.

### How long does delivery take?

There is no guaranteed delivery time. It depends on message length, radio settings, signal conditions, relays, and other traffic. Short messages require less airtime.

Pending local messages are retried automatically: an initial send plus up to three retries, with a three-second receive-only window after each complete send, followed by retries every 60 seconds. A busy channel, paused transmission, or queued traffic can delay these attempts. Radios also periodically check for missing forms.

### Who receives a broadcast? Who receives an addressed message?

Radios with the same active incident and compatible radio settings can store and relay both. A broadcast waits for receipts from tracked stations, or at least one remote station if none were known. A callsign-addressed message waits for that callsign's receipt. Neither is private.

### Can radios relay messages through other radios?

Yes. Compatible Form8 radios can forward packets through multiple hops. Actual range and delivery still depend on the radio path; no particular distance has been validated here.

### Why does a station still show Pending when it is offline?

Known stations remain on a message's tracked list, even when they stop announcing themselves. This avoids treating an absent station as a successful delivery. A station is shown offline after three minutes without an announcement.

### Where are drafts, messages, and archives saved?

| Item | Saved where? |
|---|---|
| Unsent drafts | Your browser or companion on that device |
| Sent and received forms | The radio's flash storage |
| Copies made with Archive | Your browser or companion on that device |
| Exported archive JSON | Wherever you save the exported file |

Browser drafts and archives use IndexedDB, a local browser database. They do not automatically sync between devices or browsers. Clearing site data can remove them.

### How many messages fit on a radio?

The firmware caps storage at **512 records across all retained incidents**, and also checks available space. Long forms and receipt information use more storage. Archiving frees message-body space, but retained metadata still counts toward the record limit.

The project aims for 10–200 forms per day and up to 30 nodes. Those are design targets, not measured RF capacity claims.

### Will my phone reopen the app while disconnected from the radio?

The radio-hosted webpage needs the radio to load initially. It cannot reliably reopen after you close the browser while disconnected. A preinstalled companion bundles the interface for offline use. Companion packaging exists, but signed, device-tested releases are not available from this project yet.

### Does this work with Meshtastic, MeshCore, or VHF radios?

It uses a separate protocol and does not communicate with Meshtastic or MeshCore. Heltec V3 with 915 MHz hardware is the first target. T-Beam BPF VHF support is experimental and incomplete. A VHF-to-UHF bridge and Form 1 support are not implemented.

## Troubleshooting

### The other radio does not see my incident or message

Check in this order:

1. Confirm both radios run Form8 firmware, rather than the simulator or another mesh protocol.
2. Under **Radio setup**, compare the actual frequency, bandwidth, spreading factor, coding rate, and backup selection on both radios.
3. Confirm each has a saved callsign, **Enable radio transmission** checked, and **Pause all radio transmission** unchecked.
4. Compare the full **Incident ID** in both headers. Matching incident names are not enough.
5. Click **Refresh data**. Give periodic announcements time to arrive; they repeat roughly every 30 seconds when transmission is allowed.
6. Check **nodes heard** versus **nearby incident nodes**. A heard node may be using another incident.
7. Under **Radio setup**, watch the receive/transmit counters while sending a short test message. **TX frames** counts completed transmissions; **RX packets** counts successfully read packets; **Valid frames** counts packets recognized by this protocol. The counters restart when the radio reboots.
8. If there is still no reception, check the antennas, power, and physical radio path. A passing software test does not establish that a radio link works.

The firmware fixes an earlier idle-loop problem that could interrupt reception by repeatedly restarting it. Update both radios with the current firmware using a firmware-only upload.

### I see an old incident after flashing

Firmware and filesystem uploads do not necessarily erase the separately saved active incident selection or radio settings. An old incident in the header can therefore be expected. The firmware restores its list entry if needed. Rejoin the incident you intend to use and compare IDs between radios.

If you uploaded a filesystem image, previously stored message bodies were erased; restoring the incident name does not restore those messages.

### Sending reports a storage or write error

1. Check the storage warning and free space.
2. Archive selected forms and export a backup before removing anything you need.
3. Check USB serial output at 115200 baud for the save error.

Older firmware also had a filename-length problem that could cause write failures despite free space. A current firmware-only upload fixes that issue; replacing the filesystem is not required.

### Location does not fill in

Allow location permission if prompted. If the browser cannot provide a position, enter latitude and longitude manually, or use a companion with its location permissions configured. The app reports denied permission, unavailable location, and timeout errors.

### The page shows old information

Click **Refresh data** on your current tab. It keeps your tab and unsaved edits. If the radio is disconnected, reconnect to its hotspot. After installing updated firmware, close old Form8 browser tabs and reopen the webpage if the interface still looks outdated.

## Developer notes

### Checks

```sh
npm test
npm run test:mesh
pio run -e heltec-v3
pio run -e heltec-v3 -t buildfs
```

`buildfs` builds a filesystem image on your computer; it does not upload it. The native mesh tests compile the transport code used by the firmware with address/undefined-behavior sanitizers. Test coverage includes packet validation, reassembly, relaying, receipts, failed saves, repair, incident isolation, queues, and scheduling. UI tests cover refresh behavior, message navigation, and human acknowledgment state.

Before relying on the system in an incident, physical testing still needs to cover two-radio delivery, a three-radio relay chain, reboot persistence, interrupted writes, full storage, offload recovery, and sustained load.

### Companion development

The companions use the same interface as the radio-hosted webpage.

- **Desktop:** run `npm install`, then `npm run desktop`. Package on the appropriate OS with `npm run desktop:package`. Stop the simulator first: both use port 8848. The Electron wrapper serves the bundled interface locally and forwards radio requests to `192.168.4.1`.
- **Android / iOS:** run `npm install` and `npm run mobile:prepare`; add your platform with `npx cap add android` or `npx cap add ios`, then run `npm run mobile:sync`. Open it with `npx cap open android` or `npx cap open ios` and build using that platform's tools. iOS needs macOS and signing credentials.
- Follow [the companion guide](docs/COMPANIONS.md) for location permissions, local-network access, and HTTP configuration. Native mobile archive export/share still needs platform verification.

### Hardware and storage details

The Heltec V3 uses SCK 9, MISO 11, MOSI 10, CS 8, DIO1 14, reset 12, and busy 13, with DIO2 RF switching and a 1.8 V DIO3 TCXO. No PSRAM is required. The radio profile uses sync word `0x12` and an eight-symbol preamble.

The Heltec filesystem is approximately 3.94 MiB, with a 256 KiB reserve. Forms and receipt metadata are stored in LittleFS. The firmware does not automatically format storage if mounting fails. Offloaded bodies are not served back to the mesh from a companion; automatic restoration and metadata compaction remain future work.

For deeper detail, see [the protocol](docs/PROTOCOL.md), [the implementation requirements](REQUIREMENTS.md), and [the companion guide](docs/COMPANIONS.md).
