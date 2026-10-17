#pragma once
#include <Arduino.h>
#include <map>
#include <functional>
enum HTTPMethod {HTTP_ANY,HTTP_GET,HTTP_POST};
class WebServer {
public:
 std::map<std::pair<String,HTTPMethod>,std::function<void()>> routes;
 std::map<String,String> arguments;
 int code=0;String response;
 void on(const char* path,HTTPMethod method,std::function<void()> handler){routes[{path,method}]=handler;}
 String arg(const String& name)const{auto it=arguments.find(name);return it==arguments.end()?String():it->second;}
 void send(int status,const char*,const String& value){code=status;response=value;}
};
