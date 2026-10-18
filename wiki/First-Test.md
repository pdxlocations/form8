# First test with two radios

Use one phone or laptop connected to each radio. In this example, their callsigns are `NET-A` and `NET-B`.

## 1. Match the radio settings

On **both** radios, open **Radio setup** and use the same profile:

| Setting | Heltec V3 starting value |
|---|---|
| Primary frequency | 919.500 MHz |
| Bandwidth | 500 kHz |
| Spreading factor | 9 |
| Coding rate | 4/8 |
| TX power | 22 dBm (board maximum) |
| Use backup preset | Unchecked |
| Enable radio transmission | Checked |

Click **Save settings** on each radio. Transmission starts disabled on a fresh device. These are starting settings for testing, not a field-validated radio configuration. Radios that already have saved settings keep them after a firmware update; check the actual values on each radio.

## 2. Create one incident on NET-A

1. On `NET-A`, open **Incidents**.
2. Enter `Practice drill` under **New incident name**.
3. Click **Create and join**.
4. Note the **Incident ID** in the header.

An incident is the group of messages your radio is currently working with.

## 3. Join that incident on NET-B

1. On `NET-B`, open **Incidents**.
2. Look under **Nearby incidents** for `Practice drill`.
3. Click **Join** beside it.
4. Confirm that both radios show the **same Incident ID**.

**Do not create a second incident with the same name on NET-B.** Creating an incident gives it a new ID. Matching names alone do not put radios in the same incident.

Joining queues an announcement immediately when transmission is allowed. Routine announcements repeat every **2–2½ minutes**. A newly discovered or restarted node can prompt an earlier response, with a 30-second response cooldown; radio traffic can delay either. Use **Refresh data** to check again without reloading the page. The header shows both nodes heard and nodes in your active incident.

## 4. Send a test message from NET-A

1. On `NET-A`, open **Compose**.
2. Leave **Radio destination** set to **Broadcast to everyone**.
3. Fill in this example:

   | Field | Example |
   |---|---|
   | To · name and position | Drill team |
   | From · name and position | Alex, staging lead |
   | Subject | Radio check |
   | Precedence | Routine |
   | Message / reply | This is a practice message. Please acknowledge receipt. |

4. Click **Send to radio queue**.
5. On `NET-B`, open **Traffic**. The message should appear after successful radio delivery.
6. Click **Open** to read it.

Sending saves the form on your radio and queues it for transmission. It does **not** by itself mean another radio has received it.

## 5. Acknowledge it on NET-B

1. With the message open on `NET-B`, click **Acknowledge**.
2. After it is saved, the button changes to **Acknowledged** and becomes disabled.
3. On `NET-A`, open the message and look for `NET-B` in the **Manually acknowledged by** list once the acknowledgment arrives.

A **radio ACK** means another radio saved the form. A **human acknowledgment** means someone explicitly clicked **Acknowledge**. Opening a message only marks it read locally.

## Send to a particular station

To address a later message to `NET-B`:

1. In **Compose**, change **Radio destination** to **Callsign**.
2. Enter `NET-B` in **Destination callsign**.
3. Fill in the form and send it.

The **To** field names the person or position; **Destination callsign** addresses the radio station. Other radios in the same incident still store the form. Callsign addressing does not make it private.
