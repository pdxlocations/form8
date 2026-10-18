# Install or update with the web flasher

Open **[form8.pdxlocs.com](https://form8.pdxlocs.com)**. For ESP32 USB installation, use a computer with Chrome or Edge; nRF file downloads also work in other modern browsers. The installer automatically offers published firmware builds from GitHub. You need internet access for the download and a USB **data** cable to connect the radio.

1. Connect the radio by USB and close any serial monitor using it.
2. Choose a firmware version and your exact board/radio variant. For Heltec V4, check whether you have V4.2 or V4.3; for T3-S3 or T-Beam, check the radio chip; for original T-LoRa, check the PCB revision.
3. Choose the installation type:
   - **Update an existing Form8 radio** for the same board and storage layout. Leave **Erase device** unchecked in the installer to preserve saved forms and settings.
   - **First installation / start fresh** for an empty radio or to replace its data. This includes initialized storage and **replaces saved messages, incidents, and settings**.
4. Confirm the board selection and, for a first installation, confirm data replacement.
5. Click **Download & verify firmware**. Wait for the checksum check to finish.
6. Click **Connect USB & install**, select the radio's USB port, and follow the installer dialog. Keep USB connected until it finishes.
7. After the radio restarts, read its Wi-Fi name and password from the OLED. For a headless board, open **Logs & Console** at 115200 baud and send `wifi`.
8. [Connect your phone or laptop](https://github.com/pdxlocations/form8/wiki/Connect-to-a-Radio) to the radio's hotspot and open `http://192.168.4.1`.

If the radio does not appear, try another data cable or USB port. If needed, hold BOOT, press and release RESET, then release BOOT and select the bootloader's USB port. If no builds appear, wait for the GitHub release workflow to finish and click **Refresh releases**; cached release data can take up to five minutes to update.

The website checks the selected ESP32 or ESP32-S3 processor family, but cannot identify your board model or radio chip for you. See the [board guide](https://github.com/pdxlocations/form8/wiki/Board-Guide) if you are unsure which build to select.

To host the installer at `form8.pdxlocs.com`, upload the **contents** of this project's `webflasher/` folder to that subdomain's DreamHost web directory, with PHP 8.1+ and HTTPS enabled. See the [web flasher hosting instructions](https://github.com/pdxlocations/form8/wiki/Web-Flasher-Hosting) for the complete setup and troubleshooting steps. New GitHub releases appear automatically; firmware files do not need to be uploaded to DreamHost.

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
5. Download and install **`form8-android-debug.apk`** directly from the same release, then use **Settings → Radio connection → Bluetooth or USB serial**. nRF boards have no Wi-Fi hotspot; the Android app provides the interface and message storage.

**T1000-E:** its stock magnetic cable is not a general USB data connection. A UF2 download does not make the board appear as a USB drive. Use the board-specific vendor or SWD programming procedure. Read the [nRF52 and Android guide](https://github.com/pdxlocations/form8/wiki/nRF52-and-Android) before installing. All nRF targets remain experimental and need hardware testing.

The updated flasher lists only releases containing `form8-release.zip`. It reads ESP32 firmware from `esp32/` and nRF firmware/checksums from `nrf52/` inside that ZIP. Old releases with only loose firmware assets are intentionally hidden. The first board-list load can take longer while the host caches the release bundle. Size, checksum, nRF application-address, and SoftDevice checks still apply.

## Download maps before joining the radio’s Wi-Fi

Use the installer’s **Open the offline map downloader** link, or open **[form8.pdxlocs.com/maps.html](https://form8.pdxlocs.com/maps.html)** after the updated webflasher folder is uploaded. Choose an area, download its tiles, and **Export map** while you have internet. After connecting to the radio, use **Map → Offline maps → Import saved map** to select that JSON file. No radio or USB connection is needed to prepare maps. See [the complete map instructions](Map-and-Location).
