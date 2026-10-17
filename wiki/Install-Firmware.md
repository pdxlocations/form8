# Install firmware for the first time

**Using an nRF52840 board?** Follow [nRF52 and Android setup](https://github.com/pdxlocations/form8/wiki/nRF52-and-Android) instead. The instructions below apply to ESP32.

Published GitHub releases include binaries for all configured targets, a ZIP bundle, `SHA256SUMS`, and a board manifest. See [release builds and board selection](https://github.com/pdxlocations/form8/wiki/Releases). Regular binaries are app-only updates; separate `-factory.bin` images support first installation and replace saved data.

For installation in your browser, use the [web flasher instructions above](https://github.com/pdxlocations/form8/wiki/Web-Flasher). The steps below use PlatformIO instead.

These steps are for an **empty Heltec V3**, with no Form8 messages you need to keep.

1. Install PlatformIO Core.
2. Connect the radio to your computer using a USB data cable. Attach its antenna before enabling transmission.
3. Open a terminal in this project's folder.
4. Build the firmware:

   ```sh
   pio run -e heltec-v3
   ```

5. Upload the firmware:

   ```sh
   pio run -e heltec-v3 -t upload
   ```

6. Set up the radio's file storage **once, on the empty radio**:

   ```sh
   pio run -e heltec-v3 -t uploadfs
   ```

7. Wait for the radio to restart. Its screen shows its Wi-Fi name, password, and web address when no phones or laptops are connected.
8. Repeat for the second radio.

**`uploadfs` replaces the radio's file storage and erases stored forms.** For later updates, use [Update an existing radio](https://github.com/pdxlocations/form8/wiki/Update-Firmware). The webpage is bundled in the firmware; updating it does not require `uploadfs`.

If you need to see startup messages, run:

```sh
pio device monitor -b 115200
```
