#include <Mesh.h>
#include <RecordName.h>
#include <DeliveryRetry.h>
#include <cassert>
#include <iostream>
#include <map>
using namespace form8;
Id id(uint8_t value){Id result{};result[0]=value;return result;}
Record record(uint8_t key=1,uint8_t priority=0,size_t size=1000){Record r{id(key),42,1,priority,0,std::string(size,'x')};r.hash=crc32(r.body);return r;}
struct Node {
  Mesh mesh;
  std::map<Id,Record> records;
  std::map<uint64_t,bool> receipts;
  bool fail=false;
  explicit Node(uint64_t n):mesh(n){
    mesh.setIncident(42);mesh.contains=[this](const Id& i){return records.count(i)>0;};
    mesh.load=[this](const Id& i,Record& r){if(!records.count(i))return false;r=records[i];return true;};
    mesh.persist=[this](const Record& r){if(fail)return false;records[r.id]=r;return true;};
    mesh.receipt=[this](const Id&,uint64_t who,uint32_t,bool human){receipts[who]=human;};
  }
};
void exchange(Node& a,Node& b,uint32_t now){Frame f;while(a.mesh.next(now,f)){auto bytes=encode(f);b.mesh.receive(bytes.data(),bytes.size(),now,0);}}
int main(){
  DeliveryRetry retry;
  const Id retryId=id(90);uint32_t completedAt=100;
  assert(retry.due(retryId,completedAt));
  for(unsigned attempt=1;attempt<=5;++attempt){
    retry.queued(retryId);assert(!retry.due(retryId,completedAt+100000));
    retry.sent(retryId,completedAt);
    uint32_t delay=attempt<4?ACK_LISTEN_MS:RETRY_INTERVAL_MS;
    assert(!retry.due(retryId,completedAt+delay-1));
    assert(retry.due(retryId,completedAt+delay));completedAt+=delay+500;
  }
  retry.cancel(retryId);assert(retry.due(retryId,0));
  retry.queued(retryId);retry.sent(retryId,UINT32_MAX-1000);
  assert(!retry.due(retryId,1998));assert(retry.due(retryId,1999));
  retry.clear();assert(retry.due(retryId,0));
  for(unsigned seed=0;seed<256;++seed){
    Id originalId{};for(size_t i=0;i<originalId.size();++i)originalId[i]=uint8_t(seed+i*17);
    auto name=recordName(originalId);Id decoded{};
    assert(name.size()==22 && name.size()+std::string(".meta.tmp").size()<=32);
    assert(parseRecordName(name,decoded) && decoded==originalId);
  }
  Id invalid{};
  assert(!parseRecordName(std::string(21,'A'),invalid));
  assert(!parseRecordName(std::string(22,'/'),invalid));
  assert(!parseRecordName(std::string(21,'A')+"B",invalid));
  assert(crc32("123456789")==0xcbf43926);
  Node source(1);auto original=record();assert(source.mesh.publish(original));
  std::vector<Frame> fragments;Frame f;
  while(source.mesh.next(100,f)){auto bytes=encode(f);Frame decoded;assert(decode(bytes.data(),bytes.size(),decoded));fragments.push_back(decoded);bytes.back()^=1;assert(!decode(bytes.data(),bytes.size(),decoded));}
  assert(fragments.size()==7);
  Reassembler reassembly;Record result;int completed=0;
  for(auto it=fragments.rbegin();it!=fragments.rend();++it)completed+=reassembly.accept(*it,100,result);
  assert(completed==1 && result.body==original.body);
  Frame bad=fragments[0];bad.part=255;assert(!valid(bad));bad=fragments[0];bad.total=65535;assert(encode(bad).empty());
  for(size_t length=0;length<54;++length){uint8_t bytes[54]{};assert(!decode(bytes,length,bad));}
  // A -> B -> C, with receipts making the return trip through B.
  Node a(1),b(2),c(3);a.records[original.id]=original;a.mesh.publish(original);
  for(uint32_t now=1;now<20;++now){
    exchange(a,b,now);
    while(b.mesh.next(now,f)){auto bytes=encode(f);a.mesh.receive(bytes.data(),bytes.size(),now,0);c.mesh.receive(bytes.data(),bytes.size(),now,0);}
    exchange(c,b,now);
  }
  assert(b.records.size()==1 && c.records.size()==1);assert(a.receipts.count(2)&&a.receipts.count(3));
  // Cancel an ACKed publication without canceling control receipts.
  Node canceling(1);assert(canceling.mesh.publish(original));
  canceling.mesh.acknowledge(original.id,original.hash,false,0);
  canceling.mesh.cancelPublish(original.id);
  assert(canceling.mesh.next(0,f) && f.kind==Kind::Receipt);
  assert(!canceling.mesh.next(0,f));
  // Persist failure must never generate a receipt from that radio.
  Node failed(4);failed.fail=true;Node writer(1);writer.mesh.publish(original);exchange(writer,failed,100);
  bool falseReceipt=false;while(failed.mesh.next(100,f))if(f.kind==Kind::Receipt && f.origin==4)falseReceipt=true;assert(!falseReceipt);
  // An inventory repairs a disconnected node, and supplies an implicit receipt.
  Node holder(1),late(5);holder.records[original.id]=original;holder.mesh.inventory({{original.id,original.hash}},200);
  for(uint32_t now=200;now<220;++now){exchange(holder,late,now);exchange(late,holder,now);}
  assert(late.records.count(original.id));
  // A different incident does not consume or relay form bodies.
  Node other(6);other.mesh.setIncident(99);Node sender(1);sender.mesh.publish(original);exchange(sender,other,300);assert(other.records.empty() && other.mesh.pending()==0);
  // Incident advertisements reach and relay through nodes in other incidents,
  // including a node that has not joined any incident yet.
  const std::string announcement="{\"callsign\":\"TEST1\",\"name\":\"Test incident\"}";
  unsigned discovered=0;Node unjoined(7);unjoined.mesh.setIncident(0);
  auto discover=[&](const Frame& hello){
    assert(hello.kind==Kind::Hello && hello.incident==42 && hello.origin==1);
    assert(std::string(hello.payload.begin(),hello.payload.end())==announcement);++discovered;
  };
  other.mesh.hello=discover;unjoined.mesh.hello=discover;
  sender.mesh.announce(announcement,301);exchange(sender,other,301);exchange(other,unjoined,301);
  assert(discovered==2 && other.mesh.activeIncident()==99 && unjoined.mesh.activeIncident()==0);
  // The firmware must keep listening when idle or waiting for relay jitter.
  Node listening(8);assert(!listening.mesh.ready(100));
  assert(listening.mesh.queueFrame(listening.mesh.control(Kind::Receipt,id(1),1),100,500));
  assert(listening.mesh.pending()==1 && !listening.mesh.ready(599));
  assert(listening.mesh.ready(600));assert(listening.mesh.next(600,f));assert(!listening.mesh.ready(600));
  assert(listening.mesh.publish(original));assert(listening.mesh.ready(601));
  Node wrapReady(9);assert(wrapReady.mesh.queueFrame(wrapReady.mesh.control(Kind::Receipt,id(1),1),UINT32_MAX-10,20));
  assert(!wrapReady.mesh.ready(UINT32_MAX-1));assert(!wrapReady.mesh.ready(8));assert(wrapReady.mesh.ready(9));
  // Emergency goes first; the oldest routine job still progresses within eight selections.
  Node priorities(1);priorities.mesh.publish(record(1,0,4096));priorities.mesh.publish(record(2,3,4096));
  assert(priorities.mesh.next(1,f)&&f.priority==3);bool routine=false;for(int i=0;i<7;++i){assert(priorities.mesh.next(1,f));routine|=f.priority==0;}assert(routine);
  // Bounded queues and reassembly slots, timeout and wraparound handling.
  Node bounded(1);for(size_t i=0;i<MAX_QUEUE;++i)assert(bounded.mesh.queueFrame(bounded.mesh.control(Kind::Request,id(1),1),0));assert(!bounded.mesh.queueFrame(bounded.mesh.control(Kind::Request,id(1),1),0));
  // A failed advertisement enqueue must be reported so firmware retries it.
  assert(!bounded.mesh.announce(announcement,0));assert(bounded.mesh.next(0,f));assert(bounded.mesh.announce(announcement,0));
  Node switching(1);switching.mesh.publish(original);switching.mesh.setIncident(99);assert(switching.mesh.pending()==0);
  Reassembler expired;assert(!expired.accept(fragments[0],0,result));for(size_t i=1;i<fragments.size();++i)assert(!expired.accept(fragments[i],120001,result));
  std::cout<<"Mesh tests passed: codec, corruption, bounds, reassembly, multi-hop receipts, durable-save failure, partition repair, incident isolation, fairness, switching.\n";
}
