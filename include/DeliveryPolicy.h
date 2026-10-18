#pragma once
#include <ArduinoJson.h>
#include <Arduino.h>

namespace form8 {
// Broadcast delivery needs one durable remote copy. Keep the roster for the
// per-station matrix; offline roster entries must not prolong full-form retries.
template<typename MatchesPeer>
bool formDeliveryPending(const JsonDocument& meta,const String& self,MatchesPeer matchesPeer) {
  const String recipient=meta["recipient"]|"*";
  for(JsonObjectConst receipt:meta["receipts"].as<JsonArrayConst>()) {
    const String who=receipt["id"]|"";
    if(!who.length() || who==self)continue;
    if(recipient=="*" || String(receipt["callsign"]|"")==recipient)return false;
    for(JsonObjectConst expected:meta["expected"].as<JsonArrayConst>())
      if(String(expected["id"]|"")==who && String(expected["callsign"]|"")==recipient)return false;
    if(matchesPeer(who,recipient))return false;
  }
  return true;
}
}
