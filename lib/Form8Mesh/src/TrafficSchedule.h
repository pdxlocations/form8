#pragma once
#include <Mesh.h>
#include <map>

namespace form8 {
constexpr uint32_t DISCOVERY_HELLO_COOLDOWN_MS=30000;
constexpr uint32_t PEER_ONLINE_MS=5400000;
constexpr uint32_t INVENTORY_INTERVAL_MS=900000,INVENTORY_JITTER_MS=180000;
constexpr uint32_t REPAIR_PAGE_MS=30000,REPAIR_JITTER_MS=15000,REPAIR_COOLDOWN_MS=600000;
constexpr uint32_t CONTROL_QUEUE_RETRY_MS=2000,HUMAN_ACK_RECOVERY_MS=1800000;
class BroadcastSchedule {
  bool helloPending=false,helloSent=false,repairPending=false,repairSent=false;
  uint32_t helloLast=0,helloAttempt=0,inventoryNext=0,repairAt=0,repairNext=0;
  size_t repairPages=0;
public:
  void reset(uint32_t now,bool startup=false){
    if(startup){helloPending=true;helloSent=false;helloAttempt=now;}
    repairPending=false;repairSent=false;repairPages=0;
    inventoryNext=now+INVENTORY_INTERVAL_MS;
  }
  void nodeHeard(uint32_t now,uint32_t random){
    if(helloPending)return; // Coalesce a group of arrivals into one response.
    uint32_t delay=1000+random%4001;
    if(helloSent && uint32_t(now-helloLast)<DISCOVERY_HELLO_COOLDOWN_MS)
      delay=std::max(delay,DISCOVERY_HELLO_COOLDOWN_MS-uint32_t(now-helloLast));
    helloPending=true;helloAttempt=now+delay;
  }
  void discover(bool sameIncident,uint32_t now=0,uint32_t random=0){if(sameIncident && !repairPages && !repairPending){repairPending=true;repairNext=now+5000+random%10001;}}
  bool helloDue(uint32_t now) const{
    return helloPending && int32_t(now-helloAttempt)>=0;
  }
  void helloQueued(uint32_t now){helloPending=false;helloSent=true;helloLast=now;}
  void helloFailed(uint32_t now){helloAttempt=now+CONTROL_QUEUE_RETRY_MS;}
  bool inventoryDue(uint32_t now) const{
    return (repairPending && int32_t(now-repairNext)>=0 && (!repairSent || uint32_t(now-repairAt)>=REPAIR_COOLDOWN_MS)) || int32_t(now-inventoryNext)>=0;
  }
  bool beginInventory(uint32_t now,size_t records){
    if(repairPending && int32_t(now-repairNext)>=0 && !repairPages && (!repairSent || uint32_t(now-repairAt)>=REPAIR_COOLDOWN_MS)){
      repairPending=false;repairSent=true;repairAt=now;repairPages=(records+7)/8;return true;
    }
    return false;
  }
  bool repairing() const{return repairPages>0;}
  void inventoryQueued(uint32_t now,uint32_t random){
    if(repairPages)--repairPages;
    inventoryNext=now+(repairPages?REPAIR_PAGE_MS:INVENTORY_INTERVAL_MS)+random%((repairPages?REPAIR_JITTER_MS:INVENTORY_JITTER_MS)+1);
  }
  void inventoryFailed(uint32_t now){inventoryNext=now+CONTROL_QUEUE_RETRY_MS;}
};
class HumanAckRetries {
  struct Entry {uint32_t hash=0,next=0,last=0;uint8_t remaining=0;};
  std::map<Id,Entry> entries;
public:
  void clear(){entries.clear();}
  void begin(const Id& id,uint32_t hash,uint32_t now,bool queued){entries[id]={hash,queued?now+15000:now,now,uint8_t(queued?2:3)};}
  template<typename Send> void service(uint32_t now,Send send){
    for(auto& item:entries){auto& e=item.second;if(!e.remaining || int32_t(now-e.next)<0)continue;
      if(!send(item.first,e.hash)){e.next=now+CONTROL_QUEUE_RETRY_MS;continue;}
      --e.remaining;e.last=now;e.next=now+(e.remaining==2?15000:e.remaining==1?45000:HUMAN_ACK_RECOVERY_MS);
    }
  }
  bool recoveryDue(const Id& id,uint32_t now) const{
    auto found=entries.find(id);return found==entries.end() || (!found->second.remaining && uint32_t(now-found->second.last)>=HUMAN_ACK_RECOVERY_MS);
  }
  void recovered(const Id& id,uint32_t hash,uint32_t now){
    auto found=entries.find(id);
    if(found==entries.end())entries[id]={hash,0,now,0};else found->second.last=now;
  }
};
}
