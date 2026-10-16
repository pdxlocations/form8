# Companion build notes

The checked-in wrappers reuse `web/`; no cloud service is required after installation. Desktop uses a loopback API proxy. Mobile uses Capacitor native HTTP to contact `http://192.168.4.1`, and native geolocation only after an operator chooses to attach it. Platform installation, signing and permission flows still require device verification.

## Android

After `npx cap add android`, configure the generated Android project to allow local cleartext HTTP and location access. The Capacitor config sets `server.cleartext: true`; verify the generated manifest/network policy permits `192.168.4.1` without enabling a remote debug server.

Add `android.permission.ACCESS_COARSE_LOCATION` and `android.permission.ACCESS_FINE_LOCATION` to the manifest for optional location attachment. The app must work when location permission is denied. Native geolocation requests permission when invoked. Local-network permissions may also be required by the target Android SDK/device version; test the selected SDK before release.

## iOS

After `npx cap add ios`, add meaningful `NSLocationWhenInUseUsageDescription` and the plugin-required location usage descriptions to `Info.plist`, explaining optional incident coordinate attachment. Add `NSLocalNetworkUsageDescription`, explaining connection to the operator's radio hotspot. Configure ATS for local HTTP radio access; validate the smallest exception that works for the deployment's iOS versions. Do not configure a remote app-shell URL: the interface must remain bundled and open without the radio.

## Desktop

The wrapper binds only to `127.0.0.1`, denies unexpected Host headers, keeps Node integration disabled in the renderer, and proxies only `/api/` to the fixed radio address. The development simulator uses the same port; run one at a time. Test packaging on each target OS, including offline restart and archive file downloads.

## Release checks still needed

Confirm fresh installation, denied permissions, offline app restart, reconnect after switching Wi-Fi, a draft retained across process termination, verified archive retained across restart, export/import/share, client token retry after a dropped HTTP response, and simultaneous clients on one radio. No signed installers or mobile binaries have been produced by this project yet.
