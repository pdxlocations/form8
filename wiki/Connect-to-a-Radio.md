# Connect your phone or laptop

**Android Bluetooth:** ESP32 can also use [paired Bluetooth with automatic Wi-Fi handoff](https://github.com/pdxlocations/form8/wiki/Bluetooth). nRF52840 uses [Bluetooth or USB serial with the companion](https://github.com/pdxlocations/form8/wiki/nRF52-and-Android). The Wi-Fi instructions below apply to ESP32.

The workspace uses eight icon buttons that fit across a phone screen: **pencil = Compose**, **envelope = Traffic**, **speech bubble = Chat**, **flag = Incidents**, **connected circles = Nodes**, **folded map = Map**, **archive box = Device archive**, and **gear = Radio setup**. On a computer, hover over an icon to see its name. Screen readers announce each button's name.

1. Power on the radio.
2. In your phone or laptop's Wi-Fi settings, connect to the network shown on the radio, such as `form8-abcd`.
3. Enter the eight-digit password shown on that radio's screen. Each radio has its own password.
4. Stay connected even if your device reports that this Wi-Fi network has no internet. Bluetooth discovery is paused while any device is connected to the hotspot. Disconnect all Wi-Fi clients to make Bluetooth available again; closing the browser alone is not enough.
5. Open **http://192.168.4.1** in your browser. Use `http`, not `https`.
6. Open **Radio setup** and enter your callsign, such as `NET-A`.
7. Check the radio settings, then click **Save settings**.

Navigation icons show small number badges when there is something new:

- **Traffic (envelope):** unread incoming forms on this radio in the active incident. Opening a form marks it read; simply opening Traffic does not.
- **Chat (speech bubble):** unread incoming texts in this incident on this phone/laptop. Opening Chat while the page is visible clears them. Your own texts, reactions, and radio receipt updates do not add unread texts.
- **Incidents (flag):** newly discovered online incidents you have not viewed on this phone/laptop. Several nodes advertising the same incident count once. Your active incident is excluded. Opening Incidents while the page is visible clears the badge.

Chat/incident read markers are saved in this browser separately for each radio; chat markers also separate incidents. They survive reloads, but clearing browser data resets them. Chat counts apply to the latest 30 retained texts returned by the radio. Badges hide at zero and display **99+** for larger counts; their accessible descriptions announce the full count. Chat and incident badges do not change the header’s form unread/queue totals. Badge refresh uses local Wi-Fi requests and does not add LoRa broadcasts.

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

Disconnect all Wi-Fi clients to show the Wi-Fi credentials again. The numeric firmware version, such as **v0.1.4**, appears to the right of the node ID without a commit hash. The battery icon remains visible, and **RXING** appears beside the password label during receive activity. Credentials are also printed over USB serial. Send `wifi` followed by Enter/newline at 115200 baud to print them again; this is how you connect to a headless XIAO build.

## Automatic time sync

Whenever the app connects or reconnects to a radio, it sets the radio’s clock from the phone or laptop automatically. It also detects a radio restart or a switch to a different radio. Normal two-second data refreshes do not repeatedly reset the clock. A failed time update is retried after ten seconds while the radio remains connected. There is no manual time-sync button. This uses the current local radio connection and does not broadcast over LoRa. Make sure your phone or laptop’s clock is correct.

## Light and dark mode

Open **Radio setup** (gear icon) and choose **Appearance**: **System (device default)**, **Light**, or **Dark**. System follows your phone or laptop's appearance setting. Your choice applies immediately to every tab and is saved in this browser on this device; you do not need to click Save settings. It works offline and does not change radio settings or send any radio traffic.

For automatic GPS positioning, ten-minute position sharing, and downloading maps before going offline, see [Location sharing and offline maps](Map-and-Location).

## Nodes tab

Open **Nodes** (connected circles) to see this radio and up to 31 recently heard node origins, across incidents. Each entry shows callsign, node ID, last advertised incident name/ID, online status, last-heard local date/time and elapsed time, RSSI in dBm and SNR in dB. Every valid received Form8 packet updates its origin’s last-heard reading, including duplicate packets. A node is offline after 90 minutes of silence; entries stay until evicted by more recently heard nodes or the radio restarts. An unheard or out-of-range node cannot appear, and names stay unknown until an announcement arrives.

**Hide offline nodes** shows only online remote entries while keeping this radio visible. The preference is saved on this phone/laptop and survives reloads. It does not change the radio’s peer list or counts, and it also works while the companion is disconnected.

**Forget node** removes that peer’s heard entry from the connected radio, including its last-heard location/signal details. Other connected clients see the change on their next refresh. Messages, receipt history, saved incidents, and the remote radio are kept. No LoRa packet is sent, and Enable radio transmission can be unchecked. The entry returns when another packet carrying that origin ID is received; it may initially show an unknown callsign until another announcement arrives. This radio cannot forget itself. Connect the radio to use Forget; nRF requires matching updated firmware and Android app.

RSSI/SNR measure the final radio hop of the last packet carrying that node’s origin ID. A **Forwarded packet** has passed through a relay. An unforwarded repair response can also be transmitted by another node while retaining the original sender’s ID. The protocol does not identify that physical last-hop sender, so these readings do not establish a direct signal to the listed origin. Last-heard/online likewise describe observed origin IDs, not proof that the original station is currently present. The connected radio has no self RSSI/SNR. Older firmware reports readings as unavailable; update the firmware to populate them. Refresh data and automatic UI polling do not transmit LoRa packets.

**Radio setup → Enable packet relaying** defaults to off. Enable it on nodes needed to extend coverage; leave it off on nearby clients. **Incidents → Announce incident** or **Announce** beside your active saved incident queues a discovery announcement immediately, without changing incidents or replaying forms. It requires an active incident, a saved callsign, and Enable radio transmission checked. Announcements occur once at startup, manually, or in response to newly heard/restarted/90-minute-returning nodes. There is no periodic timer, and joining/reconfiguring does not announce by itself. Discovery responses wait 1–5 seconds and at least 30 seconds since the previous announcement, with arrivals combined. Other nodes need matching radio settings and a direct or enabled relay path. A powered but silent node can show Offline after 90 minutes; this still measures last-heard traffic.

See [Radio traffic](Radio-Traffic) for the reduced synchronization and form retry schedules.

## Radio transmission

**Radio setup → Enable radio transmission** is a checkbox controlling all outgoing LoRa packets. Unchecking it stops messages, announcements, ACKs, position reports, and relays; receiving and local app access still work. Saved outgoing messages can resume when transmission is turned on. Save settings to apply the choice; it survives a restart. **Enable packet relaying** remains separate and defaults to off.

Older firmware internally stores separate enable/pause flags. The new screen shows their effective state: a previously paused radio appears unchecked. Checking the box and saving clears the old pause override, so there is no second control to find. No nRF firmware update is needed for this UI change.

### Resolve “Callsign unknown”

Callsigns travel in station announcements at startup, manually, or when a new node is heard. There are no periodic announcements. Hearing a form, relay, receipt, or other packet before its announcement can show a node with an unknown callsign. The Nodes tab tracks packet origin IDs; a relayed packet may refer to an origin that is no longer reachable.

Press **Request ID** on that entry. The button immediately shows **Requesting…**, then a 30-second retry countdown. The addressed radio responds with its callsign and current incident, and the Nodes tab updates automatically. Requests work across incidents; you do not need to join the unknown node’s incident. Both ends need Enable radio transmission checked and a saved callsign. The target and any intervening relays need firmware supporting ID requests; older firmware ignores them. An nRF radio can answer without a connected companion app. An unreachable/offline node will not answer. No automatic retries are sent, and nodes limit their replies to once per 30 seconds.

## Delete an incident and messages

On **Incidents**, the top **Delete active incident & messages…** button deletes the current incident’s stored forms, receipts, and chat from the connected radio/companion. Each saved incident also has **Delete incident & messages…**, so you can clear older incidents without changing the active one. Saved incidents advertised by online nodes appear only under **Nearby incidents**, keeping their management buttons there; other saved incidents appear under **Saved incidents on this node or app**. The confirmation explains the scope; deleting the active incident leaves it. Other incidents, client drafts/archives, and remote copies stay. Cancel keeps everything; deletion reports the number of forms and chat events removed. An active nRF incident requires a connected radio so leaving can be saved before deleting the companion’s traffic.

## Backup frequency

**Use backup frequency** selects the saved **Backup frequency · MHz** instead of the primary frequency. It does not change bandwidth, spreading factor, or coding rate. Enter a nonzero backup frequency before selecting it, and switch every participating node together. There is no automatic fallback or simultaneous listening on both frequencies.

## Refresh and action feedback

Each tab has **Refresh data**, and the page also refreshes radio data automatically. In Traffic, the button is on the message list and is hidden while reading a message; use **Back to traffic** to reach it. A refresh keeps your current tab and unsaved edits. Large loading messages appear during startup, tab-content requests, manual refreshes, and opening a form. They disappear when the request finishes or fails; background polling stays quiet. Status notices such as “Data refreshed” clear when you change tabs. Join, leave, send, and other asynchronous actions show progress and block duplicate submissions while working.

## Switching between nodes

Each node has its own client workspace, identified by its node ID. Connecting to node B puts node A’s drafts, device archives, unsent chat text, and edited settings away and loads B’s data. A new node starts with an empty client workspace. Reconnecting to A restores A’s saved workspace and refreshes its traffic. Messages from A do not become B’s outgoing messages. Late responses from the previous connection are discarded.

This does not remove or offload messages from either radio. ESP32 traffic remains on its radio; nRF traffic remains in that node’s separate Android store. Appearance and downloaded basemap tiles remain shared on the device.

After upgrading from an older app, unassigned device drafts and archives are kept separately. Connect to their original node, then use **Radio setup → Previous device data → Import previous device data…**. Confirm the callsign/node ID before assigning them. Older versions did not record their owner, so the app does not guess or copy them into every node’s workspace. Clearing browser/app data still removes local copies; export archives you need to keep.
