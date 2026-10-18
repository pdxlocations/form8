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
5. Open **Actions → Release firmware** to watch the build. After all targets build and their checksums pass, the workflow attaches `form8-release.zip`, `form8-release.zip.sha256`, `form8-android-debug.apk`, and `form8-android-debug.apk.sha256` to that release. All board files and instructions are inside the platform folders in the ZIP. The web flasher discovers these assets automatically.

The workflow uses GitHub's [published release event](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#release) and the repository's built-in `GITHUB_TOKEN` with `contents: write`; no extra secret is needed. It builds the release tag rather than the latest branch commit. The target catalog in `config/firmware-targets.json` must contain every environment in `platformio.ini`, exactly once; the workflow checks this before compiling.

If a release-event build fails, check the Actions log. No upload step runs until every build and checksum check passes. After resolving the problem, publish a new version tag. For a temporary download/upload failure, use **Re-run failed jobs** on the existing run; matching asset names are replaced on a rerun. Firmware compilation does not establish hardware validation, and the T-Beam BPF remains experimental.

## Android and nRF assets

The workflow also builds all configured environments in `platformio-nrf52.ini` and places their application-only UF2/HEX files and `SHA256SUMS-NRF52` in the release ZIP’s `nrf52/` folder. It builds and lints `form8-android-debug.apk`, then publishes it and its checksum as separate release downloads. The APK is not included in the firmware ZIP. All builds finish before a manually triggered draft beta is created/published. The Android APK uses the checked-in public development key so development updates can preserve data; production signing is a separate process.

The web flasher reads ESP32 and nRF firmware directly from the foldered release ZIP. Install nRF images and the APK using the [nRF52 / Android guide](https://github.com/pdxlocations/form8/wiki/nRF52-and-Android).

## Downloads organized by platform

Download **`form8-release.zip`** from a completed release and extract it. Its folders are:

- **`esp32/`** — ESP32 app-only updates, first-install factory images, manifest, checksums, and installation notes.
- **`nrf52/`** — nRF52840 UF2/HEX files, checksums, and SoftDevice instructions. Check `INFO_UF2.TXT` and choose the matching SoftDevice profile before flashing.
- **`webflasher/`** — the website files to upload to a PHP/HTTPS host, including the offline map downloader.

A root `README.txt` explains the folders; a root `SHA256SUMS` verifies all included files. The same directory layout is available under **Actions → Release firmware → completed run → Artifacts → form8-release**. For local builds, run all firmware and Android builders, then `npm run webflasher:prepare` and `python3 tools/package_release.py`; the organized tree is written to `dist/release/`.

GitHub release pages display assets as a flat list, so each release has four downloads: **`form8-release.zip`**, **`form8-release.zip.sha256`**, **`form8-android-debug.apk`**, and **`form8-android-debug.apk.sha256`**. The APK can be installed without downloading/extracting the firmware ZIP. The ZIP contains only `esp32/`, `nrf52/`, and `webflasher/`, plus package notes and checksums. Android is also available as a separate **form8-android** Actions artifact. The updated web flasher reads those folders from the ZIP; it does not need loose assets. Older loose-file releases are intentionally hidden by this flasher. Upload the new `webflasher/` contents to DreamHost and enable PHP ZIP support before publishing a bundle-only release. Existing published releases are not modified automatically.

## Promote a tested beta to a release

1. Open the existing beta under **Releases** and click its edit/pencil button.
2. Keep its **tag and attached files** unchanged so users receive the build you tested.
3. Remove **Beta** from the release title and update the notes.
4. Uncheck **This is a pre-release**. Choose **Set as latest release** when this should be the default download.
5. Click **Update release**. Allow up to five minutes for the web flasher cache to refresh.

The old tag may still end in `-beta`; GitHub's prerelease setting controls the release classification. Editing an already published release does not run this repository's `release: published` build workflow, so the existing firmware and APK remain in place. If you need a new version tag or changed code, publish a separate release and let it build instead.

See [GitHub's release-editing instructions](https://docs.github.com/en/repositories/releasing-projects-on-github/managing-releases-in-a-repository#editing-a-release).

## Version on the LCD

Before a client connects, supported ESP32 displays show **vX.Y.Z** beside the node ID. The LCD omits the commit suffix and Beta label; use the release title or app build information to identify the exact build. Release builds derive the numeric version from the selected release tag.
