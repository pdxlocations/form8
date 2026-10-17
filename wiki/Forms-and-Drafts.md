# Read, acknowledge, reply, or correct

Open **Traffic** to see a compact message list with each form’s **From** and **To** fields alongside the routing callsigns. Click **Open** to show one message at a time.

In a message, **Human Ack** lists every callsign that manually acknowledged it, including your own station and stations now offline. **None yet** means no human acknowledgment has been recorded. Radio acknowledgments remain separate. After sending, the saved-message info bar updates automatically from waiting to **Radio Ack: CALLSIGN** and **Human Ack: CALLSIGN** as receipts arrive, including while you browse the traffic list. A new notification or error replaces that bar. From/To fields remain available after offloading new messages; older messages can recover them while their bodies are still stored.

- **Back to traffic** returns to your list page.
- **Previous message / Next message** appear when another message is available in that view, including across pages.
- **Acknowledge** records your station's human acknowledgment.
- **Reply** starts a new form linked to the original. Enter your response and send it.
- **Correction** copies the original into a new draft, prefixes the subject with `Correction:`, and links it to the original. Make your changes and send it.

**Sent forms cannot be edited.** For example, if you sent “Bring 10 chairs” but meant 20, use **Correction**, change the text to “Bring 20 chairs,” and send the new form. The original remains available.

Radio data updates every two seconds while the page is running. Each tab also has **Refresh data**, which keeps your current tab, open message, and unsaved edits.

Saved drafts with no subject are labeled **Untitled draft-1**, **Untitled draft-2**, and so on. Numbers stay with each untitled draft across saves and page reloads. When no untitled drafts remain, numbering starts again at 1. These labels do not fill in the form’s Subject field.

## Delete a draft

In **Compose**, find the saved draft above the form and click **Delete** beside its title. Confirm to delete it from this device. If it is the draft you are editing, the form clears for a new draft. Other drafts and sent messages stay saved. Deletion cannot be undone.

## Attach a location

1. In **Compose**, expand **Optional location**.
2. Click **Use current location** and allow location access if requested.
3. Check the filled-in **Latitude** and **Longitude** fields before sending.

This uses a fresh onboard GPS fix when available, otherwise the phone/laptop location. You can also type both coordinates manually. **Remove location** clears them. Location access may be unavailable in a browser connected directly to the radio's HTTP webpage; use manual coordinates or a configured native companion. The Heltec V3 has no onboard GPS.

## Switch incidents

Open **Incidents** and join a nearby or retained incident. Your radio has one active incident at a time. Switching stops transmission of the previous incident's forms until you join it again; its saved forms remain on the radio. **Include previous incidents** in Traffic lets you view retained traffic from other incidents.
