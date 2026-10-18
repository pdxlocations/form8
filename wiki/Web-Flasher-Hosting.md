# Hosting the Form8 web flasher

Upload this folder to a PHP-enabled DreamHost website. It offers published builds from **pdxlocations/form8** automatically; you do not upload new firmware to DreamHost for each release.

## Upload to DreamHost

1. Enable a currently supported **PHP 8.1 or newer** version for your domain. PHP's cURL, JSON, and ZIP (`ZipArchive`) extensions must be available, and the host must allow outgoing HTTPS to GitHub.
2. Enable HTTPS for the domain and wait for its certificate to become active. Browser USB flashing requires HTTPS (localhost also works for development).
3. Upload the **contents** of the `webflasher` folder into the DreamHost web directory configured for `form8.pdxlocs.com` using SFTP, for example `/home/YOUR_USER/form8.pdxlocs.com/`. Put `index.html`, `api.php`, and the other files directly in that directory.
4. Open **https://form8.pdxlocs.com/** in desktop Chrome or Edge. Do not open `index.html` as a local file.
5. Check `https://form8.pdxlocs.com/api.php?resource=releases`. It should return JSON with the repository and release list. If PHP source downloads or displays instead, stop and enable PHP on the host.
6. Publish a GitHub release whose tagged commit includes the updated `.github/workflows/release-firmware.yml`. Wait for **Release firmware** to finish, then refresh this page. The first board-list load may take longer while DreamHost downloads the complete release ZIP from GitHub.

No Node server, database, cron job, build step, GitHub token, or DreamHost credential is required by the deployed folder. The site uses a PHP bridge because browser downloads directly from GitHub release assets cannot reliably be fetched across origins. PHP caches GitHub responses and the release ZIP for **five minutes** in the server's temporary directory, outside the web folder. The web-server account needs write permission there. GitHub's unauthenticated API limits apply; a busy shared server can hit them. The page reports this and asks the visitor to retry later.

The default repository is set in `config.php`. If you fork Form8, change it there and update the GitHub links in `index.html` and `app.js`.

## Which RAK4631 firmware should I install?

Double-press **Reset**, open the **RAK4631** USB drive, and read the **SoftDevice** line in `INFO_UF2.TXT`. Match that line—not the bootloader version number:

| `INFO_UF2.TXT` says | Choose in the flasher | Firmware file |
|---|---|---|
| **S140 6.1.1** | **RAK4631 / WisBlock — stock S140 6.1.1** | `form8-rak4631-s140-6-1-1.uf2` |
| **S140 7.3.0** | **RAK4631 / WisBlock — S140 7.3.0** | `form8-rak4631.uf2` |

A stock RAK bootloader such as **0.4.2** can report **S140 6.1.1**; use the 6.1.1 build in that case. You do not need to change the bootloader or SoftDevice to use that build. Other current nRF build profiles require S140 7.3.0. If the installed version is different or unknown, identify it before choosing an image.

The files contain the application only. If the matching option is missing from the flasher, choose a release that includes that file; older releases may only contain the 7.3.0 RAK build. Enable **Show prereleases** if needed. After copying the UF2, the USB drive disappearing is normal: the board restarts into Form8. Scan for **Form8-…** in the Android app.

## Download nRF52840 firmware

The same board selector offers the supported nRF board and SoftDevice profiles from GitHub releases. These boards download files instead of using the ESP32 browser installer. A modern phone or desktop browser over HTTPS works; Web Serial is not required for downloads.

1. Choose the release and exact nRF board. Enable **Show prereleases** if needed. Read the installed **S140 SoftDevice version** from `INFO_UF2.TXT`, or the board’s programming tools when it has no USB drive, and select it in **Installed SoftDevice**. The website cannot read it automatically. An unchecked, unknown, or mismatched version blocks the download.
2. Choose **UF2** for a compatible USB bootloader, or **HEX** for board-specific programming tools.
3. Confirm the board, click **Download & verify firmware file**, then **Save form8-BOARD.uf2** (or `.hex`). File size, SHA-256, nRF52840 image format, application start address, and reserved-memory checks must pass before the save link appears.
4. Before installation, confirm the correct board bootloader and **matching Nordic S140 version are already installed**. RAK4631 boards with stock S140 6.1.1 need the `rak4631-s140-6-1-1` build; the other builds require S140 7.3.0. These application images do not install either prerequisite. For UF2, enter the board’s bootloader (often RESET twice), check `INFO_UF2.TXT`, and copy the matching UF2 to its drive. For HEX, follow the board’s programming instructions and preserve the required SoftDevice and bootloader. No filesystem upload is needed.
5. Download `form8-release.zip` from the same release, extract it, and install `android/form8-android-debug.apk`, then use **Settings → Radio connection → Bluetooth or USB serial**. nRF boards have no Wi-Fi hotspot; the Android app provides the interface and message storage.

**T1000-E:** its stock magnetic cable is not a general USB data connection. A UF2 download does not make the board appear as a USB drive. Use the board-specific vendor or SWD programming procedure. Read the [nRF52 and Android guide](https://github.com/pdxlocations/form8/wiki/nRF52-and-Android) before installing. All nRF targets remain experimental and need hardware testing.

Only releases containing **`form8-release.zip`** are listed. Firmware comes from its `esp32/` and `nrf52/` folders; old loose-file releases are intentionally unsupported. The site reads each file’s uncompressed size from the ZIP and its SHA-256 from the bundled manifest/checksums. It lists only recognized nRF profiles with complete UF2 downloads and explicit SoftDevice metadata. Changing the board or release requires a fresh SoftDevice check; changing that check clears any prepared download and board confirmation.

## Prepare maps without a radio

After uploading this folder, open **https://form8.pdxlocs.com/maps.html**, or follow **Open the offline map downloader** from the installer. It works in a modern phone or desktop browser and does not require Web Serial, a radio connection, PHP requests, or GitHub releases. HTTPS is required for optional phone/browser location access; entering coordinates works without that permission.

1. Stay connected to internet Wi-Fi or cellular data.
2. Use **Use my location** or enter latitude/longitude and click **Go to coordinates**. The default example is Portland (`45.52`, `-122.68`).
3. Zoom and move the map so the required area fits. Choose **Offline detail**.
4. Click **Download visible area** and wait for **Ready offline**.
5. Click **Export map** and save `form8-offline-map.json` in Files/Downloads. If preparing on a laptop for a phone, transfer this file to the phone.
6. Connect the field device to the radio’s Wi-Fi, open `http://192.168.4.1`, then **Map → Offline maps → Import saved map** and select the file. The radio must run firmware with map support.

The downloader uses USGS topo tiles with U.S. coverage and the same 400-tile / 32 MB limits as the radio app. Tiles are fetched directly from the USGS HTTPS service; they do not pass through DreamHost or the radio. **Browser storage is separate for this website and the radio's address. Export/import is required even on the same phone.** The exported file contains tiles and the chosen map view; it does not contain station positions. The page supports resuming partial downloads, canceling, importing older map files, removing saved tiles, and light/dark appearance.

Upload `maps.html`, `maps.js`, `maps.css`, and the entire **`map-assets/`** subfolder alongside the installer files. The checked-in `map-assets` are copies of the radio app's map code so uploads need no build step. After changing shared map code, run **`npm run webflasher:prepare`** before uploading; `npm test` checks that these copies match. Do not edit generated map assets directly. The same preparation command copies `config/nrf52-targets.json` to the uploadable board catalog; run it when adding nRF targets.

## How a visitor installs on ESP32

1. Connect the radio with a USB **data** cable. Close serial monitors. Use desktop Chrome or Edge.
2. Select a release and the exact board/radio variant. Prereleases are hidden until **Show prereleases** is checked. Experimental builds are labeled.
3. Select **Update an existing Form8 radio** for an existing installation using the same board and partition layout. Select **First installation / start fresh** for an empty radio or to replace its data.
4. Confirm the board. For a first installation, also confirm data replacement.
5. Click **Download & verify firmware**. The page checks both the file size and SHA-256 hash against the release manifest. A failed check prevents the install button from appearing.
6. Click **Connect USB & install**, select the USB port, and use the installer dialog. **For updates, leave “Erase device” unchecked.** First-install images replace storage regardless of that checkbox. Do not disconnect USB during flashing.
7. After the board restarts, read the hotspot name/password from its OLED. For headless boards, use the installer's **Logs & Console** at 115200 baud and send `wifi`. Join the hotspot and open `http://192.168.4.1`.

The USB tool verifies the selected ESP32 or ESP32-S3 chip family; it **cannot identify the board model, radio chip, or Heltec front-end revision**. Visitors must choose these correctly. Physical flashing, board operation, and data preservation still need verification on hardware.

## What comes from GitHub?

The bridge reads the **20 most recent published releases**, including prereleases, and offers those containing **`form8-release.zip`**. Each release publishes only that ZIP and `form8-release.zip.sha256`. Inside are `esp32/`, `nrf52/`, `android/`, and `webflasher/`. Loose firmware assets and separate platform ZIPs are no longer uploaded.

When a visitor selects a release, DreamHost downloads and caches the complete ZIP for **five minutes**, then reads its firmware catalog directly. It serves only exact firmware and metadata paths in `esp32/` and `nrf52/`; it does not extract files onto the host. Archives are limited to **64 MiB** and **512 entries**, firmware to **20 MiB** per file, and manifest/checksum files to **1 MiB**. SHA-256, image-size, and nRF SoftDevice/address checks still run in the browser before installation/download. The archive checksum is also available for manual verification of the complete release download.

The release workflow runs:

```sh
python3 tools/build_firmware.py --webflasher
```

For each target it builds:

- `form8-TARGET.bin`: app-only update at `0x10000`.
- `form8-TARGET-factory.bin`: bootloader, partition table, OTA initialization, app, and initialized LittleFS, merged at offset `0`. **Replaces saved data.** Flash mode/frequency/size and boot inputs come from that board's actual PlatformIO environment.

The release ZIP’s `esp32/` folder includes the manifest, checksums, and both kinds of image. Factory downloads are larger because they span the board's storage layout. No firmware gets sent from the website to the radio without the visitor choosing a USB port and confirming installation.

The bridge does not accept arbitrary URLs, repository names, local paths, or uploads. It selects the configured repository’s release ZIP, checks exact whitelisted member paths, and reads individual files without extracting them. Errors are reported without exposing PHP stack traces. The browser renders release/board labels as text, and firmware is checked before the USB installer is enabled.

## Local preview and checks

From the project root:

```sh
php -S 127.0.0.1:8849 -t webflasher
# Open http://127.0.0.1:8849

node --test tests/webflasher.test.mjs
php -l webflasher/api.php
php -l webflasher/config.php
php tests/webflasher-api.php
```

Localhost supports Web Serial without a certificate. Real hosting must use HTTPS. The preview still needs internet access to GitHub and the pinned ESP Web Tools module. The page uses system fonts. ESP Web Tools is loaded only after the firmware passes verification; its USB installer code comes from unpkg at version **10.4.0**.

## Troubleshooting

- **No releases:** publish a release, not just a tag, and wait for the firmware workflow. Confirm the repository is public and the tagged commit contains the workflow and packaging changes. Allow up to five minutes for the cache to refresh.
- **Old versions missing:** this flasher only supports `form8-release.zip` bundles. Publish a new release using the updated workflow.
- **ZIP extension error:** enable PHP’s ZIP/ZipArchive extension. Check `php -m` on the server or ask the host to enable it.
- **No first-install image:** publish a release with `--webflasher` packaging.
- **No USB button:** use HTTPS and a browser supporting Web Serial; Safari and iOS can download nRF files but cannot use the ESP32 USB installer. Download and verification must finish first.
- **Failed to connect:** try another data cable/port. Hold BOOT, press/release RESET, release BOOT, then select the bootloader USB port. Some USB bridges require a driver.
- **Checksum or size error:** nothing is flashed. Wait for release uploads to finish, allow the cache to expire, and retry. Do not bypass the check.
- **GitHub rate limit:** wait a few minutes. Shared-host IPs can share unauthenticated API limits; the five-minute cache reduces requests.
- **PHP/network error:** check the DreamHost PHP error log, enabled cURL/JSON/ZIP, temporary-directory permissions, and outbound HTTPS access. Do not disable TLS verification.

## References

- [ESP Web Tools: manifests, USB flashing, HTTPS, and erase behavior](https://esphome.github.io/esp-web-tools/)
- [GitHub releases API](https://docs.github.com/en/rest/releases/releases#list-releases)
