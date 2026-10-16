# Troubleshooting

## The other radio does not see my incident or message

Check in this order:

1. Confirm both radios run Form8 firmware, rather than the simulator or another mesh protocol.
2. Under **Radio setup**, compare the actual frequency, bandwidth, spreading factor, coding rate, and backup selection on both radios.
3. Confirm each has a saved callsign, **Enable radio transmission** checked, and **Pause all radio transmission** unchecked.
4. Compare the full **Incident ID** in both headers. Matching incident names are not enough.
5. Click **Refresh data**. Give periodic announcements time to arrive; routine announcements repeat every 2–2½ minutes when transmission is allowed. A new/restarted node normally prompts an earlier discovery response, subject to a 30-second response cooldown.
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
