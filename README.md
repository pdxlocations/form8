# Form8

**Send text messages between LoRa radios using a phone or laptop—without internet or cell service.**

Each message uses a Portland NET Form 8 / ICS 213 general-message form. Your phone or laptop connects to a radio's Wi-Fi hotspot. The radio sends the message to other Form8 radios.

The first hardware target is the **Heltec WiFi LoRa 32 V3 with 915 MHz hardware**. Build targets also cover Heltec V4 OLED, Seeed XIAO ESP32S3 with its Wio-SX1262 module, and LILYGO T3-S3 with SX1262 or SX1276. See [board selection and build instructions](docs/BOARDS.md) for the exact hardware variants. Form8 is experimental: software tests and firmware builds pass, but range, reliability, and capacity still need physical radio testing. It does not communicate with Meshtastic or MeshCore.

**Radio messages are not encrypted. Treat them as public information.**

## Find what you need

- [Try it without radios](#try-it-without-radios)
- [Choose a board target](docs/BOARDS.md)
- [Install firmware for the first time](#install-firmware-for-the-first-time)
- [Connect your phone or laptop](#connect-your-phone-or-laptop)
- [First test with two radios](#first-test-with-two-radios)
- [Read, acknowledge, reply, or correct](#read-acknowledge-reply-or-correct)
- [Save an archive and free storage](#save-an-archive-and-free-storage)
- [Update an existing radio](#update-an-existing-radio)
- [Automatic radio traffic and retries](#automatic-radio-traffic-and-retries)
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

Published GitHub releases include binaries for all seven configured targets, a ZIP bundle, `SHA256SUMS`, and a board manifest. See [release builds and board selection](docs/BOARDS.md#automatic-github-release-builds). Regular binaries are app-only updates; separate `-factory.bin` images support first installation and replace saved data.

The [webflasher folder](webflasher/README.md) is a ready-to-upload DreamHost installer that automatically offers GitHub release builds. New releases include separate first-install images and app-only updates.

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

When a phone or laptop is connected, the Heltec screen shows:

| Indicator | Meaning |
|---|---|
| Callsign and incident | This radio's station and active incident |
| Three connected squares + number | Other online radios in this incident; excludes your own radio |
| Up arrow + number | Outgoing forms still waiting for radio ACK |
| Envelope + number | Unread incoming forms |
| RF ON / TX / RXING / TX OFF / RF PAUSED | Radio activity and transmission status; RXING appears during reception and briefly afterward so short packets are visible. Errors or a missing callsign are also shown |
| Battery icon and voltage | Approximate battery level based on measured voltage |
| Bottom line | Newest unread sender, or frequency and connected Wi-Fi client count when there are no unread forms |

The battery bars are a rough voltage indication, not an exact percentage or remaining runtime. A `?` / `--V` means no plausible reading is available; `!` means the measured voltage is low. USB/charger power can affect the reading, and the firmware does not detect battery presence or charging state. The sensor handles the original V3 and V3.2 control polarities described in [Heltec’s hardware notes](https://docs.heltec.org/en/node/esp32/wifi_lora_32/hardware_update_log.html); readings still need verification on physical boards.

Disconnect all Wi-Fi clients to show the Wi-Fi credentials again. The battery icon remains visible, and **RXING** appears beside the password label during receive activity. Credentials are also printed over USB serial. Send `wifi` followed by Enter/newline at 115200 baud to print them again; this is how you connect to a headless XIAO build.

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

Joining queues an announcement immediately when transmission is allowed. Routine announcements repeat every **2–2½ minutes**. A newly discovered or restarted node can prompt an earlier response, with a 30-second response cooldown; radio traffic can delay either. Use **Refresh data** to check again without reloading the page. The header shows both nodes heard and nodes in your active incident.

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
3. On `NET-A`, open the message and look for `NET-B` in the **Manually acknowledged by** list once the acknowledgment arrives.

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

Saved drafts with no subject are labeled **Untitled draft-1**, **Untitled draft-2**, and so on. Numbers stay with each untitled draft across saves and page reloads. When no untitled drafts remain, numbering starts again at 1. These labels do not fill in the form’s Subject field.

### Delete a draft

In **Compose**, find the saved draft above the form and click **Delete** beside its title. Confirm to delete it from this device. If it is the draft you are editing, the form clears for a new draft. Other drafts and sent messages stay saved. Deletion cannot be undone.

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

## Automatic radio traffic and retries

Form8 keeps listening when there is no message to send. It still needs occasional radio traffic to discover stations, repair missed forms, and recover acknowledgments. **All LoRa packets use a shared broadcast channel**, including forms addressed to a callsign; the destination callsign does not turn the radio link into a private connection.

Idle broadcasts are deliberately slow. New/restarted stations trigger faster synchronization, and unanswered messages gradually back off. Random timing spreads stations out so they do not all transmit together.

### Background discovery and synchronization

| Why we transmit | When and how often | Repeats and limits |
|---|---|---|
| **Station/incident announcement — Hello** | Once when transmission becomes allowed after startup, incident joining, or radio reconfiguration; then every **120–150 seconds**. Contains callsign, active incident name/ID, and a boot-session marker. | No receipt is required. The next regular announcement is its recovery mechanism. A full local queue is retried after **2 seconds**. |
| **Discovery response — Hello** | A previously unknown station, changed incident, changed boot session, or station returning after being offline prompts an announcement of our station/incident. | Responses wait until at least **30 seconds** after our last queued Hello. Several discoveries share one pending response. Ordinary announcements from an already-known, unchanged online station do not trigger responses. |
| **Quiet inventory page** | First checked **5 minutes** after startup/reconfiguration/joining, then one page every **5–6 minutes**. Each page lists up to **8 retained form bodies** and checksums. | No packet is sent if there are no bodies. Pages rotate through the active incident. At 200 bodies, a full quiet pass takes roughly **125–150 minutes**, before congestion. Queue failures retry the page after **2 seconds**. |
| **New/restarted-node synchronization — inventory pages** | A new/restarted station in our active incident, an incident change into our incident, or a same-incident station returning after the 10-minute offline threshold triggers a full inventory pass: first page as soon as allowed, following pages every **10–12 seconds**. | At most one accelerated pass starts per **2 minutes**. Discoveries during an existing pass are combined rather than restarting it. A 200-body pass takes roughly **4–5 minutes**, before congestion. Empty inventories stay silent. |
| **Recovery of our saved manual ACKs** | On a form's normal, quiet inventory-page visit, re-advertise this station's saved manual ACK only if at least **30 minutes** have passed since its last tracked ACK queue attempt and its early repeats are finished. | This is a minimum interval per form, not a promise of one ACK every 30 minutes: large inventories take longer to revisit. Only retained bodies in the active incident participate. Reboot/reconfiguration clears the in-memory timing, so a later quiet page may repeat an older saved ACK. |

An inventory is also evidence that its publisher still holds a form body. A receiver can update that station's radio receipt from the inventory without sending an extra ACK packet just for that evidence.

### Traffic caused by sending, receiving, or repairing a message

| Why we transmit | Trigger | Retry behavior |
|---|---|---|
| **New form — Data** | You send a new message, reply, or correction. The saved form is queued immediately, subject to radio/channel availability. Long forms are split into packets. | Full-form retry waits after completed transmissions are **3 s, 3 s, 3 s, 1 min, 5 min, then 15 min**. The 15-minute interval continues while required radio receipts are missing. There is a three-second receive-only window after each complete local form transmission. |
| **Missing-form request — Request** | An inventory advertises a body this radio does not have. Deliberately archived/discarded bodies are not requested again. | There is no separate periodic request timer. If the body is still missing when another inventory advertises it, a new request can be made. Identical requests still waiting in our queue are combined. Requests have the normal relay delay plus up to **2.8 seconds** of per-entry spreading within an eight-entry inventory. |
| **Repair body — Data** | A request matches a retained body and checksum on this radio. | Queue the matching body; an already-pending job for that body is reused. No independent repair-response retry timer runs. Another request can trigger another response if needed. |
| **Radio receipt — Receipt** | A complete received body is successfully saved to flash; or the first fragment of an already-known body is received again. | One receipt per trigger, with identical still-unsent receipts combined. A sender's later Data retry can prompt another receipt. Inventories also provide receipt evidence. Failed saves do not generate a successful receipt. |
| **Operator acknowledgment — HumanAck** | You click **Acknowledge** and the acknowledgment is saved. Reading a form does not trigger this packet. | Initial queue attempt, then up to **two early repeats**, scheduled around **15 and 60 seconds** after the initial successful queue attempt. A full queue is retried after **2 seconds**. Slow recovery follows the background rule above. |
| **Manual ACK after a repair body — HumanAck** | This radio finishes sending a requested body that its own operator previously acknowledged. | Queue our saved manual ACK **after the final body fragment**, so the receiving station can store the body before processing the ACK. One per repair-body response; no separate retry timer for this response. |
| **Forwarding someone else's packet — relay** | A valid new packet arrives with forwarding allowance remaining. Other-incident traffic is ignored except for Hello discovery packets. | Forward once after a random **100–1,299 ms** delay, plus queue/channel delays. Duplicate packets are suppressed by a **2-minute cache**. Packets allow up to **five forwards** after the originating transmission. A new retry/announcement is a new packet and can be relayed again. There is no idle relay timer. |

These intervals describe when work becomes eligible or is queued, not guaranteed on-air times. Higher-precedence forms, queued packets, reception already in progress, and a busy channel can delay transmission. Every eighth queue selection serves the oldest eligible item so routine/control traffic can still progress.

### Channel access, queue failures, and stopping retries

- After an ordinary packet transmission, allow a random **100–699 ms** gap. After a complete locally originated form, the **3-second receive-only window** takes precedence.
- If channel scanning finds activity or returns an error, wait **500–2,999 ms** before trying again. A channel scan is listening, not another broadcast.
- If starting a packet transmission fails, retry that frame after **2 seconds**. If a local Data frame cannot be requeued, unblock its form for a later full-form attempt instead of leaving it permanently marked queued. A dropped relay/control frame relies on the recovery rules above.
- Identical locally generated Hello, inventory, request, receipt, and manual-ACK packets that are still unsent are combined. The mesh keeps at most **48 queued frames** and **4 outgoing body jobs**; overflow is counted under Radio setup.
- **Transmission disabled**, **Pause all radio transmission**, a missing/invalid callsign, or an unavailable radio prevents LoRa transmissions. The radio can still receive when its hardware is available. Unpausing/reconfiguring resets the in-memory schedules.
- A full-form retry stops once its required radio receipts arrive. Requested repair bodies are still sent in full for stations that missed them. Sent forms are kept pending rather than silently dropped because a station is absent. A human acknowledgment is not additionally required to stop a radio-delivery retry.
- Switching incidents clears queued work and retry schedules for the previous incident; its stored forms stay saved. Rebooting or reconfiguring the radio also restarts pending forms' retry sequence. Archiving/discarding cancels only that body's buffered transmissions and stale queued inventory pages; it does not restart unrelated messages or announce the unchanged incident again. A transmission already in progress may finish.

### What happens on Wi-Fi instead of LoRa?

The phone/laptop webpage checks radio status every **2 seconds**. Clicking **Refresh data**, reading a message, editing a draft, updating the LCD, and measuring battery voltage do not themselves broadcast a LoRa packet. Sending a form, joining an incident, saving radio configuration, and manually acknowledging a form have the radio effects described above.

The Wi-Fi hotspot has its own discovery beacons, independent of LoRa: the pinned Arduino framework uses a **100-TU beacon interval**, approximately **102 ms**, while the hotspot is running. Wi-Fi association, connection maintenance, and webpage requests also generate Wi-Fi traffic. Those are not included in the LoRa TX/RX counters or the LoRa schedules above.

Update **all** participating radios to get the quieter behavior throughout the network. Older firmware can still originate and relay its more frequent control traffic. Slower quiet inventories trade background airtime for slower recovery of a loss that does not trigger a new-node pass or a pending-form retry; delivery still needs physical radio testing.

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

Look for **Radio ACK** from the intended station. That means its radio saved the form. The **Manually acknowledged by** list shows every station with a saved manual acknowledgment, including your own. An unknown callsign is shown as its node ID. A local save or a cleared unread indicator is not a remote receipt.

### How long does delivery take?

There is no guaranteed delivery time. It depends on message length, radio settings, signal conditions, relays, and other traffic. Short messages require less airtime.

Pending local messages are retried automatically: an initial send plus up to three quick retries spaced three seconds after the previous complete transmission, then waits of **1 minute**, **5 minutes**, and **15 minutes**. Further retries stay at 15-minute intervals until the required radio receipts arrive. A busy channel, paused transmission, or queued traffic can delay these attempts. See [all automatic traffic and retry rules](#automatic-radio-traffic-and-retries).

### Who receives a broadcast? Who receives an addressed message?

Radios with the same active incident and compatible radio settings can store and relay both. A broadcast waits for receipts from tracked stations, or at least one remote station if none were known. A callsign-addressed message waits for that callsign's receipt. Neither is private.

### Can radios relay messages through other radios?

Yes. Compatible Form8 radios can forward packets through multiple hops. Actual range and delivery still depend on the radio path; no particular distance has been validated here.

### Why does a station still show Pending when it is offline?

Known stations remain on a message's tracked list, even when they stop announcing themselves. This avoids treating an absent station as a successful delivery. A station is shown offline after **10 minutes** without an announcement. This allows several missed announcements at the quieter 2–2½ minute interval.

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

It uses a separate protocol and does not communicate with Meshtastic or MeshCore. Heltec V3, Heltec V4 OLED, XIAO ESP32S3 with Wio-SX1262 B2B, and T3-S3 SX1262/SX1276 have ESP32 build targets. Check the [board guide](docs/BOARDS.md) for exact variants. T-Beam BPF VHF support is experimental and incomplete. nRF52 boards are excluded. A VHF-to-UHF bridge and Form 1 support are not implemented.

## Troubleshooting

### The other radio does not see my incident or message

Check in this order:

1. Confirm both radios run Form8 firmware, rather than the simulator or another mesh protocol.
2. Under **Radio setup**, compare the actual frequency, bandwidth, spreading factor, coding rate, and backup selection on both radios.
3. Confirm each has a saved callsign, **Enable radio transmission** checked, and **Pause all radio transmission** unchecked.
4. Compare the full **Incident ID** in both headers. Matching incident names are not enough.
5. Click **Refresh data**. Give periodic announcements time to arrive; routine announcements repeat every 2–2½ minutes when transmission is allowed. A new/restarted node normally prompts an earlier discovery response, subject to a 30-second response cooldown.
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
npm run test:display
npm run test:boards
pio run -e heltec-v3
pio run -e heltec-v3 -t buildfs
```

`buildfs` builds a filesystem image on your computer; it does not upload it. The native mesh tests compile the transport code used by the firmware with address/undefined-behavior sanitizers. Test coverage includes packet validation, reassembly, relaying, receipts, failed saves, repair, incident isolation, queues, and scheduling. UI tests cover refresh behavior, message navigation, and human acknowledgment state. After the Heltec build installs its display dependency, `npm run test:display` tests the OLED layout using the same fonts, checks drawing bounds and battery-sensing logic, and writes previews to `tmp/oled-previews/`. These host tests do not verify real battery readings.

Before relying on the system in an incident, physical testing still needs to cover two-radio delivery, a three-radio relay chain, reboot persistence, interrupted writes, full storage, offload recovery, and sustained load.

### Companion development

The companions use the same interface as the radio-hosted webpage.

- **Desktop:** run `npm install`, then `npm run desktop`. Package on the appropriate OS with `npm run desktop:package`. Stop the simulator first: both use port 8848. The Electron wrapper serves the bundled interface locally and forwards radio requests to `192.168.4.1`.
- **Android / iOS:** run `npm install` and `npm run mobile:prepare`; add your platform with `npx cap add android` or `npx cap add ios`, then run `npm run mobile:sync`. Open it with `npx cap open android` or `npx cap open ios` and build using that platform's tools. iOS needs macOS and signing credentials.
- Follow [the companion guide](docs/COMPANIONS.md) for location permissions, local-network access, and HTTP configuration. Native mobile archive export/share still needs platform verification.

### Hardware and storage details

The Heltec V3 uses SCK 9, MISO 11, MOSI 10, CS 8, DIO1 14, reset 12, and busy 13, with DIO2 RF switching and a 1.8 V DIO3 TCXO. No PSRAM is required. The radio profile uses sync word `0x12` and an eight-symbol preamble.

File storage is approximately 3.94 MiB on Heltec V3 and XIAO S3, 9.94 MiB on Heltec V4, and 0.94 MiB on T3-S3, with a 256 KiB reserve. See [the board guide](docs/BOARDS.md) for build commands and firmware bundles. Forms and receipt metadata are stored in LittleFS. The firmware does not automatically format storage if mounting fails. Offloaded bodies are not served back to the mesh from a companion; automatic restoration and metadata compaction remain future work.

For deeper detail, see [the protocol](docs/PROTOCOL.md), [the implementation requirements](REQUIREMENTS.md), and [the companion guide](docs/COMPANIONS.md).
