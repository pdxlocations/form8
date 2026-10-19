# Developer notes

## Checks

```sh
npm test
npm run test:mesh
npm run test:display
npm run test:boards
npm run test:api
pio run -e heltec-v3
pio run -e heltec-v3 -t buildfs
```

`buildfs` builds a filesystem image on your computer; it does not upload it. The native mesh tests compile the transport code used by the firmware with address/undefined-behavior sanitizers. Test coverage includes packet validation, reassembly, relaying, receipts, failed saves, repair, incident isolation, queues, and scheduling. UI tests cover refresh behavior, message navigation, and human acknowledgment state. After the Heltec build installs its display dependency, `npm run test:display` tests the OLED layout using the same fonts, checks drawing bounds and battery-sensing logic, and writes previews to `tmp/oled-previews/`. These host tests do not verify real battery readings.

Before relying on the system in an incident, physical testing still needs to cover two-radio delivery, a three-radio relay chain, reboot persistence, interrupted writes, full storage, offload recovery, and sustained load.

## Companion development

The companions use the same interface as the radio-hosted webpage.

- **Desktop:** run `npm install`, then `npm run desktop`. Package on the appropriate OS with `npm run desktop:package`. Stop the simulator first: both use port 8848. The Electron wrapper serves the bundled interface locally and forwards radio requests to `192.168.4.1`.
- **Android:** the native project is checked in. Run `npm ci`, then `npm run build:android` with JDK 21+ and Android SDK 35. See [nRF52 and Android](https://github.com/pdxlocations/form8/wiki/nRF52-and-Android) for Bluetooth/USB transport and storage.
- **iOS:** run `npm install` and `npm run mobile:prepare`, then `npx cap add ios` and `npm run mobile:sync`. Open with `npx cap open ios`; macOS and signing credentials are required. The current iOS wrapper supports ESP32 Wi-Fi only.
- Follow [the companion guide](https://github.com/pdxlocations/form8/wiki/Companions) for location permissions, local-network access, and HTTP configuration. Native mobile archive export/share still needs platform verification.

## Hardware and storage details

The Heltec V3 uses SCK 9, MISO 11, MOSI 10, CS 8, DIO1 14, reset 12, and busy 13, with DIO2 RF switching and a 1.8 V DIO3 TCXO. No PSRAM is required. The radio profile uses sync word `0x12` and an eight-symbol preamble.

File storage is approximately 3.94 MiB on Heltec V3 and XIAO S3, 9.94 MiB on Heltec V4, and 0.94 MiB on T3-S3, with a 256 KiB reserve. See [the board guide](https://github.com/pdxlocations/form8/wiki/Board-Guide) for build commands and firmware bundles. Forms and receipt metadata are stored in LittleFS. The firmware does not automatically format storage if mounting fails. Offloaded bodies are not served back to the mesh from a companion; automatic restoration and metadata compaction remain future work.

For deeper detail, see [the protocol](https://github.com/pdxlocations/form8/wiki/Protocol), [the implementation requirements](https://github.com/pdxlocations/form8/wiki/Requirements), and [the companion guide](https://github.com/pdxlocations/form8/wiki/Companions).

## Updating the GitHub wiki

The wiki pages are maintained in the project’s `wiki/` folder. After reviewing changes, publish them with:

```sh
python3 tools/publish_wiki.py
```

The wiki must first have an initial Home page created through GitHub’s Wiki tab. Publishing requires working GitHub Git credentials (`gh auth login` and, if needed, `gh auth setup-git`). The helper clones the wiki, updates these documentation pages, commits changed files using the project’s Git identity, and pushes without force. Other wiki pages are preserved.

## ESP32 Bluetooth implementation

`include/ApiGateway.h` dispatches both HTTP and BLE onto the same API handlers on the Arduino main loop. NimBLE callbacks enqueue bounded fragments; they do not write LittleFS or alter LoRa state. `include/EspBleBridge.h` provides paired/encrypted Nordic UART transport and idle timeouts. The main loop suspends/restores Wi-Fi after authenticated Bluetooth connection/disconnection. Android identifies the ESP32 pairing marker, waits for bonding, and selects `companion/radio-api.js`; nRF keeps its existing companion storage adapter. The portable API gateway test covers two-way HTTP/BLE shared writes/reads, request IDs, Unicode, framing, bad routes, and rejected writes with the firmware's ArduinoJson version. Physical pairing, timeout recovery, and RF coexistence still need device testing.

## Heltec V3 performance configuration

The effective release build uses a **240 MHz CPU**, **80 MHz QIO flash**, and **`-Os`** compiler optimization. The CPU is already at the ESP32-S3’s rated maximum; `-Os` favors smaller firmware rather than the most aggressive speed optimization. Other boards keep their own flash settings. Request transfers, serialized Bluetooth operations, and storage work can add latency; these require device measurements before attributing a UI delay to CPU speed. Foreground loading indicators show pending content without interrupting quiet background polling.
