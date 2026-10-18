#pragma once
#include <Mesh.h>
#include <map>

namespace form8 {
constexpr uint32_t ACK_LISTEN_MS=3000, RETRY_INTERVAL_MS=60000;
constexpr uint32_t RETRY_BACKOFF_MS=300000,RETRY_MAX_INTERVAL_MS=900000;
inline uint32_t deliveryRetryDelay(unsigned attempts){
  return attempts<=1?RETRY_INTERVAL_MS:attempts==2?RETRY_BACKOFF_MS:RETRY_MAX_INTERVAL_MS;
}
class DeliveryRetry {
  struct State { uint32_t due=0; uint8_t attempts=0; bool queued=false; };
  std::map<Id,State> states;
public:
  void clear(){states.clear();}
  void cancel(const Id& id){states.erase(id);}
  bool due(const Id& id,uint32_t now) const {
    auto it=states.find(id);
    return it==states.end() || (!it->second.queued && int32_t(now-it->second.due)>=0);
  }
  void queued(const Id& id){states[id].queued=true;}
  // Called after the last fragment finishes transmitting, not when queued.
  void sent(const Id& id,uint32_t now){
    auto it=states.find(id);if(it==states.end())return;
    auto& s=it->second;s.queued=false;if(s.attempts<6)++s.attempts;
    s.due=now+deliveryRetryDelay(s.attempts);
  }
};
}
