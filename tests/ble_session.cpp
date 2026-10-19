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
 // A hotspot association pauses BLE until the LAST Wi-Fi client leaves.
 auto& advertising=NimBLEDevice::advertising;
 bridge.poll([](const String&){return String();});assert(advertising.active);
 bridge.setAccessPointOccupied(true);bridge.poll([](const String&){return String();});
 assert(!advertising.active);const int starts=advertising.starts;
 bridge.setAccessPointOccupied(true);bridge.poll([](const String&){return String();});
 assert(!advertising.active&&advertising.starts==starts);
 // A delayed connection/pairing callback cannot override Wi-Fi ownership.
 const int before=server.disconnects;
 server.callbacks->onConnect(&server,&peer);assert(server.disconnects==before+1);
 server.callbacks->onAuthenticationComplete(&peer);assert(!bridge.isConnected());
 bridge.poll([](const String&){assert(false);return String();});assert(!advertising.active);
 bridge.setAccessPointOccupied(false);bridge.poll([](const String&){return String();});
 assert(advertising.active&&advertising.starts==starts+1);
 // Wi-Fi also wins if it associates during an unfinished BLE pairing.
 server.callbacks->onConnect(&server,&peer);
 bridge.setAccessPointOccupied(true);bridge.poll([](const String&){assert(false);return String();});
 assert(!bridge.isConnected()&&!advertising.active);
 bridge.setAccessPointOccupied(false);bridge.poll([](const String&){return String();});assert(advertising.active);
 std::cout<<"BLE session timing and Wi-Fi ownership checks passed.\n";
}
