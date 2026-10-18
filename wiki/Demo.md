# Try it without radios

You can try the screens on a computer before setting up hardware.

1. Install Node.js 22 or later.
2. Open a terminal in this project's folder.
3. Run:

   ```sh
   npm run dev
   ```

4. Open **http://127.0.0.1:8848** in your browser.
5. Open **Incidents**, enter `Practice drill`, and click **Create and join**.
6. Open **Compose**, enter a subject and message, and click **Send to radio queue**.
7. Open **Traffic** to read the message and try the controls.

The header says **Simulation · no RF**. This demo does not transmit over a radio or test delivery between radios. Its saved data is in `tmp/demo.local.json`. You do not need to run `npm install` for the demo.

Sending shows **Saving in simulator…**, then **Saved in simulator · no radio transmission**. Traffic entries show **Simulation**; the demo does not fabricate radio acknowledgments. Use real nodes for delivery, receipt, and relay tests.
