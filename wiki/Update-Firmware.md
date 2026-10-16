# Update an existing radio

1. Connect the radio by USB.
2. Open a terminal in this project's folder.
3. Upload firmware only:

   ```sh
   pio run -e heltec-v3 -t upload
   ```

4. Reconnect to its hotspot after it restarts, then reopen the webpage.
5. Check **Radio setup**. Saved callsigns, radio settings, and the active incident selection remain.

Firmware-only updates preserve radio forms when the partition layout is unchanged. **Do not run `uploadfs` for routine updates.** It erases the stored forms.

If the filesystem was replaced, the saved active incident selection can still survive in separate settings storage. The firmware restores that incident's list entry at startup. This does not recover erased message bodies.
