# Choosing a Form8 firmware target

These targets build the same Form8 Wi-Fi/web interface and radio protocol. **Compilation is verified; physical board operation and RF performance still need testing.** Use matching radio settings and Incident IDs to communicate between boards.

## Target list

| PlatformIO target | Exact hardware | Flash | Screen | Battery voltage |
|---|---|---:|---|---|
| `heltec-v3` | Heltec WiFi LoRa 32 V3 / V3.2, SX1262 | 8 MB | OLED | Yes |
| `heltec-v4` | Heltec V4.2 OLED with GC1109 front end | 16 MB | OLED | Yes |
| `heltec-v4-3` | Heltec V4.3 OLED with KCT8103L front end | 16 MB | OLED | Yes |
| `seeed-xiao-s3` | XIAO ESP32S3 + ESP32S3-specific Wio-SX1262 B2B module | 8 MB | None configured | None configured |
| `tlora-t3-s3` | LILYGO T3-S3, 868/915 MHz SX1262 version | 4 MB | OLED | Yes |
| `tlora-t3-s3-sx1276` | LILYGO T3-S3, 868/915 MHz SX1276 version | 4 MB | OLED | Yes |
| `tbeam` | Original ESP32 T-Beam V1.0/V1.1/V1.2, 868/915 MHz SX1276 | 4 MB | Optional OLED | PMU |
| `tbeam-sx1262` | Original ESP32 T-Beam V1.x, 868/915 MHz SX1262 | 4 MB | Optional OLED | PMU |
| `tlora-v1-3` | T-LoRa T3 V1.3, SX1276, radio reset GPIO14 | 4 MB | OLED | Yes |
| `tlora-v2-1-1-6` | T-LoRa V2.1-1.6 / T3 V1.6, 868/915 MHz SX1276 | 4 MB | OLED | Yes |
| `tbeam-bpf` | LILYGO T-Beam BPF, experimental VHF | 16 MB | None configured | None configured |

The `tbeam-bpf` environment is an experimental VHF target. Its onboard L76K GPS is supported (UART RX6/TX5, 9600 baud), with AXP2101 ALDO4 GPS power enabled at 3.3 V. GPS acquisition, power-management behavior, display, and RF operation still need physical verification. It is included in the firmware bundle and marked experimental in the manifest.

**Match the target to the physical board and radio chip.** The T3-S3 also comes with SX1278, SX1280, and LR1121 chips; those variants are not covered by these targets. The 433 MHz and 2.4 GHz variants are not substitutes for the listed 868/915 MHz versions. The current default frequency is 919.500 MHz, with BW 500 kHz, SF9, and CR 4/8; select hardware appropriate for that frequency.

### Heltec V4

Select the target matching the board's front-end module (FEM):

- **GC1109 / V4.2:** `heltec-v4`. GPIO7 powers the FEM, GPIO2 enables it, and RadioLib drives GPIO46 high during transmission and low during reception/standby. SX1262 DIO2 handles the TX/RX path.
- **KCT8103L / V4.3:** `heltec-v4-3`. GPIO7 powers the FEM, GPIO2 enables it, and GPIO5 stays low for the receive LNA path. SX1262 DIO2 selects the transmit path.

The target assumes the 128×64 OLED, not the V4 TFT accessory. Form8 does not require PSRAM. **The TX power setting is the SX1262 drive level; the V4's external amplifier increases antenna output.** It is not a calibrated antenna-output setting. The Radio setup page shows this note on V4 builds.

### Seeed XIAO S3

The bare XIAO ESP32S3 has no LoRa radio. This target requires the **Wio-SX1262 board for XIAO ESP32S3**, connected through its B2B connector. It does not use the nRF52840 kit's through-hole wiring. Do not attach the camera board to the radio's connector at the same time.

No OLED or battery divider is assumed. Retrieve the Wi-Fi credentials over USB:

1. Connect USB and open a serial monitor at 115200 baud.
2. Send `wifi` followed by Enter/newline.
3. Read the hotspot name and password.
4. Connect your phone or laptop to that hotspot and open `http://192.168.4.1`.

The `wifi` console command works on all targets. It changes no settings.

### LILYGO T3-S3

Check the radio chip before choosing between `tlora-t3-s3` (SX1262) and `tlora-t3-s3-sx1276` (SX1276). Both use the onboard OLED. The SD card, GPS add-ons, and other expansion hardware are not integrated.

A 4 MB flash layout provides two 1.5 MB app slots and approximately 0.94 MiB of file storage, with the existing 256 KiB reserve. Available message storage is smaller than on Heltec V3/V4. The 512-record cap still applies, but free space can run out first. Actual capacity needs testing.

### Original ESP32 T-Beam and T-LoRa

These are **ESP32** builds, separate from the ESP32-S3 T3-S3 and T-Beam BPF builds. All use 4 MB flash with two 1.5 MB app slots and approximately 0.94 MiB file storage. Their UHF defaults match the other UHF targets: 919.500 MHz, BW 500, SF9, CR4/8.

**T-Beam V1.x:** choose `tbeam` for SX1276 (maximum 20 dBm), or `tbeam-sx1262` for SX1262 (maximum 22 dBm). Power initialization detects AXP192 or AXP2101 and enables the radio/GPS rails before radio startup; PMU battery voltage is supported. The GPS UART uses ESP32 RX34/TX12 at 9600 baud. An optional SSD1306 OLED uses SDA21/SCL22; without it, retrieve Wi-Fi credentials over USB serial using `wifi` at 115200 baud. T-Beam V0.7, S3 Supreme, LR1121, and 433 MHz variants are not covered by these targets.

**T-LoRa revisions:** choose by the PCB revision/pin wiring, not just the words “T-LoRa.” Both targets use SX1276 and accept 2–20 dBm:

| Target | OLED SDA/SCL/reset | Radio reset | Battery |
|---|---|---|---|
| `tlora-v1-3` | 21 / 22 / none | GPIO14 | ADC35, 2:1 divider |
| `tlora-v2-1-1-6` | 21 / 22 / none | GPIO23 | ADC35, 2:1 divider |

Both use radio SPI SCK5/MISO19/MOSI27, CS18, DIO0/IRQ26, and DIO1 on GPIO33. TCXO-equipped T3 variants, SX1278/433 MHz, and other revisions need a matching target and are not interchangeable. SD card and external GPS accessories are not integrated.

The old `tlora-v1` target has been removed. `tlora-v1-3` remains supported. The previous generic `tlora-v2-1` build is now named `tlora-v2-1-1-6`; the matching app-only update retains the same partition layout. Older GitHub releases retain their original target names.

Build examples:

```sh
pio run -e tbeam
pio run -e tbeam-sx1262
pio run -e tlora-v1-3
pio run -e tlora-v2-1-1-6
```

The pin/PMU assignments follow [LILYGO's board definitions](https://github.com/Xinyuan-LilyGO/LilyGo-LoRa-Series/blob/master/examples/GPS/TinyGPS_KitchenSink/utilities.h), [their PMU initialization](https://github.com/Xinyuan-LilyGO/LilyGo-LoRa-Series/blob/master/examples/GPS/TinyGPS_KitchenSink/LoRaBoards.cpp), and the [original LoRa32 V1 Arduino variant](https://github.com/espressif/arduino-esp32/blob/2.0.17/variants/ttgo-lora32-v1/pins_arduino.h). Physical RF, GPS acquisition, PMU behavior, OLED operation, and battery readings still need verification on these boards.

## Build and upload one target

For example, for a Heltec V4.2 OLED:

```sh
pio run -e heltec-v4
pio run -e heltec-v4 -t upload
```

For a **new, empty radio only**, initialize its file storage once:

```sh
pio run -e heltec-v4 -t uploadfs
```

Replace `heltec-v4` with your target from the table. **Do not upload a filesystem image for routine updates: it erases stored forms.** The webpage is included in the app firmware. Do not change partition layouts on a radio whose records you need to preserve.

For a XIAO, an update would be:

```sh
pio run -e seeed-xiao-s3 -t upload
pio device monitor -b 115200
```

Then send `wifi` with a newline if you missed the startup credentials.

## Build every target and package the binaries

```sh
npm run build:firmware
```

This builds all twelve ESP32 targets, including the experimental T-Beam BPF, and writes:

- `dist/form8-esp32-firmware.zip` — the complete app-only binary bundle.
- `dist/firmware/form8-TARGET.bin` — one app image per target.
- `dist/firmware/manifest.json` — board/radio details, flash size, image size, and SHA-256 hashes.
- `dist/firmware/SHA256SUMS` — checksums for the binaries.

These binaries are **app-only images**, not merged factory images. Their ESP32-S3 app offset is `0x10000`. For first installation, use the PlatformIO steps above so the bootloader, partition table, and initial filesystem are installed correctly.

To build only selected targets:

```sh
python3 tools/build_firmware.py --targets heltec-v4 seeed-xiao-s3
```

To package already-built images without compiling again:

```sh
python3 tools/build_firmware.py --package-only
```

To also build first-install images for the [DreamHost web flasher](https://github.com/pdxlocations/form8/wiki/Web-Flasher-Hosting):

```sh
python3 tools/build_firmware.py --webflasher
```

This builds LittleFS and merges each board's actual bootloader, partition table, OTA initialization, app, and initialized storage into `form8-TARGET-factory.bin` at offset `0`. Factory images replace saved forms and settings. The ordinary app-only update remains at `0x10000`. Both kinds are included in the ZIP and checksum file; the manifest includes factory metadata. Add `--package-only --webflasher` to package existing firmware, filesystem images, and exported flash layouts.

## Release builds

See [Publishing firmware releases](https://github.com/pdxlocations/form8/wiki/Releases) for the automatic beta button and release builds.

## nRF52840 boards

There are **nine nRF52840 board families** for RAK4631, WisMesh Tag, T-Echo, Heltec T114/T096, Seeed T1000-E, Wio Tracker L1, Solar Node, and the XIAO nRF52840 standalone Wio-SX1262 kit. The RAK4631 has separate `rak4631` (S140 7.3.0) and `rak4631-s140-6-1-1` (stock S140 6.1.1) build profiles; choose the version shown in `INFO_UF2.TXT`. They use Bluetooth or USB serial with the Android companion; message storage and the UI live in the app. See [nRF52 and Android setup](https://github.com/pdxlocations/form8/wiki/nRF52-and-Android) for exact variants, UF2 bootloader/SoftDevice requirements, and APK installation.

Build with `npm run build:nrf52` and `npm run build:android`. Outputs are `dist/form8-nrf52-firmware.zip` and `dist/form8-android-debug.apk`. nRF images are application-only UF2/HEX files, not ESP32 factory images. Hardware testing is still required.

## Verification

```sh
npm test
npm run test:mesh
npm run test:display
npm run test:boards
```

The board tests exercise pin routing, radio initialization/error propagation, RF switch configuration, front-end power controls, and battery scaling with host mocks. Display tests use the OLED fonts. These tests cannot verify real radio wiring, signal quality, FEM gain, USB behavior, or battery accuracy; check those on each physical board before field use.

## Hardware references

- [Heltec V4 hardware revisions](https://wiki.heltec.org/docs/devices/open-source-hardware/esp32-series/lora-32/wifi-lora-32-v4/hardware-update-log)
- [Heltec V4.2 hardware manual](https://s.heltec.cn/download/WiFi_LoRa_32_V4/datasheet/WiFi_LoRa_32_V4.2.0.pdf)
- [Heltec V4.3 schematic](https://resource.heltec.cn/download/WiFi_LoRa_32_V4/Schematic/HTIT-WB32LAF_V4.3.pdf)
- [Seeed XIAO ESP32S3 / Wio-SX1262 kit](https://wiki.seeedstudio.com/wio_sx1262_with_xiao_esp32s3_kit/)
- [LILYGO T3-S3 specifications and pin maps](https://github.com/Xinyuan-LilyGO/documentation/blob/master/en/products/t3-series/t3-s3/index.md)

The board-specific constants live in `include/BoardConfig.h`; radio setup lives in `include/Board.h`; build environments are in `platformio.ini`.

## TX power settings

**Radio setup → TX power** uses dBm, a logarithmic power unit: 14 dBm is about 25 mW, 20 dBm is 100 mW, and 22 dBm is about 158 mW. Enter a whole number. The radio reports its supported range, and both the settings form and firmware enforce that board's limit.

| Board target | Allowed setting | Meaning |
|---|---|---|
| Heltec V3, XIAO S3 + Wio-SX1262, T3-S3 SX1262, original T-Beam SX1262 | 2–22 dBm | SX1262 transmit power setting |
| Heltec V4.2 and V4.3 | 2–22 dBm | **TX chip drive**: SX1262 setting before the board's external amplification, not final antenna output |
| T3-S3 SX1276, original T-Beam SX1276, T-LoRa V1.3 / V2.1-1.6 | 2–20 dBm | SX1276 transmit power setting |
| T-Beam BPF | 2–10 dBm | Board-specific VHF limit |

The default remains 14 dBm on UHF boards and 10 dBm on T-Beam BPF. Existing valid saved values are preserved; an out-of-range saved value is clamped to the supported range during startup.

The chip limits follow [Semtech's SX1262/SX1276 specifications](https://www.semtech.com/uploads/design-support/semtech-products-shortform-catalog-web.pdf). Heltec V4 includes external amplification; [Heltec describes the high-power board as up to 28 dBm](https://heltec.org/project/wifi-lora-32-v4/). Form8 does not currently calibrate or convert the V4 chip setting into measured antenna-port power. The 22 dBm setting is not a claim of 22 dBm final output on that board. Physical output still needs RF measurement.
