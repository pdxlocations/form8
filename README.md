# Form8

Form8 exchanges **Portland NET Form 8 / ICS 213 messages and short chat messages over LoRa**, using a phone or laptop. ESP32 radios host a Wi-Fi webpage or connect to the Android app over paired Bluetooth; nRF52840 radios connect to the Android companion over Bluetooth or USB serial. Messaging works without internet or cell service after installation.

Forms support radio receipts, manual acknowledgments, replies, corrections, and device archives. Chat supports emoji, reactions, and replies. A map shows incident stations, with automatic GPS positioning, configurable position sharing, and downloadable U.S. topo maps for offline use. The interface fits a phone screen; on nRF radios, the app carries the interface and message storage.

Nine nRF52840 board families include RAK4631, WisMesh Tag, T-Echo, Heltec T114/T096, and Seeed T1000-E, Wio Tracker L1, Solar Node, and XIAO nRF52 Kit. ESP32 builds cover Heltec V3/V4, Seeed XIAO ESP32S3 with Wio-SX1262, LILYGO T3-S3, original ESP32 T-Beam, and T-LoRa/LoRa32 revisions; T-Beam BPF is experimental. **Radio traffic is plaintext and unauthenticated.** Form8 uses its own protocol and does not communicate with Meshtastic or MeshCore. Physical range and reliability still need testing.

**[Android & nRF setup](https://github.com/pdxlocations/form8/wiki/nRF52-and-Android) · [Install / update](https://form8.pdxlocs.com) · [Documentation & FAQ](https://github.com/pdxlocations/form8/wiki) · [Firmware releases](https://github.com/pdxlocations/form8/releases)**

## RAK4631: choose the matching firmware

Double-press **Reset** and read the **SoftDevice** line in `INFO_UF2.TXT` on the RAK USB drive:

| Installed SoftDevice | Download |
|---|---|
| **S140 6.1.1** (stock RAK bootloaders, including 0.4.2) | `form8-rak4631-s140-6-1-1.uf2` |
| **S140 7.3.0** | `form8-rak4631.uf2` |

Match the **SoftDevice version**, not the bootloader version. The 6.1.1 build works with the existing stock bootloader; no bootloader upgrade is needed. Choose a release containing the matching file. The flasher requires you to enter the installed SoftDevice version and blocks unchecked or mismatched nRF downloads. [Step-by-step nRF installation](https://github.com/pdxlocations/form8/wiki/nRF52-and-Android#which-rak4631-firmware-should-i-install).

## Screenshots

Example screens from the local simulator; these do not demonstrate an RF connection.

### Compose a form

![Form8 Compose screen with a sample supply request](docs/screenshots/compose.png)

### Traffic

![Form8 Traffic tab listing messages with From and To fields and radio acknowledgment status](docs/screenshots/traffic-list.png)

### Read and acknowledge a message

![Form8 message reader with callsigns for Radio ACK, Human Ack, and Origin](docs/screenshots/traffic.png)

### Incident chat

![Form8 incident chat with composer at the top, newest messages first, replies, emoji reactions, and radio receipts](docs/screenshots/chat.png)

### Incidents

![Form8 Incidents tab for creating, joining, and switching between nearby and retained incidents](docs/screenshots/incidents.png)

### Incident map

![Form8 map with simulated incident stations and USGS topo tiles](docs/screenshots/map.png)

### Device archive

![Form8 Device archive tab with an archived form, message preview, and import and export controls](docs/screenshots/archive.png)

### Station and radio settings

![Form8 Settings tab with appearance, callsign, modem settings, transmit controls, and position sharing](docs/screenshots/settings.png)
