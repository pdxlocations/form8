#include <Mesh.h>
#include <NodeId.h>
#include <RecordName.h>
#include <DeliveryRetry.h>
#include <TrafficSchedule.h>
#include <Chat.h>
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
  std::map<Id,Record> chats;
  std::map<uint64_t,bool> chatReceipts;
  bool fail=false;
  explicit Node(uint64_t n):mesh(n){
    mesh.setIncident(42);mesh.setRelayEnabled(true);mesh.contains=[this](const Id& i){return records.count(i)>0;};
    mesh.load=[this](const Id& i,Record& r){if(!records.count(i))return false;r=records[i];return true;};
    mesh.persist=[this](const Record& r){if(fail)return false;records[r.id]=r;return true;};
    mesh.receipt=[this](const Id&,uint64_t who,uint32_t,bool human){receipts[who]=human;};
    mesh.chatContains=[this](const Id& i,uint32_t hash){return chats.count(i) && chats[i].hash==hash;};
    mesh.chatPersist=[this](const Record& r){if(fail)return false;chats[r.id]=r;return true;};
    mesh.chatReceipt=[this](const Id&,uint64_t who,uint32_t){chatReceipts[who]=true;};
  }
};
void exchange(Node& a,Node& b,uint32_t now){Frame f;while(a.mesh.next(now,f)){auto bytes=encode(f);b.mesh.receive(bytes.data(),bytes.size(),now,0);a.mesh.transmitted(f,now);}}
int main(){
  {
  // ID requests cross incident boundaries, but only the addressed node replies.
  Node identityA(101),identityRelay(102),identityB(103),identityOther(104);
  identityA.mesh.setIncident(0);identityRelay.mesh.setIncident(77);identityB.mesh.setIncident(99);
  int identified=0,otherIdentified=0,hellos=0;
  identityB.mesh.identityRequested=[&](){++identified;return identityB.mesh.announce("callsign B",100);};
  identityOther.mesh.identityRequested=[&](){++otherIdentified;return true;};
  identityA.mesh.hello=[&](const Frame& f){assert(f.origin==103 && f.incident==99);++hellos;};
  assert(!identityA.mesh.requestIdentity(0,0) && !identityA.mesh.requestIdentity(101,0));
  assert(identityA.mesh.requestIdentity(103,100));
  assert(!identityA.mesh.requestIdentity(103,101));
  Frame identityFrame;assert(identityA.mesh.next(100,identityFrame));
  assert(identityFrame.kind==Kind::IdentityRequest && identityFrame.payload.size()==8 && get(identityFrame.payload.data(),8)==103);
  auto identityBytes=encode(identityFrame);Frame identityDecoded;assert(decode(identityBytes.data(),identityBytes.size(),identityDecoded));
  identityOther.mesh.receive(identityBytes.data(),identityBytes.size(),100,0);assert(otherIdentified==0);
  identityRelay.mesh.receive(identityBytes.data(),identityBytes.size(),100,0);
  identityRelay.mesh.receive(identityBytes.data(),identityBytes.size(),100,0); // duplicate relay suppression
  assert(identityRelay.mesh.pending()==1);exchange(identityRelay,identityB,100);assert(identified==1);
  exchange(identityB,identityRelay,100);exchange(identityRelay,identityA,100);assert(hellos==1);
  // A second requester cannot trigger another reply inside 30 seconds.
  assert(identityOther.mesh.requestIdentity(103,101));exchange(identityOther,identityB,101);assert(identified==1);
  assert(identityA.mesh.requestIdentity(103,30100));exchange(identityA,identityB,30100);assert(identified==2);
  identityFrame.payload.pop_back();identityFrame.total=identityFrame.payload.size();assert(!valid(identityFrame));
  // Per-target coalescing must not merge different requested node IDs.
  Node identityMulti(105);assert(identityMulti.mesh.requestIdentity(106,0));assert(identityMulti.mesh.requestIdentity(107,0));assert(identityMulti.mesh.pending()==2);
  Node identityBounded(109);
  for(uint64_t target=200;target<232;++target)assert(identityBounded.mesh.requestIdentity(target,0));
  assert(!identityBounded.mesh.requestIdentity(232,1));
  assert(identityBounded.mesh.requestIdentity(232,30000));
  Node identityFull(110);for(size_t i=0;i<MAX_QUEUE;++i)assert(identityFull.mesh.announce(std::to_string(i),0));
  assert(!identityFull.mesh.requestIdentity(111,0));while(identityFull.mesh.next(0,identityFrame)){}
  assert(identityFull.mesh.requestIdentity(111,0)); // Queue failure did not consume cooldown.
  Node identityWrap(112);assert(identityWrap.mesh.requestIdentity(113,UINT32_MAX-100));
  assert(!identityWrap.mesh.requestIdentity(113,10));assert(identityWrap.mesh.requestIdentity(113,30000));
  // A TX-off/full-queue responder does not consume its response cooldown.
  Node identityMuted(108);identityMuted.mesh.identityRequested=[](){return false;};
  assert(identityMulti.mesh.requestIdentity(108,0));exchange(identityMulti,identityMuted,0);
  int resumed=0;identityMuted.mesh.identityRequested=[&](){++resumed;return true;};
  assert(identityOther.mesh.requestIdentity(108,1));exchange(identityOther,identityMuted,1);assert(resumed==1);
  }
  assert(!canHumanAcknowledge(1,1) && !canHumanAcknowledge(1,0) && !canHumanAcknowledge(0,2) && canHumanAcknowledge(1,2));
  // Firmware handshakes, BLE names and incident IDs preserve all 64 bits
  // without relying on newlib-nano's unsupported %llx formatter.
  for(const auto& example:std::map<uint64_t,std::string>{{0,"0000000000000000"},{1,"0000000000000001"},{0x00000000ffffffffULL,"00000000ffffffff"},{0x0123456789abcdefULL,"0123456789abcdef"},{0xfedcba9876543210ULL,"fedcba9876543210"},{UINT64_MAX,"ffffffffffffffff"}}){
    const auto encoded=formatNodeId(example.first);
    assert(encoded[16]=='\0' && std::string(encoded.data())==example.second);
    assert(std::stoull(encoded.data(),nullptr,16)==example.first);
  }

  // GPS selection, compact position codec, quiet scheduling and incident isolation.
  PositionFix gps{45.52,-122.68,-1,true,true,100,0},phone{46,-123,8,false,true,200,0};
  assert(preferredPosition(gps,phone,300).radio);
  assert(!preferredPosition(gps,phone,120150).radio);
  PositionPacket position{gps,123,1,"GPS-1"},decodedPosition;
  const auto positionBytes=encodePosition(position,300);
  assert(positionBytes.size()==27 && decodePosition(positionBytes,decodedPosition,500));
  assert(std::abs(decodedPosition.fix.lat-45.52)<1e-7 && decodedPosition.fix.radio);
  assert(decodedPosition.call=="GPS-1" && decodedPosition.session==123 && decodedPosition.sequence==1);
  assert(encodePosition(position,120101).empty());
  auto badPosition=positionBytes;badPosition[0]=99;assert(!decodePosition(badPosition,decodedPosition,0));
  badPosition=positionBytes;badPosition[12]=255;badPosition[13]=255;assert(!decodePosition(badPosition,decodedPosition,0));
  badPosition=positionBytes;badPosition[22]='?';assert(!decodePosition(badPosition,decodedPosition,0));
  position.fix.lat=91;assert(encodePosition(position,300).empty());position.fix=gps;
  PositionSchedule positions;positions.reset(0);assert(positions.due(0,600));positions.queued(0);
  assert(!positions.due(599999,600));assert(positions.due(600000,600));positions.failed(600000);
  assert(!positions.due(601999,600));assert(positions.due(602000,600));
  positions.reset(UINT32_MAX-1000);positions.queued(UINT32_MAX-1000);assert(!positions.due(0,60));assert(positions.due(59000,60));
  Node positionA(100),positionB(101),positionC(102);int seenPositions=0;
  positionC.mesh.position=[&](const Frame& frame){PositionPacket p;assert(decodePosition(frame.payload,p,1000));++seenPositions;};
  Frame positionFrame=positionA.mesh.control(Kind::Position);positionFrame.payload=positionBytes;positionFrame.total=positionBytes.size();
  assert(positionA.mesh.queueFrame(positionFrame,0));assert(positionA.mesh.pending(false)==0);
  assert(positionA.mesh.next(0,positionFrame));auto wirePosition=encode(positionFrame);
  positionB.mesh.receive(wirePosition.data(),wirePosition.size(),100,0);
  assert(positionB.mesh.next(100,positionFrame));assert(positionFrame.kind==Kind::Position && positionFrame.ttl==MAX_HOPS-1);
  wirePosition=encode(positionFrame);positionC.mesh.receive(wirePosition.data(),wirePosition.size(),100,0);
  positionC.mesh.receive(wirePosition.data(),wirePosition.size(),101,0);assert(seenPositions==1);
  Node foreignPosition(103);foreignPosition.mesh.setIncident(99);foreignPosition.mesh.position=[&](const Frame&){assert(false);};
  foreignPosition.mesh.receive(wirePosition.data(),wirePosition.size(),100,0);assert(foreignPosition.mesh.pending()==0);
  Frame expiredPosition=positionA.mesh.control(Kind::Position);expiredPosition.payload=positionBytes;expiredPosition.total=positionBytes.size();
  assert(positionA.mesh.queueFrame(expiredPosition,0));assert(!positionA.mesh.next(120001,expiredPosition));
  PositionPacket almostOld{gps,123,2,"GPS-1"};almostOld.fix.age=119000;
  expiredPosition=positionA.mesh.control(Kind::Position);expiredPosition.payload=encodePosition(almostOld,100);expiredPosition.total=expiredPosition.payload.size();
  assert(positionA.mesh.queueFrame(expiredPosition,100));assert(!positionA.mesh.next(2101,expiredPosition));
  assert(positionA.mesh.queueFrame(positionFrame,0));positionA.mesh.cancelPosition();assert(positionA.mesh.pending()==0);

  // UTF-8 is bounded by bytes, with malformed sequences and control bytes rejected.
  assert(validChatText(std::string(200,'a')) && !validChatText(std::string(201,'a')));
  assert(validChatText("Hello 👋🏽\nReady ✅") && !validChatText(" \n\t"));
  std::string emojis;for(int i=0;i<50;++i)emojis+="👍";
  assert(validChatText(emojis));assert(!validChatText(emojis+"x"));
  for(const std::string& malformed:{std::string("\xc0\xaf"),std::string("\xed\xa0\x80"),std::string("\xf4\x90\x80\x80"),std::string("\xf0\x9f"),std::string("a\0b",3)})assert(!validChatText(malformed));
  assert(chatEmoji("❤️") && chatEmoji("👍") && !chatEmoji("unbounded"));
  ChatRetries chatRetry;chatRetry.begin(id(90),100);unsigned chatAttempts=0;
  auto sendChat=[&](const Id&){++chatAttempts;return true;};
  chatRetry.service(100,sendChat);chatRetry.service(1000,sendChat);assert(chatAttempts==1);
  assert(chatRetry.sent(id(90),1000)==1);chatRetry.service(15999,sendChat);assert(chatAttempts==1);
  chatRetry.service(16000,sendChat);assert(chatAttempts==2);assert(chatRetry.sent(id(90),17000)==2);
  chatRetry.service(61999,sendChat);assert(chatAttempts==2);chatRetry.service(62000,sendChat);assert(chatAttempts==3);
  assert(chatRetry.sent(id(90),63000)==3 && !chatRetry.active(id(90)));chatRetry.service(10000000,sendChat);assert(chatAttempts==3);
  chatRetry.begin(id(91),UINT32_MAX-10);chatRetry.service(UINT32_MAX-10,[](const Id&){return false;});
  chatRetry.service(1988,sendChat);assert(chatAttempts==3);chatRetry.service(1989,sendChat);assert(chatAttempts==4);
  chatRetry.interrupted(2000);chatRetry.service(2000,sendChat);assert(chatAttempts==5);chatRetry.cancel(id(91));assert(!chatRetry.active(id(91)));
  // Chat uses its own packets, durable-save ACKs and stores; forms remain untouched.
  Node chatA(1),chatB(2),chatC(3);auto chatRecord=record(92,0,400);chatRecord.kind=Kind::Chat;
  assert(chatA.mesh.publish(chatRecord));assert(chatA.mesh.pending()==1 && chatA.mesh.pending(false)==0);
  for(uint32_t now=1;now<12;++now){
    exchange(chatA,chatB,now);Frame forwarded;
    while(chatB.mesh.next(now,forwarded)){auto wire=encode(forwarded);chatA.mesh.receive(wire.data(),wire.size(),now,0);chatC.mesh.receive(wire.data(),wire.size(),now,0);}
    exchange(chatC,chatB,now);
  }
  assert(chatB.chats.count(chatRecord.id) && chatC.chats.count(chatRecord.id));
  assert(chatA.chatReceipts.count(2) && chatA.chatReceipts.count(3));
  assert(chatA.receipts.empty() && chatB.records.empty() && chatC.records.empty());
  Node chatAckOnly(6);assert(chatAckOnly.mesh.acknowledge(chatRecord.id,chatRecord.hash,false,0,true));
  assert(chatAckOnly.mesh.pending()==1 && chatAckOnly.mesh.pending(false)==0);
  Node chatFailed(4),chatWriter(1);chatFailed.fail=true;chatWriter.mesh.publish(chatRecord);exchange(chatWriter,chatFailed,1);
  Frame chatFrame;while(chatFailed.mesh.next(1,chatFrame))assert(chatFrame.kind!=Kind::ChatReceipt);
  Node chatOther(5),chatSender(1);chatOther.mesh.setIncident(99);chatSender.mesh.publish(chatRecord);exchange(chatSender,chatOther,1);assert(chatOther.chats.empty() && !chatOther.mesh.pending());
  Node chatCapacity(1);auto secondChat=chatRecord;secondChat.id=id(93);
  assert(chatCapacity.mesh.publish(chatRecord) && chatCapacity.mesh.publish(secondChat));
  auto thirdChat=chatRecord;thirdChat.id=id(94);assert(!chatCapacity.mesh.publish(thirdChat));
  assert(chatCapacity.mesh.publish(record(95,3)) && chatCapacity.mesh.publish(record(96)));
  assert(chatCapacity.mesh.pending(false)==2 && chatCapacity.mesh.next(1,chatFrame) && chatFrame.priority==3);
  auto hugeChat=record(97,0,769);hugeChat.kind=Kind::Chat;assert(!chatCapacity.mesh.publish(hugeChat));
  { Frame f;
  // Relay defaults off; opting in forwards packets. Disabling drains queued forwards, but preserves local
  // sends, durable receives/ACKs, and explicitly requested repair service.
  Mesh defaultRelay(402);defaultRelay.setIncident(42);
  Node relayOrigin(400),relayClient(401);auto small=record(101,0,80);
  relayOrigin.mesh.publish(small);Frame direct;assert(relayOrigin.mesh.next(0,direct));auto directWire=encode(direct);
  defaultRelay.receive(directWire.data(),directWire.size(),0,0);assert(!defaultRelay.pending());
  relayClient.mesh.receive(directWire.data(),directWire.size(),10,100);
  assert(relayClient.mesh.pending()==2);relayClient.mesh.setRelayEnabled(false);
  assert(relayClient.mesh.pending()==1);assert(relayClient.mesh.next(110,f)&&f.kind==Kind::Receipt);
  relayClient.mesh.receive(directWire.data(),directWire.size(),120,0);assert(relayClient.mesh.pending()==0);
  small.id=id(102);small.origin=400;relayOrigin.mesh.publish(small);exchange(relayOrigin,relayClient,130);
  assert(relayClient.records.count(small.id));assert(relayClient.mesh.next(130,f)&&f.kind==Kind::Receipt && !relayClient.mesh.next(130,f));
  auto local=record(103,0,80);local.origin=401;assert(relayClient.mesh.publish(local));assert(relayClient.mesh.next(150,f)&&f.id==local.id);
  assert(relayClient.mesh.publish(small,true,150));assert(!relayClient.mesh.next(150,f));assert(relayClient.mesh.next(5000,f)&&f.repairReply);
  relayClient.mesh.setRelayEnabled(true);relayOrigin.mesh.announce("hello",5100);exchange(relayOrigin,relayClient,5100);
  assert(relayClient.mesh.next(5100,f)&&f.kind==Kind::Hello);

  // Competing repair responders: hold a randomized response, cancel only once
  // the entire alternative body is heard. Never cancel a normal originating job.
  Node repairRequester(410),repairA(411),repairB(412);auto repairRecord=record(104,0,500);
  repairA.records[repairRecord.id]=repairRecord;repairB.records[repairRecord.id]=repairRecord;
  Frame request=repairRequester.mesh.control(Kind::Request,repairRecord.id,repairRecord.hash);request.ttl=0;
  auto requestWire=encode(request);
  repairB.mesh.receive(requestWire.data(),requestWire.size(),100,0);
  assert(repairB.mesh.pending()==1 && !repairB.mesh.ready(100));
  assert(repairA.mesh.publish(repairRecord,true,0));
  std::vector<Frame> competing;
  while(repairA.mesh.next(5000,f))competing.push_back(f);
  assert(competing.size()==4);
  for(auto part:competing){part.ttl=0;auto wire=encode(part);repairB.mesh.receive(wire.data(),wire.size(),5100,0);}
  while(repairB.mesh.next(5100,f))assert(f.kind!=Kind::Data);
  assert(!repairB.mesh.pending());
  // A dropped fragment must allow a waiting repair to resume after silence.
  repairB.mesh.receive(requestWire.data(),requestWire.size(),200000,0);
  for(size_t i=0;i+1<competing.size();++i){auto part=competing[i];part.ttl=0;auto wire=encode(part);repairB.mesh.receive(wire.data(),wire.size(),200100,0);}
  while(repairB.mesh.next(200100,f))assert(f.kind!=Kind::Data);
  assert(!repairB.mesh.ready(215099));assert(repairB.mesh.next(215100,f)&&f.kind==Kind::Data);
  // Async nRF body fetch: the competing transfer can finish before publish RPC.
  Node asyncRepair(413);asyncRepair.mesh.load=[](const Id&,Record&){return false;};
  asyncRepair.mesh.receive(requestWire.data(),requestWire.size(),100,0);
  for(auto part:competing){part.ttl=0;auto wire=encode(part);asyncRepair.mesh.receive(wire.data(),wire.size(),200,0);}
  while(asyncRepair.mesh.next(200,f))assert(f.kind!=Kind::Data);
  assert(asyncRepair.mesh.publish(repairRecord,true,250));assert(!asyncRepair.mesh.pending());
  // An origin can overhear its own form served by another node and suppress repair.
  Node originRepair(1);originRepair.records[repairRecord.id]=repairRecord;
  originRepair.mesh.receive(requestWire.data(),requestWire.size(),100,0);
  for(auto part:competing){part.ttl=0;auto wire=encode(part);originRepair.mesh.receive(wire.data(),wire.size(),200,0);}
  assert(!originRepair.mesh.pending());
  Node normalJob(414);normalJob.records[repairRecord.id]=repairRecord;assert(normalJob.mesh.publish(repairRecord));
  normalJob.mesh.receive(requestWire.data(),requestWire.size(),100,0);
  for(auto part:competing){part.ttl=0;auto wire=encode(part);normalJob.mesh.receive(wire.data(),wire.size(),200,0);}
  normalJob.mesh.cancelPublish(repairRecord.id); // An existing job still owes the explicit requester its body.
  assert(normalJob.mesh.next(200,f)&&f.kind==Kind::Data&&!f.repairReply);
  }
  // Explicit resends survive automatic ACK cancellation, but offload cancels
  // them. They carry unchanged content and no extra on-air protocol flags.
  {
    Node source(1);auto copy=record(105,0,500);assert(source.mesh.resend(copy,100));assert(source.mesh.resend(copy,100));assert(source.mesh.pending()==1);
    source.mesh.cancelPublish(copy.id);Frame part;assert(source.mesh.next(100,part)&&part.manual&&!part.repairReply);
    auto bytes=encode(part);Frame decoded;decoded.manual=true;assert(decode(bytes.data(),bytes.size(),decoded)&&!decoded.manual);assert(decoded.id==copy.id&&decoded.hash==copy.hash&&decoded.origin==copy.origin);
    assert(source.mesh.queueFrame(part,100,2000));source.mesh.cancelPublish(copy.id);assert(source.mesh.pending()==2);
    source.mesh.cancelPublish(copy.id,true);assert(!source.mesh.pending());
    Node receiving(2);assert(!receiving.mesh.resend(copy,100));copy.kind=Kind::Chat;assert(!source.mesh.resend(copy,100));
    copy.kind=Kind::Data;assert(source.mesh.publish(copy,true,100));assert(!source.mesh.ready(100));assert(source.mesh.resend(copy,100));assert(source.mesh.ready(100));
    std::string content;while(source.mesh.next(100,part)){assert(part.manual&&!part.repairReply);content.append(part.payload.begin(),part.payload.end());}assert(content==copy.body);
  }
  // Quiet background schedules, bounded discovery responses, and join repair.
  BroadcastSchedule background;background.reset(0);
  assert(background.helloDue(0));background.helloQueued(0,0);
  assert(!background.helloDue(3599999) && background.helloDue(3600000));
  assert(!background.inventoryDue(899999) && background.inventoryDue(900000));
  background.inventoryQueued(900000,180000);
  assert(!background.inventoryDue(1979999) && background.inventoryDue(1980000));
  BroadcastSchedule joining;joining.reset(0);joining.helloQueued(0,0);joining.discover(true,0,10000);
  assert(!joining.helloDue(30000) && joining.helloDue(3600000));
  assert(!joining.inventoryDue(14999) && joining.inventoryDue(15000) && joining.beginInventory(15000,17));
  joining.inventoryQueued(15000,0);joining.discover(true,15000,0); // Does not restart an active pass.
  assert(!joining.inventoryDue(44999) && joining.inventoryDue(45000));
  assert(!joining.beginInventory(45000,17));joining.inventoryQueued(45000,0);
  assert(joining.inventoryDue(75000));joining.inventoryQueued(75000,0);assert(!joining.repairing());
  joining.discover(true,75000,0);assert(!joining.inventoryDue(614999) && joining.inventoryDue(615000));
  assert(joining.beginInventory(615000,8));joining.inventoryFailed(615000);
  assert(!joining.inventoryDue(616999) && joining.inventoryDue(617000));
  BroadcastSchedule wrapped;const uint32_t wrapStart=UINT32_MAX-1000;
  wrapped.reset(wrapStart);wrapped.helloQueued(wrapStart,0);
  assert(!wrapped.helloDue(wrapStart+HELLO_INTERVAL_MS-1) && wrapped.helloDue(wrapStart+HELLO_INTERVAL_MS));
  BroadcastSchedule fullQueue;fullQueue.reset(0);fullQueue.helloFailed(0);
  assert(!fullQueue.helloDue(1999) && fullQueue.helloDue(2000));
  // An idle empty station emits only its low-rate hellos, not empty inventories.
  BroadcastSchedule quiet;quiet.reset(0);unsigned hellos=0;
  for(uint32_t now=0;now<3600000;now+=1000){
    if(quiet.helloDue(now)){++hellos;quiet.helloQueued(now,0);}
    if(quiet.inventoryDue(now)){quiet.beginInventory(now,0);quiet.inventoryQueued(now,0);}
  }
  assert(hellos==1);
  quiet.helloQueued(4000000,300000);assert(!quiet.helloDue(7899999) && quiet.helloDue(7900000));
  HumanAckRetries humans;const Id humanId=id(91);unsigned humanSends=0;
  auto sendHuman=[&](const Id& key,uint32_t hash){assert(key==humanId && hash==123);++humanSends;return true;};
  humans.begin(humanId,123,0,true);humans.service(14999,sendHuman);assert(humanSends==0);
  humans.service(15000,sendHuman);humans.service(59999,sendHuman);assert(humanSends==1);
  humans.service(60000,sendHuman);humans.service(100000,sendHuman);assert(humanSends==2);
  assert(!humans.recoveryDue(humanId,1859999) && humans.recoveryDue(humanId,1860000));
  humans.recovered(humanId,123,1860000);assert(!humans.recoveryDue(humanId,1860001));
  humans.clear();humans.begin(humanId,123,0,false);unsigned failedAttempts=0;
  humans.service(0,[&](const Id&,uint32_t){++failedAttempts;return false;});
  humans.service(1999,[&](const Id&,uint32_t){++failedAttempts;return false;});assert(failedAttempts==1);
  humans.service(2000,sendHuman);assert(humanSends==3);
  DeliveryRetry retry;
  const Id retryId=id(90);uint32_t completedAt=100;
  assert(retry.due(retryId,completedAt));
  for(unsigned attempt=1;attempt<=8;++attempt){
    retry.queued(retryId);assert(!retry.due(retryId,completedAt+100000));
    retry.sent(retryId,completedAt);
    const uint32_t expected[]={60000,300000,900000,900000,900000,900000,900000,900000};
    uint32_t delay=expected[attempt-1];
    assert(!retry.due(retryId,completedAt+delay-1));
    assert(retry.due(retryId,completedAt+delay));completedAt+=delay+500;
  }
  retry.cancel(retryId);assert(retry.due(retryId,0));
  retry.queued(retryId);retry.sent(retryId,UINT32_MAX-1000);
  assert(!retry.due(retryId,58998));assert(retry.due(retryId,58999));
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
  // Delivery receipts stop unsolicited retries, but must preserve requested repairs.
  Node repairKept(16);assert(repairKept.mesh.publish(original,true));
  repairKept.mesh.cancelPublish(original.id);assert(repairKept.mesh.pending()==1);
  repairKept.mesh.cancelPublish(original.id,true);assert(repairKept.mesh.pending()==0);
  Node offloading(15);offloading.mesh.inventory({{original.id,original.hash}},0);
  auto kept=record(7);assert(offloading.mesh.publish(kept));
  offloading.mesh.cancelPublish(original.id,true);assert(offloading.mesh.pending()==1);
  assert(offloading.mesh.next(0,f) && f.id==kept.id && f.kind==Kind::Data);
  // Persist failure must never generate a receipt from that radio.
  Node failed(4);failed.fail=true;Node writer(1);writer.mesh.publish(original);exchange(writer,failed,100);
  bool falseReceipt=false;while(failed.mesh.next(100,f))if(f.kind==Kind::Receipt && f.origin==4)falseReceipt=true;assert(!falseReceipt);
  // An inventory repairs a disconnected node, and supplies an implicit receipt.
  Node holder(1),late(5);holder.records[original.id]=original;holder.mesh.inventory({{original.id,original.hash}},200);
  for(uint32_t now=200;now<5000;++now){exchange(holder,late,now);exchange(late,holder,now);}
  assert(late.records.count(original.id));
  // Repair human ACKs follow the complete body so a late node can save them.
  Node ackHolder(12),ackLate(13);ackHolder.records[original.id]=original;
  ackHolder.mesh.humanAcknowledged=[&](const Id& key,uint32_t hash){return key==original.id && hash==original.hash;};
  bool repairedHuman=false;ackLate.mesh.receipt=[&](const Id& key,uint64_t who,uint32_t,bool human){
    if(human && who==12){assert(ackLate.records.count(key));repairedHuman=true;}
  };
  ackHolder.mesh.inventory({{original.id,original.hash}},230);exchange(ackHolder,ackLate,230);
  exchange(ackLate,ackHolder,230);exchange(ackHolder,ackLate,5000);assert(repairedHuman);
  Node delayedRepair(16);delayedRepair.mesh.humanAcknowledged=[](const Id&,uint32_t){return true;};
  assert(delayedRepair.mesh.publish(original,true));Frame repairLast;
  while(delayedRepair.mesh.next(5000,f)){assert(f.kind==Kind::Data);repairLast=f;}
  assert(repairLast.repairReply && delayedRepair.mesh.pending()==0);
  auto repairWire=encode(repairLast);Frame repairDecoded;assert(decode(repairWire.data(),repairWire.size(),repairDecoded) && !repairDecoded.repairReply);
  assert(delayedRepair.mesh.queueFrame(repairLast,0,2000)); // Simulate a failed last-fragment start.
  assert(!delayedRepair.mesh.next(1999,f));assert(delayedRepair.mesh.next(2000,f) && f.kind==Kind::Data);
  delayedRepair.mesh.transmitted(f,2000);assert(delayedRepair.mesh.next(2000,f) && f.kind==Kind::HumanAck);
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
  // Repeated local control events do not duplicate still-unsent packets.
  Node controls(11);assert(controls.mesh.acknowledge(id(10),1,false,0));
  assert(controls.mesh.acknowledge(id(10),1,false,1) && controls.mesh.pending()==1);
  assert(controls.mesh.acknowledge(id(10),1,true,1) && controls.mesh.pending()==2);
  assert(controls.mesh.next(2,f));assert(controls.mesh.acknowledge(id(10),1,false,3) && controls.mesh.pending()==2);
  Node duplicateControl(14);assert(duplicateControl.mesh.announce(announcement,0));
  assert(duplicateControl.mesh.announce(announcement,1) && duplicateControl.mesh.pending()==1);
  duplicateControl.mesh.inventory({{original.id,original.hash}},0);duplicateControl.mesh.inventory({{original.id,original.hash}},1);
  assert(duplicateControl.mesh.pending()==2);
  // Bounded queues and reassembly slots, timeout and wraparound handling.
  Node bounded(1);for(size_t i=0;i<MAX_QUEUE;++i)assert(bounded.mesh.queueFrame(bounded.mesh.control(Kind::Request,id(i+1),1),0));assert(!bounded.mesh.queueFrame(bounded.mesh.control(Kind::Request,id(99),1),0));
  // A failed advertisement enqueue must be reported so firmware retries it.
  assert(!bounded.mesh.announce(announcement,0));assert(bounded.mesh.next(0,f));assert(bounded.mesh.announce(announcement,0));
  Node switching(1);switching.mesh.publish(original);switching.mesh.setIncident(99);assert(switching.mesh.pending()==0);
  Reassembler expired;assert(!expired.accept(fragments[0],0,result));for(size_t i=1;i<fragments.size();++i)assert(!expired.accept(fragments[i],120001,result));
  std::cout<<"Mesh tests passed: codec, corruption, bounds, reassembly, multi-hop receipts, durable-save failure, partition repair, incident isolation, fairness, switching, quiet schedules, ACK repeats, backoff, UTF-8 chat, bounded chat retries, isolated chat receipts.\n";
}
