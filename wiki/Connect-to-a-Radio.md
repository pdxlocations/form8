# Connect your phone or laptop

**Android Bluetooth:** ESP32 can also use [paired Bluetooth with automatic Wi-Fi handoff](https://github.com/pdxlocations/form8/wiki/Bluetooth). nRF52840 uses [Bluetooth or USB serial with the companion](https://github.com/pdxlocations/form8/wiki/nRF52-and-Android). The Wi-Fi instructions below apply to ESP32.

The workspace uses seven icon buttons that fit across a phone screen: **pencil = Compose**, **envelope = Traffic**, **speech bubble = Chat**, **flag = Incidents**, **folded map = Map**, **archive box = Device archive**, and **gear = Radio setup**. On a computer, hover over an icon to see its name. Screen readers announce each button's name.

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
