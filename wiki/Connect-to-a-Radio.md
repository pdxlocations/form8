# Connect your phone or laptop

The workspace uses six icon buttons that fit across a phone screen: **pencil = Compose**, **envelope = Traffic**, **speech bubble = Chat**, **flag = Incidents**, **archive box = Device archive**, and **gear = Radio setup**. On a computer, hover over an icon to see its name. Screen readers announce each button's name.

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
