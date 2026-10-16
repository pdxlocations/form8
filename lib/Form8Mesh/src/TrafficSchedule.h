#pragma once
#include <Mesh.h>
#include <map>

namespace form8 {
constexpr uint32_t HELLO_INTERVAL_MS=120000,HELLO_JITTER_MS=30000,HELLO_RESPONSE_COOLDOWN_MS=30000;
constexpr uint32_t PEER_ONLINE_MS=600000;
constexpr uint32_t INVENTORY_INTERVAL_MS=300000,INVENTORY_JITTER_MS=60000;
constexpr uint32_t REPAIR_PAGE_MS=10000,REPAIR_JITTER_MS=2000,REPAIR_COOLDOWN_MS=120000;
constexpr uint32_t CONTROL_QUEUE_RETRY_MS=2000,HUMAN_ACK_RECOVERY_MS=1800000;
class BroadcastSchedule {
  bool helloPending=true,helloSent=false,repairPending=false,repairSent=false;
  uint32_t helloAt=0,helloNext=0,helloAttempt=0,inventoryNext=0,repairAt=0;
  size_t repairPages=0;
public:
  void reset(uint32_t now){
    helloPending=true;helloSent=false;repairPending=false;repairSent=false;repairPages=0;
    helloAttempt=now;inventoryNext=now+INVENTORY_INTERVAL_MS;
  }
  void discover(bool sameIncident){helloPending=true;if(sameIncident && !repairPages)repairPending=true;}
  bool helloDue(uint32_t now) const{
    if(int32_t(now-helloAttempt)<0)return false;
    return helloPending?(!helloSent || uint32_t(now-helloAt)>=HELLO_RESPONSE_COOLDOWN_MS):int32_t(now-helloNext)>=0;
  }
  void helloQueued(uint32_t now,uint32_t random){helloPending=false;helloSent=true;helloAt=now;helloNext=now+HELLO_INTERVAL_MS+random%(HELLO_JITTER_MS+1);}
  void helloFailed(uint32_t now){helloAttempt=now+CONTROL_QUEUE_RETRY_MS;}
  bool inventoryDue(uint32_t now) const{
    return (repairPending && (!repairSent || uint32_t(now-repairAt)>=REPAIR_COOLDOWN_MS)) || int32_t(now-inventoryNext)>=0;
  }
  bool beginInventory(uint32_t now,size_t records){
    if(repairPending && !repairPages && (!repairSent || uint32_t(now-repairAt)>=REPAIR_COOLDOWN_MS)){
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
