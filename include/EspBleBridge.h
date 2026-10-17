#pragma once
#include <Arduino.h>
#include <NimBLEDevice.h>
#include <atomic>
#include <functional>
#include <freertos/FreeRTOS.h>
#include <freertos/queue.h>

class EspBleBridge {
  static constexpr size_t CHUNK=244,BLE_LINE_LIMIT=16384;
  struct Fragment{uint16_t size;uint8_t bytes[CHUNK];};
  QueueHandle_t incoming=nullptr;
  NimBLECharacteristic* tx=nullptr;
  std::atomic<bool> connected{false},authorized{false},subscribed{false},overflow{false};
  std::atomic<uint16_t> payload{20},handle{0};
  std::atomic<uint32_t> generation{0},lastActivity{0};
  uint32_t observedGeneration=0,lastNotify=0;
  String input,output;size_t outputAt=0;
  class Connections:public NimBLEServerCallbacks{
    EspBleBridge& owner;
  public:
    explicit Connections(EspBleBridge& bridge):owner(bridge){}
    void onConnect(NimBLEServer* server,ble_gap_conn_desc* peer)override{
      xQueueReset(owner.incoming);owner.handle=peer->conn_handle;owner.payload=20;owner.subscribed=false;owner.authorized=false;owner.overflow=false;owner.lastActivity=millis();owner.connected=true;++owner.generation;
      server->updateConnParams(peer->conn_handle,12,24,0,200);NimBLEDevice::startSecurity(peer->conn_handle);
    }
    void onDisconnect(NimBLEServer*)override{owner.connected=false;owner.authorized=false;owner.subscribed=false;++owner.generation;NimBLEDevice::startAdvertising();}
    void onAuthenticationComplete(ble_gap_conn_desc* peer)override{
      if(peer->sec_state.encrypted&&peer->sec_state.authenticated){owner.lastActivity=millis();owner.authorized=true;Serial.println("Bluetooth pairing authenticated.");}
      else{Serial.println("Bluetooth disconnect: pairing did not authenticate.");NimBLEDevice::getServer()->disconnect(peer->conn_handle);}
    }
    void onMTUChange(uint16_t mtu,ble_gap_conn_desc*)override{owner.payload=std::min(size_t(CHUNK),size_t(mtu>3?mtu-3:20));}
  } connections{*this};
  class Writes:public NimBLECharacteristicCallbacks{
    EspBleBridge& owner;
  public:
    explicit Writes(EspBleBridge& bridge):owner(bridge){}
    void onWrite(NimBLECharacteristic* characteristic)override{
      owner.lastActivity=millis();auto value=characteristic->getValue();
      for(size_t at=0;at<value.size();at+=CHUNK){Fragment fragment{};fragment.size=std::min(CHUNK,value.size()-at);memcpy(fragment.bytes,value.data()+at,fragment.size);if(xQueueSend(owner.incoming,&fragment,0)!=pdTRUE){owner.overflow=true;break;}}
    }
    void onSubscribe(NimBLECharacteristic*,ble_gap_conn_desc*,uint16_t value)override{owner.subscribed=(value&1)!=0;}
  } writes{*this};
public:
  bool available=false;
  bool isConnected()const{return connected&&authorized;}
  bool begin(const String& name,uint32_t pin){
    incoming=xQueueCreate(64,sizeof(Fragment));if(!incoming)return false;
    NimBLEDevice::init(name.c_str());NimBLEDevice::setMTU(247);NimBLEDevice::setSecurityAuth(true,true,true);NimBLEDevice::setSecurityIOCap(BLE_HS_IO_DISPLAY_ONLY);NimBLEDevice::setSecurityPasskey(pin);
    auto server=NimBLEDevice::createServer();server->setCallbacks(&connections,false);
    auto service=server->createService("6e400001-b5a3-f393-e0a9-e50e24dcca9e");
    auto rx=service->createCharacteristic("6e400002-b5a3-f393-e0a9-e50e24dcca9e",NIMBLE_PROPERTY::WRITE|NIMBLE_PROPERTY::WRITE_ENC|NIMBLE_PROPERTY::WRITE_AUTHEN,512);
    tx=service->createCharacteristic("6e400003-b5a3-f393-e0a9-e50e24dcca9e",NIMBLE_PROPERTY::NOTIFY,CHUNK);
    rx->setCallbacks(&writes);tx->setCallbacks(&writes);auto pairing=service->createCharacteristic("6e400004-b5a3-f393-e0a9-e50e24dcca9e",NIMBLE_PROPERTY::READ);pairing->setValue("Form8 ESP32: pairing PIN is last 6 digits of Wi-Fi password");service->start();
    auto advertising=NimBLEDevice::getAdvertising();advertising->addServiceUUID(service->getUUID());advertising->setScanResponse(true);advertising->setMinInterval(160);advertising->setMaxInterval(240);available=advertising->start();return available;
  }
  void poll(const std::function<String(const String&)>& dispatch){
    if(!available)return;
    auto current=generation.load();if(current!=observedGeneration){observedGeneration=current;input="";output="";outputAt=0;}
    if(!connected)return;
    // Read the callback timestamp before the clock. A BLE write can advance it
    // between reads; subtracting that future timestamp would wrap to ~49 days.
    const uint32_t activity=lastActivity.load();
    const uint32_t now=millis();
    if(overflow||uint32_t(now-activity)>(authorized?30000:60000)){
      Serial.printf("Bluetooth disconnect: %s (idle %lu ms).\n",overflow?"receive buffer overflow":"session timeout",static_cast<unsigned long>(now-activity));
      NimBLEDevice::getServer()->disconnect(handle);return;
    }
    if(!authorized)return;
    if(outputAt<output.length()){
      if(subscribed&&uint32_t(millis()-lastNotify)>=5){size_t size=std::min(size_t(payload.load()),output.length()-outputAt);auto buffer=ble_hs_mbuf_from_flat(output.c_str()+outputAt,size);if(buffer&&ble_gattc_notify_custom(handle.load(),tx->getHandle(),buffer)==0)outputAt+=size;lastNotify=millis();}
      return;
    }
    output="";outputAt=0;Fragment fragment{};
    for(size_t count=0;count<8&&xQueueReceive(incoming,&fragment,0)==pdTRUE;++count){
      for(size_t i=0;i<fragment.size;++i){char c=fragment.bytes[i];if(c=='\r')continue;
        if(c=='\n'){if(input.length()&&connected){output=dispatch(input);input="";if(output.length())return;}}
        else if(input.length()<BLE_LINE_LIMIT)input+=c;
        else{overflow=true;return;}
      }
    }
  }
};
