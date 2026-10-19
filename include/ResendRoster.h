#pragma once
#include <ArduinoJson.h>
#include <Arduino.h>

namespace form8 {
// Extend the saved matrix without resetting delivery evidence or changing the
// callsign snapshot used to recognize an addressed recipient after a rename.
inline bool addResendStation(JsonDocument& meta,const String& self,const String& id,const String& callsign) {
  if(!id.length() || id==self)return false;
  JsonArray expected=meta["expected"].as<JsonArray>();
  if(expected.isNull())expected=meta["expected"].to<JsonArray>();
  for(JsonObject station:expected)if(String(station["id"]|"")==id){
    if(!String(station["callsign"]|"").length() && callsign.length()){station["callsign"]=callsign;return true;}
    return false;
  }
  JsonObject station=expected.add<JsonObject>();station["id"]=id;station["callsign"]=callsign;return true;
}
}
