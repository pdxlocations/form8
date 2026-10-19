# Archive messages and clean up incidents

## Keep a message on this device

1. In **Traffic**, find the message.
2. Click **Archive** beside **Open**. You can also open the message and choose **Archive on this device** under **Archive or remove**.
3. Confirm. Form8 saves and verifies a copy before removing it from the normal Traffic list.
4. Open **Device archive** to read it. Use **Export archive JSON** for a separate backup.

On ESP32, this frees the message body from the radio. On nRF, the message body is removed from the companion traffic store; the archive remains on that phone. Archives belong to the browser/app and device that saved them. Clearing app/browser storage can erase them. Exported files can be imported using **Import an archive JSON file**.

## Remove a message without archiving

In the **Traffic** list, click **Remove…** beside **Open** and **Archive**, then confirm. You can also open the message and use **Remove message…**. It disappears from normal Traffic. Existing archives and other nodes’ copies stay intact. This action does not mark the form delivered. A small delivery record remains to prevent that message being downloaded again automatically.

To review those entries, enable **Show archived and removed entries** in Traffic. Enable **Include previous incidents** to also see older incidents. You can archive or remove an older form without rejoining its incident.

## Leave an incident

Open **Incidents** and click **Leave** beside the active incident, then confirm. Its card appears under **Nearby incidents** when another online node advertises it; otherwise, look under **Saved incidents on this node or app**. This leaves the active incident and stops its normal stored-message transmissions, while keeping its saved forms and chat. Use **Include previous incidents** in Traffic to read its forms later.

The nRF radio must be connected to leave its active incident. This control requires firmware with the Leave command and the matching updated app.

## Remove an old incident and its messages

1. Export or archive any forms you want to keep first. Chat is not included in form archives.
2. Open **Incidents** and find the incident under **Nearby incidents** or **Saved incidents on this node or app**. Saved incidents are shown once: if advertised nearby, their management buttons appear on the Nearby card.
3. Choose **Delete incident & messages…** and review the confirmation.
4. Confirm to delete that incident’s local forms, delivery records, and chat. If it is active, Form8 leaves it first.

This frees the incident’s record slots as well as its message storage. The operation cannot be undone locally. Device archives and drafts, and other nodes’ copies, are kept. A nearby node can still advertise the incident under **Nearby incidents**; joining it again may receive its traffic again.

On ESP32, removal affects that radio’s store. On nRF, it affects that phone’s companion store; the radio must be connected if the incident is active. Other phones’ companion stores are separate.

## Delete an archive

In **Device archive**, use **Delete archive…** to remove that saved copy from this device. Export it first if you need a backup. This does not delete traffic on the radio or another node.
