# Archive messages and clean up incidents

## Keep a message on this device

1. Open the message in **Traffic**.
2. Under **Archive or remove**, choose **Archive on this device**.
3. Confirm. Form8 saves and verifies a copy before removing it from the normal Traffic list.
4. Open **Device archive** to read it. Use **Export archive JSON** for a separate backup.

On ESP32, this frees the message body from the radio. On nRF, the message body is removed from the companion traffic store; the archive remains on that phone. Archives belong to the browser/app and device that saved them. Clearing app/browser storage can erase them. Exported files can be imported using **Import an archive JSON file**.

## Remove a message without archiving

Open it in **Traffic**, choose **Remove message…**, and confirm. It disappears from normal Traffic. Existing archives and other nodes’ copies stay intact. This action does not mark the form delivered. A small delivery record remains to prevent that message being downloaded again automatically.

To review those entries, enable **Show archived and removed entries** in Traffic. Enable **Include previous incidents** to also see older incidents. You can archive or remove an older form without rejoining its incident.

## Leave an incident

In **Incidents → Saved incidents on this node or app**, click **Leave** beside the active incident and confirm. This stops participation and relaying for that incident, while keeping its saved forms and chat. Use **Include previous incidents** in Traffic to read its forms later.

The nRF radio must be connected to leave its active incident. This control requires firmware with the Leave command and the matching updated app.

## Remove an old incident and its messages

1. Export or archive any forms you want to keep first. Chat is not included in form archives.
2. Open **Incidents** and find the incident under **Saved incidents on this node or app**.
3. Choose **Remove incident…** and review the confirmation.
4. Confirm to delete that incident’s local forms, delivery records, and chat. If it is active, Form8 leaves it first.

This frees the incident’s record slots as well as its message storage. The operation cannot be undone locally. Device archives and drafts, and other nodes’ copies, are kept. A nearby node can still advertise the incident under **Nearby incidents**; joining it again may receive its traffic again.

On ESP32, removal affects that radio’s store. On nRF, it affects that phone’s companion store; the radio must be connected if the incident is active. Other phones’ companion stores are separate.

## Delete an archive

In **Device archive**, use **Delete archive…** to remove that saved copy from this device. Export it first if you need a backup. This does not delete traffic on the radio or another node.
