# Read, acknowledge, reply, or correct

Open **Traffic** to see a compact message list with each form’s **From** and **To** fields alongside the routing callsigns. Click the subject or **Open** to show one message at a time. The list shows newest messages first.

In a message, the receipt matrix’s **Human** column identifies every callsign that manually acknowledged it, including your own station and stations now offline. **—** means no human acknowledgment has been recorded for that station. The original sending station is labeled **Origin**, including when viewing your own sent form. Origin is not counted as a remote radio acknowledgment. Radio acknowledgments remain separate. After sending, the saved-message info bar updates automatically from waiting to **Radio Ack: CALLSIGN** and **Human Ack: CALLSIGN** as receipts arrive, including while you browse the traffic list. A new notification or error replaces that bar. From/To fields remain available after offloading new messages; older messages can recover them while their bodies are still stored.

- **Back to traffic** returns to your list page.
- **Previous message / Next message** appear when another message is available in that view, including across pages.
- **Acknowledge** records your station's human acknowledgment.
- **Reply** appears on received forms. It opens Compose, focuses **7. Message / 9. Reply**, addresses the reply to the original sender’s callsign, and links it to the original form. Broadcast replies use your callsign in From. Enter your response and send it. Your own forms offer **Correction** instead of Reply. If the local draft cannot be saved, a visible error explains why.
- **Correction** copies the original into a new draft, prefixes the subject with `Correction:`, and links it to the original. Make your changes and send it.

**Sent forms cannot be edited.** For example, if you sent “Bring 10 chairs” but meant 20, use **Correction**, change the text to “Bring 20 chairs,” and send the new form. The original remains available.

Radio data updates every two seconds while the page is running. Each tab also has **Refresh data**, which keeps your current tab, open message, and unsaved edits.

Saved drafts with no subject are labeled **Untitled draft-1**, **Untitled draft-2**, and so on. Numbers stay with each untitled draft across saves and page reloads. When no untitled drafts remain, numbering starts again at 1. These labels do not fill in the form’s Subject field.

## Fill in the form

The editor and reader follow the original Form 8 order:

1. **Incident** — the active incident.
2. **To** — the person or position receiving the message.
3. **From** — the person or position sending it.
4. **Subject** and **Precedence**, followed by **5. Date** and **6. Time · local**.
7. **Message / 9. Reply** — write the new message or your response here.
8. **Approved by** — expand this section when approval is needed; enter name, typed signature, and position/title. It starts collapsed.
9. **Reply** — the shaded section explains the linked reply and provides the reply action on a received form. It is not a second text box.
10. **Replied by** — optional replying person's name, position/title, typed signature, and reply date/time.

For example, open a received supply request, click **Reply**, type “Ten kits are ready for pickup” in **7. Message / 9. Reply**, optionally fill in section 10, then send. This creates a new linked form; the original stays unchanged. The form's human To/From fields are separate from radio routing callsigns.

## Delete a draft

In **Compose**, find the saved draft above the form and click **Delete** beside its title. Confirm to delete it from this device. If it is the draft you are editing, the form clears for a new draft. Other drafts and sent messages stay saved. Deletion cannot be undone.

## Attach a location

1. In **Compose**, expand **Optional location**.
2. Click **Use current location** and allow location access if requested.
3. Check the filled-in **Latitude** and **Longitude** fields before sending.

This uses a fresh onboard GPS fix when available, otherwise the phone/laptop location. You can also type both coordinates manually. **Remove location** clears them. Location access may be unavailable in a browser connected directly to the radio's HTTP webpage; use manual coordinates or a configured native companion. The Heltec V3 has no onboard GPS.

## Switch incidents

Open **Incidents** and join a nearby or saved incident. Your radio has one active incident at a time. Switching stops transmission of the previous incident's forms until you join it again; its saved forms remain on the radio. **Include previous incidents** in Traffic lets you view retained traffic from other incidents.

## Archive, remove, or leave

Each Traffic row has **Open**, **Archive**, and **Remove…** buttons, so cleanup does not require opening the message. An open message also has an **Archive or remove** section. **Archive on this device** keeps a verified copy in Device archive and removes the body from normal Traffic. **Remove message…** removes it without creating an archive. Both keep existing device archives and other nodes’ copies. **Show archived and removed entries** reveals retained delivery history.

In **Incidents**, **Leave** stops participation while keeping messages. **Delete incident & messages…** deletes that incident’s local forms and chat, leaving first if it is active. [Cleanup and backup instructions](Archives).

## Reading messages and acknowledgments

Opening a form shows its contents as soon as they arrive; saving the read marker follows afterward. While the form is open, automatic refreshes update its delivery metadata without repeatedly downloading the immutable message body. A changed body checksum or missing list entry causes a fresh fetch. A failed read-marker save leaves the message visible and reports the error; it does not silently mark it read.

The reader uses one color-coded matrix, with **Station**, **Radio**, and **Human** columns. **Origin** is blue, **Received** is teal, a human **Acknowledged** cell is green, **Pending** is amber, and offline/unacknowledged cells are gray. Text labels remain visible in both light and dark mode. Your own saved acknowledgment appears in the matrix too. The separate Radio Ack and Human Ack summary boxes have been removed.

A **repair responder** is any node holding a saved form body that sends it when another node requests a missing copy. It need not be the original sender or a dedicated repeater. Packet relaying controls forwarding; answering requests for a locally stored form remains available even with relaying off.

Traffic shows **Radio ACK** as soon as any remote station confirms a saved copy. For a broadcast, that also stops full-form retries and clears the outgoing count. Individual stations can still show Pending or Pending · offline in the matrix. For a callsign-addressed form, **Radio ACK · recipient pending** means another station has a copy but the addressed recipient has not ACKed; retries and the outgoing count continue until that recipient does. The matrix identifies the receiving callsigns.

Only receiving stations can manually acknowledge a form. The originating node has no Acknowledge button, and the radio/companion APIs reject attempts to acknowledge its own form. This uses the stable node ID, so changing a callsign does not change ownership. Historical originator human ACKs are omitted from the matrix and summary and are not repeated by ACK recovery. Replies and corrections have their own originating nodes.

## Resending your own form

Open a form originated by the connected node and click **Resend**. Join that form’s incident and check **Enable radio transmission** in Radio setup first. The original body must still be stored on the node or companion; archived/removed bodies cannot be resent from Traffic. Other nodes’ forms do not have this button, and the APIs enforce ownership by node ID.

Resend queues the original form with the same ID, contents, destination, timestamp and checksum. It does not create a new message or erase radio/human receipts. An already-acknowledged form can be explicitly resent; it keeps its Radio ACK status. A resend coalesces with an already-queued transmission of that form. It respects channel availability and transmission controls, and does not bypass the radio scheduler. A failed/full queue reports an error. If you need to change the message, use Correction instead.

Update firmware and Android app together for Resend. Existing receivers can accept the same wire format without changes.

## Sending and progress

Click **Send to radio queue** once. **Sending to radio…** appears immediately, and the send action stays locked until the request finishes. Saving locally is not proof of radio delivery; check Traffic and the receipt matrix afterward. Buttons performing asynchronous work are protected against duplicate submissions and become usable again after completion or failure.

Incident actions similarly show **Joining…**, **Creating…**, or **Leaving…** while working. Other membership controls wait until that change finishes. Saved incident cards put the name and Incident ID on separate lines, with equal-width action buttons.
