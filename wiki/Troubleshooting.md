# Troubleshooting

## The other radio does not see my incident or message

Check in this order:

1. Confirm both radios run Form8 firmware, rather than the simulator or another mesh protocol.
2. Under **Radio setup**, compare the actual frequency, bandwidth, spreading factor, coding rate, and backup selection on both radios.
3. Confirm each has a saved callsign, **Enable radio transmission** checked.
4. Compare the full **Incident ID** in both headers. Matching incident names are not enough.
5. On the advertising radio, click **Incidents → Announce incident**; on the receiving device, click **Refresh data**. Announcements occur at startup, manually, or when a new/restarted/90-minute-returning node is heard. There is no periodic announcement; discovery responses are delayed 1–5 seconds and rate-limited to one per 30 seconds. Joining an incident or changing radio settings does not itself announce it. Packet relaying defaults to off: enable **Radio setup → Enable packet relaying** on any intermediate node needed to reach the destination.
6. Check **nodes heard** versus **nearby incident nodes**. A heard node may be using another incident.
7. Under **Radio setup**, watch the receive/transmit counters while sending a short test message. **TX frames** counts completed transmissions; **RX packets** counts successfully read packets; **Valid frames** counts packets recognized by this protocol. The counters restart when the radio reboots.
8. If there is still no reception, check the antennas, power, and physical radio path. A passing software test does not establish that a radio link works.

The firmware fixes an earlier idle-loop problem that could interrupt reception by repeatedly restarting it. Update both radios with the current firmware using a firmware-only upload.

## I see an old incident after flashing

Firmware and filesystem uploads do not necessarily erase the separately saved active incident selection or radio settings. An old incident in the header can therefore be expected. The firmware restores its list entry if needed. Rejoin the incident you intend to use and compare IDs between radios.

If you uploaded a filesystem image, previously stored message bodies were erased; restoring the incident name does not restore those messages.

## Sending reports a storage or write error

1. Check the storage warning and free space.
2. Archive selected forms and export a backup before removing anything you need.
3. Check USB serial output at 115200 baud for the save error.

Older firmware also had a filename-length problem that could cause write failures despite free space. A current firmware-only upload fixes that issue; replacing the filesystem is not required.

## Location does not fill in

Allow location permission if prompted. If the browser cannot provide a position, enter latitude and longitude manually, or use a companion with its location permissions configured. The app reports denied permission, unavailable location, and timeout errors.

## The page shows old information

Click **Refresh data** on your current tab. It keeps your tab and unsaved edits. If the radio is disconnected, reconnect to its hotspot. After installing updated firmware, close old Form8 browser tabs and reopen the webpage if the interface still looks outdated.

## Sending stays busy

Wait for the save request to finish before trying again. If the form is already in Traffic, check its delivery status there rather than creating another copy. In the simulator, a saved message shows **Simulation**, not a pending radio transmission.

A blocked local draft/database operation times out after ten seconds and keeps the entered form text. Close other Form8 tabs using the same storage, then retry. Do not clear browser/app data without exporting archives and saving anything you need.

## Traffic says recipient pending but the reader has a radio ACK

**Radio ACK · recipient pending** means another station has saved your addressed form, but the destination callsign has not confirmed it yet. The receipt matrix shows which station ACKed. Automatic retries and the outgoing count continue until the addressed station ACKs. For a broadcast, one remote radio ACK clears the overall pending/outgoing state.

## Bluetooth disconnects while reconnecting

Use the current Android APK and matching firmware. The app retries initial **GATT status 133** failures twice with fresh connections. If it still fails, reconnect, or toggle phone Bluetooth and scan again. See [Bluetooth reconnect troubleshooting](Bluetooth#reconnecting-and-gatt-status-133).
