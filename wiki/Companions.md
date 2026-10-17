# Companion build notes

The checked-in wrappers reuse `web/`; no cloud service is required after installation. Desktop uses a loopback API proxy. Mobile uses Capacitor native HTTP to contact `http://192.168.4.1`, and native geolocation for automatic position updates when the radio has no fresh onboard fix. Location permission is requested when needed; denied access leaves messaging available. Platform installation, signing and permission flows still require device verification.

## Android

The native Android project is checked in. Build with `npm ci` then `npm run build:android` using JDK 21+ and Android SDK 35. The result is `dist/form8-android-debug.apk`, an installable development app signed with the project's public development key. Release builds attach it automatically. This is not a production/Play Store signing key.

For nRF52840, select **Settings → Radio connection → Bluetooth or USB serial**. The app stores bodies and receipt metadata locally, and only confirms reception after a successful storage transaction. Keep the app in the foreground; there is no background service. Follow the [nRF52 / Android guide](https://github.com/pdxlocations/form8/wiki/nRF52-and-Android) for installation, board targets, storage limits, and reconnect behavior.

For ESP32, select **Wi-Fi (ESP32)** and connect the phone to the radio hotspot at `192.168.4.1`. Native HTTP and cleartext local access are configured in the manifest. Native location requests permission when needed; denied GPS access leaves messaging available. Archive/map export uses Android's document save picker. Physical installation, Bluetooth/USB, GPS, export/import, and reconnect testing remain necessary.

## iOS

After `npx cap add ios`, add meaningful `NSLocationWhenInUseUsageDescription` and the plugin-required location usage descriptions to `Info.plist`, explaining automatic incident position sharing and optional coordinate attachment to forms. Add `NSLocalNetworkUsageDescription`, explaining connection to the operator's radio hotspot. Configure ATS for local HTTP radio access; validate the smallest exception that works for the deployment's iOS versions. Do not configure a remote app-shell URL: the interface must remain bundled and open without the radio.

## Desktop

The wrapper binds only to `127.0.0.1`, denies unexpected Host headers, keeps Node integration disabled in the renderer, and proxies only `/api/` to the fixed radio address. The development simulator uses the same port; run one at a time. Test packaging on each target OS, including offline restart and archive file downloads.

## Release checks still needed

Confirm fresh installation, denied permissions, offline app restart, reconnect after switching Wi-Fi, a draft retained across process termination, verified archive retained across restart, export/import/share, client token retry after a dropped HTTP response, and simultaneous clients on one radio. An Android development APK is built; physical device validation and production signing are still outstanding. iOS and desktop installers are not built by the release workflow.
