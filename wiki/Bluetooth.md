# Connect the Android app over Bluetooth

Both ESP32 and nRF52840 radios can connect to the Android companion using Bluetooth Low Energy (BLE). The phone scans; the node advertises a Form8 service. This is BLE, not Bluetooth Classic or Meshtastic's service.

## ESP32: Bluetooth with automatic Wi-Fi handoff

Update **both the ESP32 firmware and Android APK** to a version containing this feature. An app update alone cannot make an older Wi-Fi-only node advertise Bluetooth.

1. Install the matching ESP32 **app update** and `form8-android-debug.apk` from the [release assets](https://github.com/pdxlocations/form8/releases). Existing incident storage is preserved by an app-only firmware update; do not choose a factory image or upload a filesystem image over saved messages.
2. Turn on the node. It starts its Wi-Fi hotspot and advertises Bluetooth as **`Form8-xxxx`**. The four-character suffix matches its Wi-Fi hotspot name, **`form8-xxxx`**.
3. In Android Form8, open **Settings → Radio connection**, choose **Bluetooth (ESP32 / nRF52)**, and tap **Find radios**.
4. Allow Nearby devices permission. Android 11 and earlier also need Location permission and Location enabled for BLE discovery.
5. Select your node and tap **Connect**. Android may open a pairing prompt. Enter the **last six digits of the node's eight-digit Wi-Fi password**, including leading zeros. For example, Wi-Fi password `99001234` gives pairing PIN **`001234`**. Read the password on the node's OLED or send `wifi` through its USB serial console at 115200 baud.
6. After authenticated pairing succeeds, the ESP32 turns its hotspot **off**. Any phone/laptop connected to that hotspot disconnects. The app then accesses the radio over BLE; it does not need to join the hotspot.
7. Use the same incident, forms, chat, map, and settings screens. **ESP32 still stores forms, chat, receipt metadata, and radio configuration on the node.** Drafts, archives, and downloaded maps stay on the phone. Switching between Wi-Fi and Bluetooth does not create another radio message store.
8. Tap **Disconnect** when finished. The node restores the **same Wi-Fi hotspot name and password**. A browser can reconnect to it at `http://192.168.4.1`. The phone may require you to select that hotspot again in Android Wi-Fi settings.

Previously paired phones normally reconnect without entering the PIN again. If pairing fails after an erase or credential change, remove/forget the node in Android Bluetooth settings, scan again, and pair with its current PIN.

The node allows **one Bluetooth connection**. It restores Wi-Fi if the connection drops. An authenticated link with no incoming requests for **30 seconds** is disconnected; an unfinished pairing has a **60-second** limit. Keep the app visible for reliable interaction. If Android suspends the app while locked/in the background, Bluetooth can time out and the hotspot returns. LoRa receiving, durable radio storage, delivery retries, and relaying continue independently on ESP32.

Bluetooth commands require an encrypted, authenticated pairing. Pairing does not encrypt LoRa traffic: **LoRa messages remain plaintext and unauthenticated**.

## Why discovery works while Wi-Fi is available

ESP32 Wi-Fi and Bluetooth share the 2.4 GHz RF hardware. They take turns using it; they do not transmit at the exact same instant. The firmware advertises BLE while the hotspot is available, then uses the handoff above to keep active app traffic on one client transport. Pairing briefly uses coexistence before the hotspot is suspended. Espressif documents this [coexistence mechanism](https://docs.espressif.com/projects/esp-idf/en/stable/esp32s3/api-guides/coexist.html), including limitations when hotspot clients and BLE are active together.

This behavior needs physical verification on the supported boards and Android versions. Build checks and automated tests do not establish real RF reliability or successful pairing on a particular phone.

## nRF52840

Follow [nRF52 and Android](https://github.com/pdxlocations/form8/wiki/nRF52-and-Android). Those nodes have no Wi-Fi hotspot to switch off. The existing Nordic UART link does not require the ESP32 PIN; the companion stores their bodies and must remain open for durable receiving/ACKs. USB CDC serial remains available on supported nRF boards.

## Troubleshooting

- **No node found:** install Bluetooth-enabled firmware, turn on Bluetooth, allow Nearby devices permission, move closer, and scan again. On older Android, enable Location. A node already connected to another Bluetooth client is not available for a second connection.
- **Hotspot disappears:** this is expected after successful ESP32 pairing. Disconnect Bluetooth to restore Wi-Fi.
- **PIN rejected:** use the last six digits of the current Wi-Fi password, including zeros. Forget a stale Android bond if firmware/storage was erased.
- **`station.peers is not iterable`, then Wi-Fi returns:** install the current Android APK over the existing Form8 app and reconnect. This error comes from the companion-storage path receiving an ESP32 handshake instead of nRF status. The updated app selects the ESP32 radio API before allowing polling, rejects unsupported handshakes clearly, and ignores incomplete old cached status without deleting saved records. You do not need to clear app data.
- **Very short unexpected disconnect:** the firmware fixes a callback/main-loop idle-timer race that could treat a fresh BLE write as an expired session. Serial logs now distinguish a session timeout, input overflow, and failed authentication; the Android connection status preserves the GATT status code. The normal 30-second idle timeout and 60-second pairing timeout remain unchanged.
- **App connects but data does not load:** use the matching updated APK and firmware. ESP32 uses the radio API over BLE; older app versions only understand companion-owned nRF storage.
- **Lost app connection:** the node returns to Wi-Fi after disconnect/idle timeout. Open Form8 and tap Connect again, or join the restored hotspot in a browser.
- **Filesystem upload needed?** No. Bluetooth support and the updated webpage are embedded in the ESP32 application image. Preserve existing storage with an ordinary app-only update.

## Unknown operation or Bluetooth write timeouts

The Android app cancels queued requests when the Bluetooth connection changes. This prevents commands left over from another radio connection from being sent to the new node. It also waits for both a radio response and Android’s final GATT write callback before starting the next request, because the response notification can arrive first.

Install the updated APK over the existing app; these app fixes do not require erasing app data or reflashing the radio. In Settings → Radio connection, check **Android app build** to identify the installed package. The download also has a filename containing that build identifier. Errors now include the request, for example `Radio http GET /api/status: Unknown operation`, rather than only `Unknown operation`. If that specific error persists with updated firmware and app, retain the complete error text for diagnosis.
