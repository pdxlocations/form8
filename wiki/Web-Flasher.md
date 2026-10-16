# Install or update with the web flasher

Open **[form8.pdxlocs.com](https://form8.pdxlocs.com)** on a computer using Chrome or Edge. The installer automatically offers published firmware builds from GitHub. You need internet access for the download and a USB **data** cable to connect the radio.

1. Connect the radio by USB and close any serial monitor using it.
2. Choose a firmware version and your exact board/radio variant. For Heltec V4, check whether you have V4.2 or V4.3; for T3-S3, check the radio chip.
3. Choose the installation type:
   - **Update an existing Form8 radio** for the same board and storage layout. Leave **Erase device** unchecked in the installer to preserve saved forms and settings.
   - **First installation / start fresh** for an empty radio or to replace its data. This includes initialized storage and **replaces saved messages, incidents, and settings**.
4. Confirm the board selection and, for a first installation, confirm data replacement.
5. Click **Download & verify firmware**. Wait for the checksum check to finish.
6. Click **Connect USB & install**, select the radio's USB port, and follow the installer dialog. Keep USB connected until it finishes.
7. After the radio restarts, read its Wi-Fi name and password from the OLED. For a headless board, open **Logs & Console** at 115200 baud and send `wifi`.
8. [Connect your phone or laptop](https://github.com/pdxlocations/form8/wiki/Connect-to-a-Radio) to the radio's hotspot and open `http://192.168.4.1`.

If the radio does not appear, try another data cable or USB port. If needed, hold BOOT, press and release RESET, then release BOOT and select the bootloader's USB port. If no builds appear, wait for the GitHub release workflow to finish and click **Refresh releases**; cached release data can take up to five minutes to update.

The website detects the ESP32-S3 processor, but cannot identify your board model or radio chip for you. See the [board guide](https://github.com/pdxlocations/form8/wiki/Board-Guide) if you are unsure which build to select.

To host the installer at `form8.pdxlocs.com`, upload the **contents** of this project's `webflasher/` folder to that subdomain's DreamHost web directory, with PHP 8.1+ and HTTPS enabled. See the [web flasher hosting instructions](https://github.com/pdxlocations/form8/wiki/Web-Flasher-Hosting) for the complete setup and troubleshooting steps. New GitHub releases appear automatically; firmware files do not need to be uploaded to DreamHost.

## Download maps before joining the radio’s Wi-Fi

Use the installer’s **Open the offline map downloader** link, or open **[form8.pdxlocs.com/maps.html](https://form8.pdxlocs.com/maps.html)** after the updated webflasher folder is uploaded. Choose an area, download its tiles, and **Export map** while you have internet. After connecting to the radio, use **Map → Offline maps → Import saved map** to select that JSON file. No radio or USB connection is needed to prepare maps. See [the complete map instructions](Map-and-Location).
