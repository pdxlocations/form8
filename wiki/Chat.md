# Use incident chat

**Chat** is for short incident updates and conversations. Formal messages still belong in **Compose / Traffic**. All participants must run firmware with chat support, use matching radio settings, and join the same Incident ID. Older Form8 firmware does not receive or relay chat packets.

1. Open **Chat** and type a short message, such as `At the staging area 👩🏽‍🚒`.
2. Keep it within **200 UTF-8 bytes**, using the live counter below the text box. Emoji are supported; for example, `👍` uses four bytes. The limit applies to your text, not its radio metadata.
3. Click **Send chat**. The message is saved on your radio and sent when radio transmission is enabled and unpaused.
4. Check the delivery line below the message: **Awaiting radio ACK** changes to **Radio ACK: CALLSIGN…** as other radios confirm that they saved it. An ACK is a radio receipt, not proof that a person read it or that every incident node received it.
5. Click **Reply** below a message to link your answer to it. Click **Cancel reply** to send a new message instead. An older reply target may show only its ID if it has left this radio's history.
6. Use **React** to choose 👍, 👎, ❤️, ✅, ❓, 🚨, or 👀. Click your highlighted reaction to remove it. Reaction buttons show counts; their tooltips list callsigns and the radio-ACK state of your own reaction.

Chat uses the page’s normal scrolling, with no separate scrolling message window. The small chat toolbar stays available as you scroll: **Latest** jumps to the newest message, and **Write** takes you to the message box. Incoming messages follow only when you are already at the end; reading older messages or typing keeps your position.

The page refreshes chat and delivery information automatically; **Refresh data** also updates it without changing tabs or clearing your text. Changing incidents keeps typed text but requires **Use this text in the current incident** before sending it there.

Chat messages, replies, reactions, and chat radio ACKs are **excluded from form traffic, form queued/unread counts, and the LCD's outgoing/unread counters**. They are stored separately and are not included in form archives. The low-level RX/TX diagnostic counters still count every radio packet.

Each radio retains up to **96 chat events across incidents**, including reaction changes, and displays its latest **30 text messages** in the active incident. Oldest events are removed as new ones arrive; chat is a short conversation history, not a permanent record. It uses available radio storage while preserving the form storage reserve. Reactions and parent messages can disappear as their events age out.

Chat uses an initial transmission plus at most **two retries**, with waits of **15 seconds** and then **45 seconds** after completed transmissions. A receipt from any remote radio stops that event's remaining retries. Without an ACK, the message stays visible with an unconfirmed-delivery label. A reboot or incident switch stops pending chat retries; same-incident radio reconfiguration preserves the remaining attempt budget. Chat does not broadcast periodic history inventories or synchronize old conversations to newly joined nodes. Chat is plaintext and unauthenticated, like forms.

## Unread chat badge

The speech-bubble icon counts incoming texts you have not viewed in Chat on this phone/laptop. It updates even when another tab is open. Opening Chat while the page is visible marks the currently retained texts as viewed; background/hidden pages do not mark incoming texts read. Your own texts, reactions, and radio ACK changes do not increase this badge. Read markers are saved per radio and incident in this browser and survive page reloads. Counts cover the newest 30 retained texts, not an unlimited message history. Chat remains separate from the form unread and queued-message totals in the header.
