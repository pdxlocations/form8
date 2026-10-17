#define ARDUINOJSON_ENABLE_ARDUINO_STRING 1
#include <ApiGateway.h>
#include <cassert>
#include <iostream>
int main(){
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
