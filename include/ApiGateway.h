#pragma once
#include <Arduino.h>
#include <ArduinoJson.h>
#include <WebServer.h>
#include <functional>
#include <vector>

// One set of API handlers owns storage and retry state for HTTP and BLE.
// Dispatch runs on loop(), never on the Bluetooth host callback thread.
class ApiGateway {
  struct Route {String path;HTTPMethod method;std::function<void()> handler;};
  WebServer& web;
  std::vector<Route> routes;
  bool remote=false;
  int requestId=0;
  JsonVariantConst body;
  String query,response;
  static String decode(const String& s){
    String out;out.reserve(s.length());
    for(size_t i=0;i<s.length();++i){
      if(s[i]=='%'&&i+2<s.length()&&isxdigit(s[i+1])&&isxdigit(s[i+2])){
        out+=char(strtoul(s.substring(i+1,i+3).c_str(),nullptr,16));i+=2;
      }else out+=s[i]=='+'?' ':s[i];
    }return out;
  }
public:
  explicit ApiGateway(WebServer& server):web(server){}
  void on(const char* path,HTTPMethod method,std::function<void()> handler){routes.push_back({path,method,handler});web.on(path,method,handler);}
  bool bluetoothRequest()const{return remote;}
  String arg(const String& name)const{
    if(!remote)return web.arg(name);
    size_t at=0;
    while(at<query.length()){
      int end=query.indexOf('&',at);if(end<0)end=query.length();String item=query.substring(at,end);int equal=item.indexOf('=');
      if(equal>=0&&decode(item.substring(0,equal))==name)return decode(item.substring(equal+1));at=end+1;
    }return "";
  }
  struct AppendWriter {
    String& value;
    size_t write(uint8_t byte){return value.concat(char(byte))?1:0;}
    size_t write(const uint8_t* bytes,size_t size){return value.concat(reinterpret_cast<const char*>(bytes),size)?size:0;}
  };
  void respond(int code,const JsonDocument& document){
    if(!remote){String value;serializeJson(document,value);web.send(code,"application/json",value);return;}
    response="{\"request\":"+String(requestId)+",\"data\":{\"status\":"+String(code)+",\"data\":";
    if(measureJson(document)>96000){response="{\"request\":"+String(requestId)+",\"data\":{\"status\":507,\"data\":{\"error\":\"Bluetooth response too large\"}}}\n";return;}
    AppendWriter writer{response};if(serializeJson(document,writer)!=measureJson(document)){response="{\"request\":"+String(requestId)+",\"error\":\"Not enough memory for Bluetooth response\"}\n";return;}response+="}}\n";
  }
  void error(int code,const char* message){JsonDocument d;d["error"]=message;respond(code,d);}
  bool input(JsonDocument& document){
    if(remote){if(!body.is<JsonObjectConst>()||measureJson(body)>8192){error(400,"Invalid or oversized JSON");return false;}document.set(body);return true;}
    String value=web.arg("plain");if(value.length()>8192||deserializeJson(document,value)){error(400,"Invalid or oversized JSON");return false;}return true;
  }
  String dispatch(int request,JsonVariantConst data){
    remote=true;requestId=request;response="";body=data["body"];String path=data["path"]|"",method=data["method"]|"";
    int split=path.indexOf('?');query=split<0?String():path.substring(split+1);if(split>=0)path=path.substring(0,split);
    HTTPMethod verb=method=="GET"?HTTP_GET:method=="POST"?HTTP_POST:HTTP_ANY;bool found=false;
    for(auto& route:routes)if(route.path==path&&route.method==verb){found=true;route.handler();break;}
    if(!found)error(404,"Unknown API route");else if(response.isEmpty())error(500,"API handler returned no response");
    remote=false;body=JsonVariantConst();query="";String result;std::swap(result,response);return result;
  }
};
