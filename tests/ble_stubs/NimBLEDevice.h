#pragma once
#include <Arduino.h>
#include <map>
struct ble_gap_conn_desc {uint16_t conn_handle=1;struct {bool encrypted=true,authenticated=true;} sec_state;};
struct NimBLEServer;struct NimBLECharacteristic;
struct NimBLEServerCallbacks {
 virtual ~NimBLEServerCallbacks()=default;
 virtual void onConnect(NimBLEServer*,ble_gap_conn_desc*){} virtual void onDisconnect(NimBLEServer*){}
 virtual void onAuthenticationComplete(ble_gap_conn_desc*){} virtual void onMTUChange(uint16_t,ble_gap_conn_desc*){}
};
struct NimBLECharacteristicCallbacks {
 virtual ~NimBLECharacteristicCallbacks()=default;
 virtual void onWrite(NimBLECharacteristic*){} virtual void onSubscribe(NimBLECharacteristic*,ble_gap_conn_desc*,uint16_t){}
};
struct NIMBLE_PROPERTY {static constexpr int WRITE=1,WRITE_ENC=2,WRITE_AUTHEN=4,NOTIFY=8,READ=16;};
#define BLE_HS_IO_DISPLAY_ONLY 0
struct NimBLECharacteristic {
 std::string value;NimBLECharacteristicCallbacks* callbacks=nullptr;
 void setCallbacks(NimBLECharacteristicCallbacks* c){callbacks=c;} std::string getValue(){return value;}
 void setValue(const char* v){value=v;} uint16_t getHandle(){return 1;}
};
struct NimBLEService {
 std::map<std::string,NimBLECharacteristic> chars;
 NimBLECharacteristic* createCharacteristic(const char* id,int,size_t=0){return &chars[id];}
 const char* getUUID(){return "test";} void start(){}
};
struct NimBLEServer {
 NimBLEServerCallbacks* callbacks=nullptr;NimBLEService service;int disconnects=0;
 void setCallbacks(NimBLEServerCallbacks* c,bool){callbacks=c;}
 void updateConnParams(uint16_t,int,int,int,int){} NimBLEService* createService(const char*){return &service;}
 void disconnect(uint16_t){disconnects++;callbacks->onDisconnect(this);}
};
struct NimBLEAdvertising {void addServiceUUID(const char*){} void setScanResponse(bool){} void setMinInterval(int){} void setMaxInterval(int){} bool start(){return true;}};
struct NimBLEDevice {
 static inline NimBLEServer server;static inline NimBLEAdvertising advertising;
 static void init(const char*){} static void setMTU(int){} static void setSecurityAuth(bool,bool,bool){} static void setSecurityIOCap(int){} static void setSecurityPasskey(uint32_t){}
 static NimBLEServer* createServer(){return &server;} static NimBLEServer* getServer(){return &server;} static NimBLEAdvertising* getAdvertising(){return &advertising;}
 static void startSecurity(uint16_t){} static void startAdvertising(){}
};
inline void* ble_hs_mbuf_from_flat(const void* value,size_t){return const_cast<void*>(value);}
inline int ble_gattc_notify_custom(uint16_t,uint16_t,void*){return 0;}
