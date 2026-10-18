#define ARDUINOJSON_ENABLE_ARDUINO_STRING 1
#include <ApiGateway.h>
#include <DeliveryPolicy.h>
#include <TrafficOrder.h>
#include <algorithm>
#include <vector>
#include <cassert>
#include <iostream>
int main(){
 // Traffic order is newest first even with random IDs and unsynchronized clocks.
 std::vector<std::pair<form8::TrafficOrder,int>> traffic;
 for(int i=1;i<=25;++i)traffic.push_back({{static_cast<uint32_t>(i),100-i,0},26-i});
 traffic.push_back({{0,2000000000,9},99}); // Legacy timestamp cannot outrank new local order.
 std::sort(traffic.begin(),traffic.end());
 assert(traffic.front().second==1 && traffic[19].second==20 && traffic[20].second==21 && traffic.back().second==99);
 assert((form8::TrafficOrder{0,200,0}<form8::TrafficOrder{0,100,9}));
 assert((form8::TrafficOrder{0,0,9}<form8::TrafficOrder{0,0,8}));
 // Exercise the actual ESP32 policy used for retries, outgoing count and LCD.
 JsonDocument delivery;
 auto match=[](const String& id,const String& call){return id=="known" && call=="TARGET";};
 assert(!deserializeJson(delivery,R"({"recipient":"*","expected":[{"id":"gone","callsign":"OFFLINE"},{"id":"remote","callsign":"REMOTE"}],"receipts":[{"id":"self"}]})"));
 assert(form8::formDeliveryPending(delivery,String("self"),match));
 JsonObject receipt=delivery["receipts"].add<JsonObject>();receipt["id"]="remote";
 assert(!form8::formDeliveryPending(delivery,String("self"),match));
 delivery["recipient"]="TARGET";assert(form8::formDeliveryPending(delivery,String("self"),match));
 receipt["id"]="known";assert(!form8::formDeliveryPending(delivery,String("self"),match));
 receipt["id"]="other";receipt["callsign"]="TARGET";assert(!form8::formDeliveryPending(delivery,String("self"),match));
 receipt["id"]="self";assert(form8::formDeliveryPending(delivery,String("self"),match));
 receipt["id"]="gone";delivery["expected"][0]["callsign"]="TARGET";receipt["callsign"]="";assert(!form8::formDeliveryPending(delivery,String("self"),match));
 WebServer server;ApiGateway api(server);std::string saved;
 api.on("/api/forms",HTTP_POST,[&](){JsonDocument body;if(!api.input(body))return;saved=body["message"].as<std::string>();JsonDocument out;out["saved"]=true;out["message"]=saved;api.respond(201,out);});
 api.on("/api/form",HTTP_GET,[&](){JsonDocument out;out["body"]=saved;out["id"]=api.arg("id");api.respond(200,out);});
 JsonDocument request,response;request["method"]="POST";request["path"]="/api/forms";request["body"]["message"]="Hello 👋\nquoted \"text\"";
 String wire=api.dispatch(7,request.as<JsonVariantConst>());assert(!deserializeJson(response,wire));assert(response["request"]==7);assert(response["data"]["status"]==201);assert(response["data"]["data"]["saved"]==true);assert(saved=="Hello 👋\nquoted \"text\"");
 // The HTTP client sees the exact body saved by BLE, using the same handler.
 server.arguments["id"]="wifi";server.routes.at({"/api/form",HTTP_GET})();assert(server.code==200);assert(!deserializeJson(response,server.response));assert(response["body"].as<std::string>()==saved);assert(response["id"]=="wifi");
 request.clear();request["method"]="GET";request["path"]="/api/form?id=a%2Bb+space";wire=api.dispatch(8,request.as<JsonVariantConst>());assert(!deserializeJson(response,wire));assert(response["data"]["data"]["id"]=="a+b space");assert(!api.bluetoothRequest());
 request["method"]="DELETE";wire=api.dispatch(9,request.as<JsonVariantConst>());assert(!deserializeJson(response,wire));assert(response["data"]["status"]==404);
 request["method"]="POST";request["path"]="/api/forms";request["body"].to<JsonObject>()["message"]=std::string(9000,'x');wire=api.dispatch(10,request.as<JsonVariantConst>());assert(!deserializeJson(response,wire));assert(response["data"]["status"]==400);assert(saved=="Hello 👋\nquoted \"text\"");
 // HTTP save followed by BLE read is also shared and serialization preserves framing.
 server.arguments["plain"]="{\"message\":\"Wi-Fi saved\"}";server.routes.at({"/api/forms",HTTP_POST})();assert(server.code==201);
 request.clear();request["method"]="GET";request["path"]="/api/form?id=test";wire=api.dispatch(11,request.as<JsonVariantConst>());assert(!deserializeJson(response,wire));assert(response["data"]["data"]["body"]=="Wi-Fi saved");assert(wire.back()=='\n');
 std::cout<<"API gateway tests passed: shared HTTP/BLE storage, Unicode, framing, query decoding, bad routes and rejected writes.\n";
}
