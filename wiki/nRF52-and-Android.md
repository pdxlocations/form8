# nRF52 radios and the Android companion

Form8 can use nRF52840 LoRa boards over **Bluetooth or USB serial**. These radios have no Wi-Fi webpage. The Android app bundles the interface and stores forms, receipts, chat, drafts, archives, and offline maps on the phone. Internet is only needed to download/install software and map tiles.

The targets compile and the Android app builds and passes lint. **Physical board, Bluetooth, USB, GPS, battery, and over-the-air testing are still required.** The initial nRF support is experimental. Board displays, buttons, sleep/power optimization, and background Android reception are not implemented.

## Choose the exact target

| Board | Target | Radio | GPS |
|---|---|---|---|
| RAK4631 / WisBlock | `rak4631` | SX1262 | Optional WisBlock GPS |
| RAK WisMesh Tag | `wismesh-tag` | SX1262 | Onboard |
| LILYGO T-Echo | `t-echo` | SX1262 | Onboard |
| Heltec Mesh Node T114 | `heltec-t114` | SX1262 | Optional expansion |
| Heltec Mesh Node T096 | `heltec-t096` | SX1262 with amplifier | Onboard |
| Seeed Wio Tracker L1 | `seeed-wio-tracker-l1` | SX1262 | Onboard |
| Seeed XIAO nRF52840 + standalone Wio-SX1262 kit | `seeed-xiao-nrf52-kit` | SX1262 | Phone |
| Seeed Solar Node | `seeed-solar-node` | SX1262 | Onboard |
| Seeed SenseCAP T1000-E | `seeed-t1000-e` | **LR1110** | Onboard |

Use 868/915 MHz hardware appropriate to your chosen frequency. These targets use UHF; they are not 433 MHz images. The XIAO target uses the standalone Wio-SX1262 module/kit (SKU 113010003 / 102010710), whose pins differ from the B2B module. Do not substitute the ESP32 XIAO target.

## Install the radio firmware

1. Download `form8-nrf52-firmware.zip` from the [release assets](https://github.com/pdxlocations/form8/releases).
2. Extract the ZIP and choose the **matching board** `.uf2` file.
3. Put the board in its vendor's UF2 bootloader mode, usually by double-pressing Reset. Read `INFO_UF2.TXT` on the USB drive.
4. Confirm the board has a compatible UF2 bootloader with **Nordic S140 7.3.0**. These images start at `0x27000`; they **do not contain a SoftDevice or bootloader**. If you have S140 6.1.1 or cannot identify the installed version, use the board vendor's instructions to install the correct bootloader/SoftDevice before proceeding. Do not copy a bootloader intended for a different board.
5. Copy the matching Form8 `.uf2` onto the bootloader drive. The board should restart and advertise `Form8-xxxxxx` over Bluetooth.
6. No filesystem image is needed. Do not use the ESP32 web flasher for an nRF board. The `.hex` is an application-only image for developers with appropriate programming tools; a mass erase removes prerequisites and is not a normal update.

The T1000-E magnetic cable normally does **not** expose a USB CDC data connection. Use Bluetooth for the companion. Entering/updating its bootloader may require the vendor's documented Bluetooth DFU or programming accessory procedure; the Form8 Android app is not a firmware flasher.

## Install the Android app

1. Download **`form8-android-debug.apk`** from the release assets, or use the locally built `dist/form8-android-debug.apk`.
2. Open the APK on your Android phone. Allow that browser/file manager to install unknown apps when Android asks, then tap **Install**.
3. Open **Form8**. Its screens are bundled; no radio hotspot or internet connection is required to open the app.
4. Open **Settings → Radio connection**.

This is an installable **development APK**, signed with a public development key checked into this project. It is not a production-signed or Play Store app. Development builds use the same key so installing an update can preserve app data. Do not use that public key for production signing. A production build needs a private signing key and its own release process. Android 6 / API 23 is the minimum; device verification remains necessary.

For ESP32 Bluetooth with Wi-Fi handoff, use the [Bluetooth guide](https://github.com/pdxlocations/form8/wiki/Bluetooth). ESP32 keeps bodies on the node; the companion-owned storage behavior below applies to nRF52840.

## Connect over Bluetooth

1. Turn on the radio and the phone's Bluetooth.
2. In **Settings → Radio connection**, choose **Bluetooth (ESP32 / nRF52)**.
3. Tap **Find radios** and allow **Nearby devices** permission. Android 11 and earlier also need location permission and Location enabled for BLE discovery.
4. Select `Form8-xxxxxx`, then tap **Connect**. Pairing in Android's Bluetooth settings is not required.
5. Wait for the connected board name and node ID. Set your callsign, matching frequency/modem settings, and **Enable radio transmission**, then save.
6. Create or join an incident. A second radio must join the **same Incident ID**, not merely create another incident with the same name.

Defaults: **915 MHz, BW 500 kHz, SF9, CR 4/8, 14 dBm chip setting**, with transmission disabled until configured. On T096 the setting is chip drive before external amplification. All participants must match the modem settings. ESP32 and nRF nodes use the same Form8 LoRa protocol and can exchange traffic; interoperability still needs physical testing.

## Connect over USB serial

1. Use a phone that supports USB host/OTG, an appropriate OTG adapter, and a **data-capable** cable to a board's USB data connector.
2. Choose **USB serial (nRF52)**, then **Find radios**.
3. Select the CDC radio and tap **Connect**. Accept Android's USB access prompt.
4. Configure the station and incident as above. The application uses CDC serial at **115200 baud**; USB and Bluetooth expose the same radio protocol.

USB serial currently supports the native **USB CDC** interface in these nRF builds. It does not include CH340/CP210x/FTDI adapters. If the radio is in bootloader mode, finish flashing/restart it first.

## What happens when the phone disconnects?

- The radio keeps its callsign, incident, radio profile, and transmission settings in internal flash. It can still discover peers, broadcast a fresh onboard position on its configured interval, and **relay packets for its selected incident**.
- Message bodies live in Android storage. Without the companion, the radio cannot durably receive a new form/chat event, ACK its storage, repair stored bodies for other nodes, or run the companion's full-message retries. Bluetooth advertising continues for reconnection.
- Keep Form8 **open in the foreground** for reliable receiving. There is no Android foreground service; locking the phone, switching apps, or battery optimization can suspend reception and storage/ACK processing.
- On reconnect, the app reloads its record index, saves pending received bodies, and resumes applicable delivery attempts. A radio ACK is queued only **after the app validates and commits the body to IndexedDB**. Up to three complete incoming bodies wait in radio RAM; reset/power loss can remove those uncommitted bodies, which have not been ACKed.
- One companion identity can hold the radio link at a time. Another companion can attach after **15 seconds** without a request from the current owner. This lease prevents simultaneous writers; it is not authentication. Bluetooth NUS and USB serial are not an encrypted/authenticated Form8 session.
- The app reopens its last radio's saved traffic even offline. Drafts, archives, appearance, and maps are local to this app; record stores are separated by node ID. Switching to another phone does not transfer the previous phone's stored bodies. Export archives/maps before clearing app data or uninstalling.

Radio metadata is bounded to **512 form/chat records per radio store**, including archived/discarded form metadata; chat retains up to **96 events**, with the newest 30 messages shown. Forms are not silently evicted. Archiving frees bodies but retains metadata, so the record-count limit still applies. Storage usage reports the Android WebView storage estimate where available. Battery values are divider-based estimates, not calibrated fuel-gauge readings.

## Maps and exports

Use **Map → Download area** while the phone has internet. Bluetooth/USB can stay connected while cellular or Wi-Fi supplies map tiles. Previously downloaded maps remain available offline. Archive and map exports open Android's **Save as** picker; choose a durable location. Imports use the existing file picker.

## Build with pioarduino / PlatformIO

All **21 environments** (12 ESP32 and nine nRF52840) appear in the main project. Open the repository folder containing `platformio.ini`. In the PlatformIO/pioarduino **Project Tasks** panel, refresh the task list, then expand a target such as **rak4631 → General → Build**. You can also select the target from the environment selector in the bottom status bar. If the list still shows only ESP32, use **Developer: Reload Window** in VS Code's Command Palette.

For example, `pio run -e rak4631` and `pio run -e seeed-t1000-e` work from the project root. `config/nrf52.ini` supplies the nRF environments to the main project. The optional `platformio-nrf52.ini` wrapper remains available for nRF-only command-line builds; it is no longer necessary to select a different configuration to see the nRF targets in the IDE.

## Build it yourself

```sh
npm ci
npm run build:nrf52
npm run build:android
```

nRF compilation needs PlatformIO. Android compilation needs JDK 21 or later, Android SDK platform/build tools 35, and accepted SDK licenses. Set `JAVA_HOME` and `ANDROID_HOME` if needed. On macOS the script recognizes Android Studio's bundled JDK and the default SDK folder.

Outputs:

- `dist/form8-nrf52-firmware.zip`: nine application-only UF2/HEX pairs and SHA-256 checksums.
- `dist/form8-android-debug.apk` and `.apk.sha256`: installable development companion.

The release workflow builds both alongside the ESP32 targets. The nRF source/configuration lives in `firmware/nrf52/`, `config/nrf52.ini`, and `config/nrf52-targets.json`. Android transport code lives in `android/app/src/main/java/org/form8/radio/`; RPC framing and storage/API adaptation live in `companion/radio-rpc.js` and `companion/nrf-api.js`.

Pin maps were checked against the [upstream board variants](https://github.com/meshtastic/firmware/tree/develop/variants/nrf52840); runtime uses Form8's own protocol, not Meshtastic. USB/BLE support uses [Adafruit's nRF52 Arduino core](https://github.com/adafruit/Adafruit_nRF52_Arduino) and the Nordic UART service.

## Download from the web flasher

Open [form8.pdxlocs.com](https://form8.pdxlocs.com), select your release and exact nRF board, choose UF2 or HEX, and download/verify/save the image. This also works in browsers without Web Serial. The site downloads nRF files; install them using the bootloader/programmer instructions above. See [Web Flasher](Web-Flasher) for the full steps.
