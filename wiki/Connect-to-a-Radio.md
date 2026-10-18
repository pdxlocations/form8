# Connect your phone or laptop

**Android Bluetooth:** ESP32 can also use [paired Bluetooth with automatic Wi-Fi handoff](https://github.com/pdxlocations/form8/wiki/Bluetooth). nRF52840 uses [Bluetooth or USB serial with the companion](https://github.com/pdxlocations/form8/wiki/nRF52-and-Android). The Wi-Fi instructions below apply to ESP32.

The workspace uses eight icon buttons that fit across a phone screen: **pencil = Compose**, **envelope = Traffic**, **speech bubble = Chat**, **flag = Incidents**, **connected circles = Nodes**, **folded map = Map**, **archive box = Device archive**, and **gear = Radio setup**. On a computer, hover over an icon to see its name. Screen readers announce each button's name.

1. Power on the radio.
2. In your phone or laptop's Wi-Fi settings, connect to the network shown on the radio, such as `form8-abcd`.
3. Enter the eight-digit password shown on that radio's screen. Each radio has its own password.
4. Stay connected even if your device reports that this Wi-Fi network has no internet.
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

Disconnect all Wi-Fi clients to show the Wi-Fi credentials again. The battery icon remains visible, and **RXING** appears beside the password label during receive activity. Credentials are also printed over USB serial. Send `wifi` followed by Enter/newline at 115200 baud to print them again; this is how you connect to a headless XIAO build.

## Automatic time sync

Whenever the app connects or reconnects to a radio, it sets the radio’s clock from the phone or laptop automatically. It also detects a radio restart or a switch to a different radio. Normal two-second data refreshes do not repeatedly reset the clock. A failed time update is retried after ten seconds while the radio remains connected. The manual **Set radio time from this device** button remains available in Radio setup. This uses local Wi-Fi HTTP requests and does not broadcast over LoRa. Make sure your phone or laptop’s clock is correct.

## Light and dark mode

Open **Radio setup** (gear icon) and choose **Appearance**: **System (device default)**, **Light**, or **Dark**. System follows your phone or laptop's appearance setting. Your choice applies immediately to every tab and is saved in this browser on this device; you do not need to click Save settings. It works offline and does not change radio settings or send any radio traffic.

For automatic GPS positioning, ten-minute position sharing, and downloading maps before going offline, see [Location sharing and offline maps](Map-and-Location).

## Nodes tab

Open **Nodes** (connected circles) to see this radio and up to 31 recently heard node origins, across incidents. Each entry shows callsign, node ID, last advertised incident name/ID, online status, last-heard local date/time and elapsed time, RSSI in dBm and SNR in dB. Every valid received Form8 packet updates its origin’s last-heard reading, including duplicate packets. A node is offline after 90 minutes of silence; entries stay until evicted by more recently heard nodes or the radio restarts. An unheard or out-of-range node cannot appear, and names stay unknown until an announcement arrives.

**Hide offline nodes** shows only online remote entries while keeping this radio visible. The preference is saved on this phone/laptop and survives reloads. It does not change the radio’s peer list or counts, and it also works while the companion is disconnected.

**Forget node** removes that peer’s heard entry from the connected radio, including its last-heard location/signal details. Other connected clients see the change on their next refresh. Messages, receipt history, saved incidents, and the remote radio are kept. No LoRa packet is sent, and Radio transmission can be Off. The entry returns when another packet carrying that origin ID is received; it may initially show an unknown callsign until another announcement arrives. This radio cannot forget itself. Connect the radio to use Forget; nRF requires matching updated firmware and Android app.

RSSI/SNR measure the final radio hop of the last packet carrying that node’s origin ID. A **Forwarded packet** has passed through a relay. An unforwarded repair response can also be transmitted by another node while retaining the original sender’s ID. The protocol does not identify that physical last-hop sender, so these readings do not establish a direct signal to the listed origin. Last-heard/online likewise describe observed origin IDs, not proof that the original station is currently present. The connected radio has no self RSSI/SNR. Older firmware reports readings as unavailable; update the firmware to populate them. Refresh data and automatic UI polling do not transmit LoRa packets.

**Radio setup → Enable packet relaying** defaults to off. Enable it on nodes needed to extend coverage; leave it off on nearby clients. **Incidents → Announce incident** or **Announce** beside your active saved incident queues a discovery announcement immediately, without changing incidents or replaying forms. It requires an active incident, a saved callsign, and Radio transmission set to On. Announcements occur automatically once at startup/join/reconfiguration and then every 60–65 minutes (one hour plus random jitter). Manual announcements restart that hourly timer. Other nodes need matching radio settings and a direct or enabled relay path. With hourly announcements, an otherwise idle node remains marked online for 90 minutes.

See [Radio traffic](Radio-Traffic) for the reduced synchronization and form retry schedules.

## Radio transmission

**Radio setup → Radio transmission → On / Off** is the single control for all outgoing LoRa packets. Off stops messages, announcements, ACKs, position reports, and relays; receiving and local app access still work. Saved outgoing messages can resume when transmission is turned on. Save settings to apply the choice; it survives a restart. **Enable packet relaying** remains separate and defaults to off.

Older firmware internally stores separate enable/pause flags. The new screen shows their effective state: a previously paused radio appears Off. Saving On clears the old pause override, so there is no second control to find. No nRF firmware update is needed for this UI change.

### Resolve “Callsign unknown”

Callsigns travel in station announcements at startup, after incident joining or radio reconfiguration, then every **60–65 minutes**. Hearing a form, relay, receipt, or other packet before its announcement can show a node with an unknown callsign. The Nodes tab tracks packet origin IDs; a relayed packet may refer to an origin that is no longer reachable.

Press **Request ID** on that entry. The button immediately shows **Requesting…**, then a 30-second retry countdown. The addressed radio responds with its callsign and current incident, and the Nodes tab updates automatically. Requests work across incidents; you do not need to join the unknown node’s incident. Both ends need Radio transmission On and a saved callsign. The target and any intervening relays need firmware supporting ID requests; older firmware ignores them. An nRF radio can answer without a connected companion app. An unreachable/offline node will not answer. No automatic retries are sent, and nodes limit their replies to once per 30 seconds.
