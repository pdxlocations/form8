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
| `tbeam-bpf` | LILYGO T-Beam BPF, experimental VHF | 16 MB | None configured | None configured |

The `tbeam-bpf` environment is an experimental VHF target. Its display, GPS, power-management hardware, and RF behavior remain unverified. It is included in the firmware bundle and marked experimental in the manifest.

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

This builds all seven ESP32 targets, including the experimental T-Beam BPF, and writes:

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

To also build first-install images for the [DreamHost web flasher](../webflasher/README.md):

```sh
python3 tools/build_firmware.py --webflasher
```

This builds LittleFS and merges each board's actual bootloader, partition table, OTA initialization, app, and initialized storage into `form8-TARGET-factory.bin` at offset `0`. Factory images replace saved forms and settings. The ordinary app-only update remains at `0x10000`. Both kinds are included in the ZIP and checksum file; the manifest includes factory metadata. Add `--package-only --webflasher` to package existing firmware, filesystem images, and exported flash layouts.

## Automatic GitHub release builds

### Create a beta with an automatic commit suffix

1. Commit and push your changes, including this workflow on the default branch.
2. Open **Actions → Release firmware → Run workflow** on GitHub.
3. Choose the branch to release, then enter a version such as **`0.2.0`**. Use three numbers only: no `v`, commit suffix, or `beta` text.
4. Click **Run workflow**. The selected commit's first seven hex characters are appended automatically: tag `v0.2.0.54e0d8d-beta`, title **Form8 Firmware 0.2.0.54e0d8d Beta**.
5. Wait for the run to finish. All seven boards' update/factory images and checksums are built before a draft is created. The files are uploaded before that draft is published as a prerelease. On the web flasher, select **Show prereleases**; its cache may take five minutes to refresh.

The workflow creates a lightweight tag pointing to the exact checked-out commit. It will not reuse a tag pointing elsewhere or overwrite an already-published beta. Failed builds publish nothing. Upload/publishing failures leave a draft that **Re-run failed jobs** can resume. The repository's built-in token handles tag creation, assets, and publishing; no additional secret is needed.

The manual run builds and publishes in the same workflow because [events created by `GITHUB_TOKEN` do not start another release workflow](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow#triggering-a-workflow-from-a-workflow). It does not depend on its new prerelease triggering the release-event build again.

### Build a release created through the Releases page

1. Commit and push the firmware changes, target catalog, and `.github/workflows/release-firmware.yml` before creating the version tag. The workflow must be present in the tagged commit.
2. On GitHub, open **Releases → Draft a new release**.
3. Choose or create a version tag, for example `v0.2.0`, pointing to the commit you want to release. Add the release title and notes.
4. Click **Publish release**. Publishing a prerelease also starts the build; saving a draft or pushing a tag alone does not.
5. Open **Actions → Release firmware** to watch the build. After all targets build and their checksums pass, the workflow attaches each board's app-only and first-install `.bin` files, `form8-esp32-firmware.zip`, `SHA256SUMS`, `manifest.json`, and `README.txt` to that release. The web flasher discovers these assets automatically.

The workflow uses GitHub's [published release event](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#release) and the repository's built-in `GITHUB_TOKEN` with `contents: write`; no extra secret is needed. It builds the release tag rather than the latest branch commit. The target catalog in `config/firmware-targets.json` must contain every environment in `platformio.ini`, exactly once; the workflow checks this before compiling.

If a release-event build fails, check the Actions log. No upload step runs until every build and checksum check passes. After resolving the problem, publish a new version tag. For a temporary download/upload failure, use **Re-run failed jobs** on the existing run; matching asset names are replaced on a rerun. Firmware compilation does not establish hardware validation, and the T-Beam BPF remains experimental.

## nRF boards excluded

As requested, no nRF52 targets are added: Heltec Mesh Node T096/T114, Seeed Tracker T1000-E, RAK4631, WisMesh Tag, T-Echo, Wio Tracker L1, Seeed Solar Node, and XIAO nRF52 Kit are excluded. They need a separate platform and client-transport port rather than this ESP32 Wi-Fi firmware.

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
