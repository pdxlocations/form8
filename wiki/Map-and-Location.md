# Location sharing and offline maps

Form8 can show your station and other stations in the active incident on a map. Positions travel over LoRa; map pictures are downloaded over the internet and saved on your phone or laptop. Map pictures never travel over LoRa.

## Get your position

1. Connect to your radio and open Form8.
2. If the radio has supported onboard GPS, take it outside and wait for a fix. Form8 uses a fresh onboard fix first.
3. If there is no fresh onboard fix, Form8 automatically asks the connected phone or laptop for location access. Allow the request.
4. Open **Map** (folded map icon). Your marker is blue. Other incident stations are orange; old positions are gray. The list below the map shows coordinates, location source, approximate report age, and accuracy when available.
5. Use **My location**, **+**, and **−** to navigate. Tap a station in the list to center it. Enable **Move map** to drag; turn it off to scroll the page normally. With the map focused, keyboard arrows move it and +/− zoom.

The T-Beam BPF target reads its onboard L76K GPS at 9600 baud and enables its AXP2101 ALDO4 GPS power supply. This remains experimental and needs physical-board testing. The original ESP32 T-Beam V1.x targets also read onboard GPS (RX34/TX12, 9600 baud), with automatic AXP192/AXP2101 power detection and GPS rail enable. Other current ESP32 targets have no integrated GPS and use phone/laptop positioning. Supported nRF onboard GPS options are listed in [nRF52 and Android](nRF52-and-Android). GPS expansion modules are not automatically detected.

**Phone GPS in a browser:** most browsers block location access at the radio's plain `http://192.168.4.1` address. Use the mobile companion app (with location permission), or a supported secure/localhost client. Onboard GPS works independently of browser permissions. The app explains when phone GPS is unavailable; **Retry GPS** tries again after you change permissions. A laptop may have no location fix. GPS often needs a clear view of the sky.

A connected, visible client refreshes phone location at most once per minute. A fresh onboard fix takes priority automatically. A radio can keep sending its onboard location after the phone disconnects. A phone-supplied fix becomes too old to transmit after two minutes without updates; background/suspended apps may stop providing updates. Last known positions remain available for up to 30 minutes, then disappear. Report ages are approximate and exclude LoRa transit delays.

## Choose how often to share

1. Open **Radio setup** (gear icon).
2. Under **Position sharing**, leave **Broadcast our position to this incident** checked, or uncheck it to stop sharing your station's position.
3. Set **Position broadcast interval · minutes**. The default is **10 minutes**; choose a whole number from **1 to 1440**.
4. Click **Save settings**. These settings are stored on the radio and survive rebooting.

The first fresh position is queued when transmission is allowed and an incident is active, then once per chosen interval. Starting/joining an incident or saving radio configuration restarts this schedule. There is up to five seconds of random queue delay, plus channel/congestion delay. There are no position ACKs or delivery retries. Lost positions recover with the next report. A full local queue retries after two seconds; a queued position expires after two minutes or when its fix age plus local queue time exceeds two minutes. Only the latest unsent local position is kept.

Position sharing requires a saved callsign, an active incident, **Enable radio transmission** checked. These controls also apply to relays. Position packets are separate from forms/chat and do not add unread or queued-message counts. Unchecking your position sharing stops originating your reports; it does not stop relaying other stations' packets.

Positions are **plaintext and unauthenticated**, just like other Form8 traffic. All participating nodes need updated firmware to receive and relay the new position packet type. The map only lists peer positions in the radio's current incident, not every station that might be reachable. Switching incidents clears buffered traffic from the previous incident.

Forms still attach coordinates only when you choose **Use current location** in the form's Optional location section. That button prefers the radio's fresh onboard fix and otherwise uses phone/laptop location. Manual latitude and longitude remain available.

## Download a map for offline use

The built-in basemap is **USGS Topo**, with detailed coverage for the **United States**. Its [service metadata permits tile exports](https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer?f=pjson). Outside U.S. coverage, station coordinates still work, but this basemap may not provide useful local detail. No external map library or internet connection is needed to draw station markers.

1. While connected to internet Wi-Fi or cellular data, open **[form8.pdxlocs.com/maps.html](https://form8.pdxlocs.com/maps.html)**. The installer also links to this downloader. It is available after the updated `webflasher/` folder has been uploaded to DreamHost; no radio connection is needed.
2. Click **Use my location**, or enter the area's latitude/longitude and click **Go to coordinates**. For Portland, try `45.52`, `-122.68`. Location permission is optional.
3. Move and zoom the map until your area fits on screen. Enable **Move map** to drag; turn it off to scroll the page normally.
4. Choose **Offline detail**: current zoom, one level closer, or two levels closer. Two levels closer is the default. Zoom is capped at 16.
5. Click **Download visible area**. Keep the page open until it says **Ready offline**. Downloads include the visible area at the selected detail and overview levels down to zoom 8 (or the current zoom if lower).
6. Click **Export map** and save `form8-offline-map.json` in Files/Downloads. If preparing on a laptop for a phone, transfer the file to the phone.
7. Connect your phone/laptop to the radio hotspot, open `http://192.168.4.1`, and choose **Map → Offline maps → Import saved map**. Select the saved JSON file. **The website and radio page have separate browser storage; this import is required even on the same phone.**
8. Turn off **Load map tiles from the internet when available** for offline-only use. Check the area and zoom levels you need before leaving. Zooming beyond the saved detail or panning outside the downloaded area shows an empty grid; station markers and coordinates remain visible.

The desktop/mobile companion or [local demo](Demo) can also prepare maps while it has internet access. In those interfaces, use **Map → Offline maps**. Export/import is needed when moving the map to a different browser/app/origin; a companion can use its own saved tiles directly after connecting to a radio.

**Storage limits:** at most **400 tiles / 32 MB** are saved per browser/app. Larger areas require less detail, or downloading a smaller area. **Cancel download** keeps completed tiles, and retrying resumes by skipping tiles already saved. A failed download clearly says it is incomplete. **Remove saved maps** deletes only map tiles on this device, after confirmation.

**Moving maps between browsers/apps:** click **Export map** while you have internet. Save the JSON file. After opening Form8 at the radio's address, use **Offline maps → Import saved map**. This is necessary if you prepared the map at a different website, port, browser, device, or app: each has separate local storage. Exported files contain map tiles and the map view, not station locations.

Offline maps are stored in IndexedDB on the phone/laptop, not in the radio's flash. They survive page reloads and firmware updates but can be removed by clearing browser/app data, private browsing, or storage eviction. Keep an exported copy of maps you need. Downloading/exporting/importing maps does not broadcast any radio packets.
