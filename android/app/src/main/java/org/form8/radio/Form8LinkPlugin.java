package org.form8.radio;

import android.Manifest;
import android.app.Activity;
import android.app.PendingIntent;
import android.bluetooth.*;
import android.bluetooth.le.*;
import android.content.*;
import android.hardware.usb.*;
import android.os.*;
import android.util.Base64;
import androidx.activity.result.ActivityResult;
import androidx.core.content.ContextCompat;
import com.getcapacitor.*;
import com.getcapacitor.annotation.*;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.*;

@CapacitorPlugin(
    name = "Form8Link",
    permissions = {
      @Permission(
          alias = "bluetooth",
          strings = {Manifest.permission.BLUETOOTH_SCAN, Manifest.permission.BLUETOOTH_CONNECT}),
      @Permission(
          alias = "location",
          strings = {Manifest.permission.ACCESS_FINE_LOCATION})
    })
public class Form8LinkPlugin extends Plugin {
  private static final UUID SERVICE = UUID.fromString("6e400001-b5a3-f393-e0a9-e50e24dcca9e"),
      RX = UUID.fromString("6e400002-b5a3-f393-e0a9-e50e24dcca9e"),
      TX = UUID.fromString("6e400003-b5a3-f393-e0a9-e50e24dcca9e"),
      CCC = UUID.fromString("00002902-0000-1000-8000-00805f9b34fb");
  private final Handler handler = new Handler(Looper.getMainLooper());
  private final ExecutorService usbExecutor = Executors.newSingleThreadExecutor();
  private volatile BluetoothGatt gatt;
  private final BleReconnectPolicy bleReconnect = new BleReconnectPolicy();
  private BluetoothDevice bleDevice;
  private long bleSession;
  private BluetoothGattCharacteristic rx;
  private BluetoothLeScanner scanner;
  private BluetoothGattCharacteristic pendingSubscription;
  private ScanCallback scanCallback;
  private PluginCall scanCall, connectCall, writeCall, usbPermissionCall;
  private final LinkedHashMap<String, JSObject> found = new LinkedHashMap<>();
  private byte[] writeBytes;
  private int writeOffset = 0, mtu = 23;
  private volatile UsbDeviceConnection usb;
  private UsbEndpoint usbIn, usbOut;
  private UsbInterface usbData;
  private Thread usbReader;
  private volatile boolean connected = false;
  private String transport = "";
  private final String usbAction = "org.form8.radio.USB_PERMISSION";
  private final BroadcastReceiver usbReceiver =
      new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
          if (BluetoothDevice.ACTION_BOND_STATE_CHANGED.equals(intent.getAction())) {
            handleBondState(intent);
            return;
          }
          if (UsbManager.ACTION_USB_DEVICE_DETACHED.equals(intent.getAction())) {
            if (transport.equals("usb")) close("USB radio disconnected");
            return;
          }
          if (!usbAction.equals(intent.getAction())) return;
          PluginCall call = usbPermissionCall;
          usbPermissionCall = null;
          if (call == null) return;
          UsbDevice device = intent.getParcelableExtra(UsbManager.EXTRA_DEVICE);
          if (intent.getBooleanExtra(UsbManager.EXTRA_PERMISSION_GRANTED, false) && device != null)
            openUsb(device, call);
          else call.reject("USB permission denied");
        }
      };

  private final BroadcastReceiver bondReceiver =
      new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
          handleBondState(intent);
        }
      };

  @Override
  public void load() {
    super.load();
    IntentFilter filter = new IntentFilter(usbAction);
    filter.addAction(UsbManager.ACTION_USB_DEVICE_DETACHED);

    ContextCompat.registerReceiver(
        getContext(), usbReceiver, filter, ContextCompat.RECEIVER_NOT_EXPORTED);
    // Bluetooth broadcasts come from the privileged Bluetooth process on some Android versions.
    ContextCompat.registerReceiver(
        getContext(),
        bondReceiver,
        new IntentFilter(BluetoothDevice.ACTION_BOND_STATE_CHANGED),
        ContextCompat.RECEIVER_EXPORTED);
  }

  private BluetoothAdapter adapter() {
    BluetoothManager manager =
        (BluetoothManager) getContext().getSystemService(Context.BLUETOOTH_SERVICE);
    return manager == null ? null : manager.getAdapter();
  }

  private boolean permission(PluginCall call) {
    String alias = Build.VERSION.SDK_INT >= 31 ? "bluetooth" : "location";
    if (getPermissionState(alias) != PermissionState.GRANTED) {
      requestPermissionForAlias(alias, call, "permissionResult");
      return false;
    }
    return true;
  }

  @PermissionCallback
  private void permissionResult(PluginCall call) {
    String alias = Build.VERSION.SDK_INT >= 31 ? "bluetooth" : "location";
    if (getPermissionState(alias) != PermissionState.GRANTED) {
      call.reject("Bluetooth permission is required");
      return;
    }
    if (call.getMethodName().equals("scanBle")) scanBle(call);
    else connectBle(call);
  }

  @PluginMethod
  public void scanBle(PluginCall call) {
    try {

      if (!permission(call)) return;
      BluetoothAdapter a = adapter();
      if (a == null || !a.isEnabled()) {
        call.reject("Turn on Bluetooth first");
        return;
      }
      if (scanCall != null) {
        call.reject("Scan already running");
        return;
      }
      found.clear();
      scanCall = call;
      scanner = a.getBluetoothLeScanner();
      scanCallback =
          new ScanCallback() {
            @Override
            public void onScanResult(int type, ScanResult result) {
              BluetoothDevice d = result.getDevice();
              String name =
                  result.getScanRecord() == null ? null : result.getScanRecord().getDeviceName();
              // Advertisement name is available without querying protected device metadata.
              JSObject item = new JSObject();
              item.put("id", d.getAddress());
              item.put("name", name == null ? d.getAddress() : name);
              synchronized (found) {
                found.put(d.getAddress(), item);
              }
            }

            @Override
            public void onScanFailed(int code) {
              handler.post(() -> finishScan("Bluetooth scan failed: " + code));
            }
          };
      try {
        scanner.startScan(
            Collections.singletonList(
                new ScanFilter.Builder().setServiceUuid(new ParcelUuid(SERVICE)).build()),
            new ScanSettings.Builder().setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY).build(),
            scanCallback);
        handler.postDelayed(() -> finishScan(null), 4000);
      } catch (Exception e) {
        finishScan(e.getMessage());
      }

    } catch (SecurityException e) {
      call.reject("Bluetooth permission was revoked");
      close("Bluetooth permission was revoked");
    }
  }

  private void finishScan(String error) {
    if (scanCall == null) return;
    try {
      scanner.stopScan(scanCallback);
    } catch (SecurityException ignored) {
    } catch (Exception ignored) {
    }
    PluginCall call = scanCall;
    scanCall = null;
    JSArray devices = new JSArray();
    synchronized (found) {
      for (JSObject item : found.values()) devices.put(item);
    }
    JSObject result = new JSObject();
    result.put("devices", devices);
    if (error == null) call.resolve(result);
    else call.reject(error);
  }

  @PluginMethod
  public void connectBle(PluginCall call) {
    handler.post(() -> connectBleOnMain(call));
  }

  private void connectBleOnMain(PluginCall call) {
    try {

      if (!permission(call)) return;
      String address = call.getString("id");
      BluetoothAdapter a = adapter();
      if (a == null || !a.isEnabled()) {
        call.reject("Turn on Bluetooth first");
        return;
      }
      close("Changing connection");
      finishScan(null);
      connectCall = call;
      transport = "ble";
      mtu = 23;
      try {
        bleDevice = a.getRemoteDevice(address);
        bleSession = bleReconnect.begin();
        scheduleBleAttempt(call, bleSession);
        handler.postDelayed(
            () -> {
              try {

                if (connectCall == call) {
                  call.reject("Bluetooth connection timed out");
                  connectCall = null;
                  close("Connection timed out");
                }

              } catch (SecurityException e) {
                close("Bluetooth permission was revoked");
              }
            },
            60000);
      } catch (Exception e) {
        close("Cannot connect Bluetooth: " + e.getMessage());
      }

    } catch (SecurityException e) {
      call.reject("Bluetooth permission was revoked");
      close("Bluetooth permission was revoked");
    }
  }

  private void scheduleBleAttempt(PluginCall call, long session) {
    handler.postDelayed(
        () -> {
          if (connectCall != call || !bleReconnect.startAttempt(session)) return;
          try {
            gatt = bleDevice.connectGatt(
                getContext(), false, gattCallback, BluetoothDevice.TRANSPORT_LE);
            if (gatt == null) close("Android could not start a Bluetooth connection. Try again.");
          } catch (SecurityException e) {
            close("Bluetooth permission was revoked");
          } catch (Exception e) {
            close("Cannot connect Bluetooth: " + e.getMessage());
          }
        },
        bleReconnect.delayMillis(SystemClock.elapsedRealtime()));
  }

  private void bluetoothFailure(int status, String reason) {
    if (connectCall != null && !connected && bleReconnect.retryable(status)) {
      releaseGatt();
      notifyConnection("Bluetooth connection failed (133). Retrying "
          + bleReconnect.nextAttempt() + " of 3…");
      scheduleBleAttempt(connectCall, bleSession);
      return;
    }
    close(reason + (status == 133 ? ". Try connecting again; if it persists, toggle phone Bluetooth off and on." : ""));
  }

  private final BluetoothGattCallback gattCallback =
      new BluetoothGattCallback() {
        @Override
        public void onConnectionStateChange(BluetoothGatt g, int status, int state) {
          handler.post(
              () -> {
                try {

                  if (g != gatt) return;
                  if (status != BluetoothGatt.GATT_SUCCESS
                      || state == BluetoothProfile.STATE_DISCONNECTED) {
                    String reason = "Bluetooth disconnected (GATT status " + status + ")";
                    bluetoothFailure(status, reason);
                  } else if (state == BluetoothProfile.STATE_CONNECTED) {
                    if (!g.requestMtu(247)) g.discoverServices();
                  }

                } catch (SecurityException e) {
                  close("Bluetooth permission was revoked");
                }
              });
        }

        @Override
        public void onMtuChanged(BluetoothGatt g, int value, int status) {
          handler.post(
              () -> {
                try {

                  if (g != gatt) return;
                  mtu = status == BluetoothGatt.GATT_SUCCESS ? value : 23;
                  g.discoverServices();

                } catch (SecurityException e) {
                  close("Bluetooth permission was revoked");
                }
              });
        }

        @Override
        public void onServicesDiscovered(BluetoothGatt g, int status) {
          handler.post(
              () -> {
                try {

                  if (g != gatt) return;
                  if (status != BluetoothGatt.GATT_SUCCESS) {
                    bluetoothFailure(status, "Bluetooth service discovery failed: " + status);
                    return;
                  }
                  BluetoothGattService s = g.getService(SERVICE);
                  BluetoothGattCharacteristic tx = s == null ? null : s.getCharacteristic(TX);
                  rx = s == null ? null : s.getCharacteristic(RX);
                  if (tx == null || rx == null) {
                    failConnect("Form8 UART service unavailable");
                    close("Service unavailable");
                    return;
                  }
                  if (s.getCharacteristic(UUID.fromString("6e400004-b5a3-f393-e0a9-e50e24dcca9e"))
                          != null
                      && g.getDevice().getBondState() != BluetoothDevice.BOND_BONDED) {
                    pendingSubscription = tx;
                    if (g.getDevice().getBondState() == BluetoothDevice.BOND_NONE
                        && !g.getDevice().createBond()
                        && g.getDevice().getBondState() == BluetoothDevice.BOND_NONE) {
                      failConnect(
                          "Cannot start pairing. Use the last 6 digits of the node Wi-Fi"
                              + " password.");
                      close("Pairing failed");
                    }
                    return;
                  }
                  subscribe(g, tx);

                } catch (SecurityException e) {
                  close("Bluetooth permission was revoked");
                }
              });
        }

        @Override
        public void onDescriptorWrite(BluetoothGatt g, BluetoothGattDescriptor d, int status) {
          handler.post(
              () -> {
                try {

                  if (g != gatt) return;
                  if (status != 0) {
                    bluetoothFailure(status, "Cannot subscribe to radio: " + status);
                    return;
                  }
                  connected = true;
                  bleReconnect.cancel();
                  notifyConnection("");
                  if (connectCall != null) {
                    connectCall.resolve();
                    connectCall = null;
                  }

                } catch (SecurityException e) {
                  close("Bluetooth permission was revoked");
                }
              });
        }

        @Override
        public void onCharacteristicChanged(BluetoothGatt g, BluetoothGattCharacteristic c) {
          if (g == gatt && c.getUuid().equals(TX)) received(c.getValue());
        }

        @Override
        public void onCharacteristicWrite(
            BluetoothGatt g, BluetoothGattCharacteristic c, int status) {
          handler.post(
              () -> {
                try {

                  if (g != gatt || writeCall == null) return;
                  if (status != 0) {
                    writeCall.reject("Bluetooth write failed: " + status);
                    writeCall = null;
                    close("Bluetooth write failed");
                  } else sendChunk();

                } catch (SecurityException e) {
                  close("Bluetooth permission was revoked");
                }
              });
        }
      };

  private void handleBondState(Intent intent) {
    try {
      BluetoothDevice device = intent.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE);
      if (gatt == null
          || device == null
          || !device.getAddress().equals(gatt.getDevice().getAddress())
          || pendingSubscription == null) return;
      int state = device.getBondState();
      if (state == BluetoothDevice.BOND_BONDED) {
        BluetoothGattCharacteristic characteristic = pendingSubscription;
        pendingSubscription = null;
        subscribe(gatt, characteristic);
      } else if (state == BluetoothDevice.BOND_NONE) {
        failConnect("Pairing cancelled or failed. PIN: last 6 digits of the node Wi-Fi password.");
        close("Pairing failed");
      }
    } catch (SecurityException e) {
      close("Bluetooth permission was revoked");
    }
  }

  private void subscribe(BluetoothGatt g, BluetoothGattCharacteristic tx) {
    try {
      BluetoothGattDescriptor c = tx.getDescriptor(CCC);
      if (c == null || !g.setCharacteristicNotification(tx, true)) {
        failConnect("Cannot enable Bluetooth notifications");
        close("Notifications unavailable");
        return;
      }
      c.setValue(BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE);
      if (!g.writeDescriptor(c)) {
        failConnect("Cannot subscribe to radio");
        close("Subscribe failed");
      }
    } catch (SecurityException e) {
      close("Bluetooth permission was revoked");
    }
  }

  private void failConnect(String reason) {
    if (connectCall != null) {
      connectCall.reject(reason);
      connectCall = null;
    }
  }

  private void received(byte[] data) {
    JSObject result = new JSObject();
    result.put("base64", Base64.encodeToString(data, Base64.NO_WRAP));
    result.put("transport", transport);
    notifyListeners("data", result);
  }

  private void notifyConnection(String reason) {
    JSObject result = new JSObject();
    result.put("connected", connected);
    result.put("transport", transport);
    result.put("reason", reason);
    notifyListeners("connection", result);
  }

  @PluginMethod
  public void listUsb(PluginCall call) {
    UsbManager m = (UsbManager) getContext().getSystemService(Context.USB_SERVICE);
    JSArray devices = new JSArray();
    for (UsbDevice d : m.getDeviceList().values()) {
      boolean cdc = false;
      for (int i = 0; i < d.getInterfaceCount(); i++)
        if (d.getInterface(i).getInterfaceClass() == UsbConstants.USB_CLASS_CDC_DATA) cdc = true;
      if (cdc) {
        JSObject item = new JSObject();
        item.put("id", String.valueOf(d.getDeviceId()));
        item.put("name", d.getProductName() == null ? d.getDeviceName() : d.getProductName());
        devices.put(item);
      }
    }
    JSObject result = new JSObject();
    result.put("devices", devices);
    call.resolve(result);
  }

  @PluginMethod
  public void connectUsb(PluginCall call) {
    handler.post(() -> connectUsbOnMain(call));
  }

  private void connectUsbOnMain(PluginCall call) {
    UsbManager m = (UsbManager) getContext().getSystemService(Context.USB_SERVICE);
    UsbDevice device = null;
    for (UsbDevice d : m.getDeviceList().values())
      if (String.valueOf(d.getDeviceId()).equals(call.getString("id"))) device = d;
    if (device == null) {
      call.reject("USB radio not found. Use a USB OTG adapter and data cable.");
      return;
    }
    if (m.hasPermission(device)) {
      openUsb(device, call);
      return;
    }
    if (usbPermissionCall != null) {
      call.reject("USB permission request already pending");
      return;
    }
    usbPermissionCall = call;
    Intent intent = new Intent(usbAction).setPackage(getContext().getPackageName());
    PendingIntent p =
        PendingIntent.getBroadcast(
            getContext(),
            0,
            intent,
            PendingIntent.FLAG_MUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    m.requestPermission(device, p);
  }

  private void openUsb(UsbDevice device, PluginCall call) {
    close("Changing connection");
    UsbManager manager = (UsbManager) getContext().getSystemService(Context.USB_SERVICE);
    UsbDeviceConnection c = manager.openDevice(device);
    if (c == null) {
      call.reject("Cannot open USB radio");
      return;
    }
    UsbInterface control = null, data = null;
    UsbEndpoint in = null, out = null;
    for (int i = 0; i < device.getInterfaceCount(); i++) {
      UsbInterface f = device.getInterface(i);
      if (f.getInterfaceClass() == UsbConstants.USB_CLASS_COMM) control = f;
      if (f.getInterfaceClass() == UsbConstants.USB_CLASS_CDC_DATA) {
        for (int j = 0; j < f.getEndpointCount(); j++) {
          UsbEndpoint e = f.getEndpoint(j);
          if (e.getType() == UsbConstants.USB_ENDPOINT_XFER_BULK) {
            if (e.getDirection() == UsbConstants.USB_DIR_IN) in = e;
            else out = e;
          }
        }
        if (in != null && out != null) {
          data = f;
          break;
        }
      }
    }
    if (data == null || !c.claimInterface(data, true)) {
      c.close();
      call.reject("USB CDC data interface unavailable");
      return;
    }
    if (control != null) {
      c.claimInterface(control, true);
      byte[] baud = {(byte) 0x00, (byte) 0xc2, 1, 0, 0, 0, 8};
      c.controlTransfer(0x21, 0x20, 0, control.getId(), baud, 7, 1000);
      c.controlTransfer(0x21, 0x22, 3, control.getId(), null, 0, 1000);
    }
    usb = c;
    usbData = data;
    usbIn = in;
    usbOut = out;
    transport = "usb";
    connected = true;
    notifyConnection("");
    call.resolve();
    UsbEndpoint readEndpoint = in;
    usbReader =
        new Thread(
            () -> {
              try {

                byte[] buffer = new byte[1024];
                while (usb == c && connected) {
                  int n = c.bulkTransfer(readEndpoint, buffer, buffer.length, 500);
                  if (n > 0 && usb == c) received(Arrays.copyOf(buffer, n));
                }

              } catch (SecurityException e) {
                close("Bluetooth permission was revoked");
              }
            },
            "Form8 USB read");
    usbReader.start();
  }

  @PluginMethod
  public void send(PluginCall call) {
    String data = call.getString("data", "");
    if (data.getBytes(StandardCharsets.UTF_8).length > 16385) {
      call.reject("Frame too large");
      return;
    }
    if (!connected) {
      call.reject("Radio disconnected");
      return;
    }
    if (transport.equals("usb")) {
      byte[] bytes = data.getBytes(StandardCharsets.UTF_8);
      UsbDeviceConnection c = usb;
      UsbEndpoint endpoint = usbOut;
      usbExecutor.execute(
          () -> {
            try {

              try {
                int offset = 0;
                while (offset < bytes.length) {
                  int n =
                      c.bulkTransfer(
                          endpoint, bytes, offset, Math.min(512, bytes.length - offset), 2000);
                  if (n <= 0) throw new Exception("USB write failed; check cable");
                  offset += n;
                }
                call.resolve();
              } catch (Exception e) {
                call.reject(e.getMessage());
                handler.post(() -> close("USB write failed"));
              }

            } catch (SecurityException e) {
              close("Bluetooth permission was revoked");
            }
          });
    } else
      handler.post(
          () -> {
            try {

              if (writeCall != null) {
                call.reject("Bluetooth write already active");
                return;
              }
              writeBytes = data.getBytes(StandardCharsets.UTF_8);
              writeOffset = 0;
              writeCall = call;
              sendChunk();
              handler.postDelayed(
                  () -> {
                    try {

                      if (writeCall == call) {
                        writeCall = null;
                        call.reject("Bluetooth write timed out");
                        close("Bluetooth write timed out");
                      }

                    } catch (SecurityException e) {
                      close("Bluetooth permission was revoked");
                    }
                  },
                  15000);

            } catch (SecurityException e) {
              close("Bluetooth permission was revoked");
            }
          });
  }

  private void sendChunk() {
    try {

      if (writeCall == null) return;
      if (writeOffset >= writeBytes.length) {
        writeCall.resolve();
        writeCall = null;
        return;
      }
      if (gatt == null || rx == null) {
        writeCall.reject("Bluetooth disconnected");
        writeCall = null;
        return;
      }
      int end = Math.min(writeBytes.length, writeOffset + mtu - 3);
      rx.setWriteType(BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT);
      rx.setValue(Arrays.copyOfRange(writeBytes, writeOffset, end));
      writeOffset = end;
      if (!gatt.writeCharacteristic(rx)) {
        writeCall.reject("Bluetooth write could not start");
        writeCall = null;
        close("Write failed");
      }

    } catch (SecurityException e) {
      close("Bluetooth permission was revoked");
    }
  }

  @PluginMethod
  public void disconnect(PluginCall call) {
    handler.post(() -> {
      close("Disconnected");
      call.resolve();
    });
  }

  private void releaseGatt() {
    if (gatt != null) {
      BluetoothGatt old = gatt;
      gatt = null;
      bleReconnect.closed(SystemClock.elapsedRealtime());
      try {
        old.disconnect();
      } catch (SecurityException ignored) {
      } catch (Exception ignored) {
      }
      try {
        old.close();
      } catch (SecurityException ignored) {
      } catch (Exception ignored) {
      }
    }
    rx = null;
    pendingSubscription = null;
    mtu = 23;
  }

  private void close(String reason) {
    if (Looper.myLooper() != handler.getLooper()) {
      handler.post(() -> close(reason));
      return;
    }
    connected = false;
    bleReconnect.cancel();
    bleDevice = null;
    releaseGatt();
    UsbDeviceConnection c = usb;
    usb = null;
    if (c != null) {
      try {
        c.close();
      } catch (SecurityException ignored) {
      } catch (Exception ignored) {
      }
    }
    if (writeCall != null) {
      writeCall.reject(reason);
      writeCall = null;
    }
    failConnect(reason);
    notifyConnection(reason);
  }

  @PluginMethod
  public void saveFile(PluginCall call) {
    Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
    intent.setType(call.getString("mime", "application/octet-stream"));
    intent.addCategory(Intent.CATEGORY_OPENABLE);
    intent.putExtra(Intent.EXTRA_TITLE, call.getString("name", "form8-export.json"));
    startActivityForResult(call, intent, "saveFileResult");
  }

  @ActivityCallback
  private void saveFileResult(PluginCall call, ActivityResult result) {
    if (call == null) return;
    if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null) {
      call.reject("Export cancelled");
      return;
    }
    try (OutputStream out =
        getContext().getContentResolver().openOutputStream(result.getData().getData())) {
      out.write(Base64.decode(call.getString("base64", ""), Base64.DEFAULT));
      call.resolve();
    } catch (Exception e) {
      call.reject("Cannot save file: " + e.getMessage());
    }
  }

  @Override
  protected void handleOnDestroy() {
    finishScan("App closed");
    close("App closed");
    try {
      getContext().unregisterReceiver(usbReceiver);
      getContext().unregisterReceiver(bondReceiver);
    } catch (SecurityException ignored) {
    } catch (Exception ignored) {
    }
    usbExecutor.shutdownNow();
    super.handleOnDestroy();
  }
}
