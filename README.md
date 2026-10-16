# Form8

Form8 exchanges **Portland NET Form 8 / ICS 213 messages and short chat messages over LoRa**, using a phone or laptop connected to a radio’s Wi-Fi hotspot. Messaging works without internet or cell service after installation.

Forms support radio receipts, manual acknowledgments, replies, corrections, and device archives. Chat supports emoji, reactions, and replies. The interface runs on the radio and fits a phone screen.

Builds cover Heltec V3/V4, Seeed XIAO ESP32S3 with Wio-SX1262, and LILYGO T3-S3; T-Beam BPF is experimental. **Radio traffic is plaintext and unauthenticated.** Form8 uses its own protocol and does not communicate with Meshtastic or MeshCore. Physical range and reliability still need testing.

**[Install / update](https://form8.pdxlocs.com) · [Documentation & FAQ](https://github.com/pdxlocations/form8/wiki) · [Firmware releases](https://github.com/pdxlocations/form8/releases)**

## Screenshots

Example screens from the local simulator; these do not demonstrate an RF connection.

### Compose a form

![Form8 Compose screen with a sample supply request](docs/screenshots/compose.png)

### Read and acknowledge a message

![Form8 message reader with radio receipts and manual acknowledgments](docs/screenshots/traffic.png)

### Incident chat

![Form8 incident chat with replies, emoji reactions, and radio receipts](docs/screenshots/chat.png)
