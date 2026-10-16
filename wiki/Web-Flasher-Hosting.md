# Form8 web flasher

Upload this folder to a PHP-enabled DreamHost website. It offers published builds from **pdxlocations/form8** automatically; you do not upload new firmware to DreamHost for each release.

## Upload to DreamHost

1. Enable a currently supported **PHP 8.1 or newer** version for your domain. PHP's cURL and JSON extensions must be available, and the host must allow outgoing HTTPS to GitHub.
2. Enable HTTPS for the domain and wait for its certificate to become active. Browser USB flashing requires HTTPS (localhost also works for development).
3. Upload the **contents** of the `webflasher` folder into the DreamHost web directory configured for `form8.pdxlocs.com` using SFTP, for example `/home/YOUR_USER/form8.pdxlocs.com/`. Put `index.html`, `api.php`, and the other files directly in that directory.
4. Open **https://form8.pdxlocs.com/** in desktop Chrome or Edge. Do not open `index.html` as a local file.
5. Check `https://form8.pdxlocs.com/api.php?resource=releases`. It should return JSON with the repository and release list. If PHP source downloads or displays instead, stop and enable PHP on the host.
6. Publish a GitHub release whose tagged commit includes the updated `.github/workflows/release-firmware.yml`. Wait for **Release firmware** to finish, then refresh this page. The first download may take longer while DreamHost fetches it from GitHub.

No Node server, database, cron job, build step, GitHub token, or DreamHost credential is required by the deployed folder. The site uses a PHP bridge because browser downloads directly from GitHub release assets cannot reliably be fetched across origins. PHP caches GitHub responses and images for **five minutes** in the server's temporary directory, outside the web folder. The web-server account needs write permission there. GitHub's unauthenticated API limits apply; a busy shared server can hit them. The page reports this and asks the visitor to retry later.

The default repository is set in `config.php`. If you fork Form8, change it there and update the GitHub links in `index.html` and `app.js`.

## How a visitor installs

1. Connect the radio with a USB **data** cable. Close serial monitors. Use desktop Chrome or Edge.
2. Select a release and the exact board/radio variant. Prereleases are hidden until **Show prereleases** is checked. Experimental builds are labeled.
3. Select **Update an existing Form8 radio** for an existing installation using the same board and partition layout. Select **First installation / start fresh** for an empty radio or to replace its data.
4. Confirm the board. For a first installation, also confirm data replacement.
5. Click **Download & verify firmware**. The page checks both the file size and SHA-256 hash against the release manifest. A failed check prevents the install button from appearing.
6. Click **Connect USB & install**, select the USB port, and use the installer dialog. **For updates, leave “Erase device” unchecked.** First-install images replace storage regardless of that checkbox. Do not disconnect USB during flashing.
7. After the board restarts, read the hotspot name/password from its OLED. For headless boards, use the installer's **Logs & Console** at 115200 baud and send `wifi`. Join the hotspot and open `http://192.168.4.1`.

The USB tool verifies the ESP32-S3 chip family; it **cannot identify the board model, radio chip, or Heltec front-end revision**. Visitors must choose these correctly. Physical flashing, board operation, and data preservation still need verification on hardware.

## What comes from GitHub?

The bridge reads the **20 most recent published releases**, including prereleases, then serves only their `manifest.json` and `form8-*.bin` assets. Releases without a manifest are hidden until the build finishes. Old app-only releases can offer updates; first installation is available only when a matching factory image and its metadata exist.

The release workflow runs:

```sh
python3 tools/build_firmware.py --webflasher
```

For each target it builds:

- `form8-TARGET.bin`: app-only update at `0x10000`.
- `form8-TARGET-factory.bin`: bootloader, partition table, OTA initialization, app, and initialized LittleFS, merged at offset `0`. **Replaces saved data.** Flash mode/frequency/size and boot inputs come from that board's actual PlatformIO environment.

The release also includes the manifest, checksums, and ZIP containing both kinds of image. Factory downloads are larger because they span the board's storage layout. No firmware gets sent from the website to the radio without the visitor choosing a USB port and confirming installation.

The bridge does not accept arbitrary URLs, repository names, local paths, or uploads. It looks up the requested file in the configured repository's release assets. Errors are reported without exposing PHP stack traces. The browser renders release/board labels as text, and firmware is checked before the USB installer is enabled.

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
- **No first-install image:** older releases contain only app updates. Publish a release with `--webflasher` packaging.
- **No USB button:** use HTTPS and a browser supporting Web Serial; Safari and iOS are not supported by this installer. Download and verification must finish first.
- **Failed to connect:** try another data cable/port. Hold BOOT, press/release RESET, release BOOT, then select the bootloader USB port. Some USB bridges require a driver.
- **Checksum or size error:** nothing is flashed. Wait for release uploads to finish, allow the cache to expire, and retry. Do not bypass the check.
- **GitHub rate limit:** wait a few minutes. Shared-host IPs can share unauthenticated API limits; the five-minute cache reduces requests.
- **PHP/network error:** check the DreamHost PHP error log, enabled cURL/JSON, temporary-directory permissions, and outbound HTTPS access. Do not disable TLS verification.

## References

- [ESP Web Tools: manifests, USB flashing, HTTPS, and erase behavior](https://esphome.github.io/esp-web-tools/)
- [GitHub releases API](https://docs.github.com/en/rest/releases/releases#list-releases)
