# Publishing firmware releases

## Create a beta with an automatic commit suffix

1. Commit and push your changes, including this workflow on the default branch.
2. Open **Actions → Release firmware → Run workflow** on GitHub.
3. Choose the branch to release, then enter a version such as **`0.2.0`**. Use three numbers only: no `v`, commit suffix, or `beta` text.
4. Click **Run workflow**. The selected commit's first seven hex characters are appended automatically: tag `v0.2.0.54e0d8d-beta`, title **Form8 Firmware 0.2.0.54e0d8d Beta**.
5. Wait for the run to finish. All configured targets' update/factory images and checksums are built before a draft is created. The files are uploaded before that draft is published as a prerelease. On the web flasher, select **Show prereleases**; its cache may take five minutes to refresh.

The workflow creates a lightweight tag pointing to the exact checked-out commit. It will not reuse a tag pointing elsewhere or overwrite an already-published beta. Failed builds publish nothing. Upload/publishing failures leave a draft that **Re-run failed jobs** can resume. The repository's built-in token handles tag creation, assets, and publishing; no additional secret is needed.

The manual run builds and publishes in the same workflow because [events created by `GITHUB_TOKEN` do not start another release workflow](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow#triggering-a-workflow-from-a-workflow). It does not depend on its new prerelease triggering the release-event build again.

## Build a release created through the Releases page

1. Commit and push the firmware changes, target catalog, and `.github/workflows/release-firmware.yml` before creating the version tag. The workflow must be present in the tagged commit.
2. On GitHub, open **Releases → Draft a new release**.
3. Choose or create a version tag, for example `v0.2.0`, pointing to the commit you want to release. Add the release title and notes.
4. Click **Publish release**. Publishing a prerelease also starts the build; saving a draft or pushing a tag alone does not.
5. Open **Actions → Release firmware** to watch the build. After all targets build and their checksums pass, the workflow attaches each board's app-only and first-install `.bin` files, `form8-esp32-firmware.zip`, `SHA256SUMS`, `manifest.json`, and `README.txt` to that release. The web flasher discovers these assets automatically.

The workflow uses GitHub's [published release event](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#release) and the repository's built-in `GITHUB_TOKEN` with `contents: write`; no extra secret is needed. It builds the release tag rather than the latest branch commit. The target catalog in `config/firmware-targets.json` must contain every environment in `platformio.ini`, exactly once; the workflow checks this before compiling.

If a release-event build fails, check the Actions log. No upload step runs until every build and checksum check passes. After resolving the problem, publish a new version tag. For a temporary download/upload failure, use **Re-run failed jobs** on the existing run; matching asset names are replaced on a rerun. Firmware compilation does not establish hardware validation, and the T-Beam BPF remains experimental.

## Android and nRF assets

The workflow also builds all nine environments in `platformio-nrf52.ini` and packages `form8-nrf52-firmware.zip`, individual application-only UF2/HEX files, and `SHA256SUMS-NRF52`. It builds and lints `form8-android-debug.apk`, then attaches it with its checksum. All builds finish before a manually triggered draft beta is created/published. The Android APK uses the checked-in public development key so development updates can preserve data; production signing is a separate process.

The ESP32 web flasher continues to offer ESP32 images. Install nRF images and the APK using the [nRF52 / Android guide](https://github.com/pdxlocations/form8/wiki/nRF52-and-Android).
