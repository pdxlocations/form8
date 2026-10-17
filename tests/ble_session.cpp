#include <EspBleBridge.h>
#include <cassert>
#include <iostream>
uint32_t clockMs=1000;
std::function<void()> clockHook;
uint32_t millis(){const auto snapshot=clockMs;if(clockHook){auto hook=std::move(clockHook);clockHook={};hook();}return snapshot;}
int main(){
 EspBleBridge bridge;assert(bridge.begin("Test",123456));
 auto& server=NimBLEDevice::server;ble_gap_conn_desc peer;
 server.callbacks->onConnect(&server,&peer);server.callbacks->onAuthenticationComplete(&peer);
 auto& rx=server.service.chars.at("6e400002-b5a3-f393-e0a9-e50e24dcca9e");
 rx.value="request\n";
 // Deterministically interleave a BLE write between the main-loop clock read
 // and the old activity read. The old subtraction wraps and disconnects.
 clockHook=[&]{++clockMs;rx.callbacks->onWrite(&rx);};
 int requests=0;bridge.poll([&](const String&){requests++;return String("reply\n");});
 assert(server.disconnects==0);assert(bridge.isConnected());assert(requests==1);
 clockMs+=30001;bridge.poll([](const String&){return String();});
 assert(server.disconnects==1);assert(!bridge.isConnected());
 // Clock rollover still expires normally after an actual idle interval.
 clockMs=0xfffffff0;server.callbacks->onConnect(&server,&peer);server.callbacks->onAuthenticationComplete(&peer);
 clockMs=0x20;bridge.poll([](const String&){return String();});assert(server.disconnects==1);
 clockMs+=30001;bridge.poll([](const String&){return String();});assert(server.disconnects==2);
 std::cout<<"BLE session race and idle expiry checks passed.\n";
}
