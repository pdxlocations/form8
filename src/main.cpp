#include <Arduino.h>
#include <ArduinoJson.h>
#include <LittleFS.h>
#include <Preferences.h>
#include <SPI.h>
#include <WebServer.h>
#include <ApiGateway.h>
#include <EspBleBridge.h>
#include <WiFi.h>
#include <Mesh.h>
#include <RecordName.h>
#include <DeliveryRetry.h>
#include <DeliveryPolicy.h>
#include <TrafficSchedule.h>
#include <TrafficOrder.h>
#include <Chat.h>
#include <WebAssets.h>
#include <Board.h>
#include <Display.h>
#include <ReceiveActivity.h>
#include <Battery.h>
#include <Gps.h>
#include <sys/time.h>
#include <map>

using namespace form8;
WebServer server(80);
ApiGateway apiGateway(server);
EspBleBridge bluetooth;
bool wifiSuspended=false;
String bluetoothName;
Preferences prefs;
uint64_t nodeId;
uint32_t bootSession=0;
Mesh* mesh=nullptr;
String callsign, password, activeName, ssid;
bool stationDirty=true;
size_t outgoingMessages=0, unreadMessages=0;
String newestSender;
uint32_t receivedSequence=0, displayAt=0;
uint64_t active=0;
bool relayEnabled=false;
bool paused=false, txEnabled=false, fsReady=false, radioReady=false, transmitting=false;
volatile bool radioFlag=false;
int16_t radioError=0;
uint32_t txNext=0,retryAt=0;
BroadcastSchedule broadcasts;
HumanAckRetries humanAckRetries;
ReceiveActivity receiveActivity;
uint32_t rxProgressAt=0;
bool displayedRxActivity=false;
uint32_t rxPackets=0, rxFrames=0, rxErrors=0, txFrames=0;
int16_t lastRxError=0;
size_t inventoryCursor=0;
DeliveryRetry retries;
ChatRetries chatRetries;
Id transmittingId{};
Frame transmittingFrame;
bool transmittingLast=false;
String clockSource="unsynchronized";
float primary=VHF?146.780f:919.500f, backup=0, bandwidth=500;
uint8_t spreading=9, coding=8;
int8_t power=VHF?10:14;
bool useBackup=false;
constexpr size_t STORAGE_RESERVE=256*1024, MAX_RECORDS=512, MAX_PEERS=32;
struct Peer { uint64_t id=0, incident=0; String call, name; uint32_t last=0,session=0; PositionFix position; uint32_t positionSession=0,positionSequence=0; float rssi=0,snr=0; bool signalKnown=false,relayed=false; };
std::vector<Peer> peers;
PositionFix gpsFix,phoneFix;
PositionSchedule positionSchedule;
bool positionEnabled=true;
uint32_t positionInterval=600,positionSequence=0;

String hex64(uint64_t x) { char b[17]; snprintf(b,sizeof(b),"%016llx",(unsigned long long)x); return b; }
String hexId(const Id& id) { String s; s.reserve(32); for(auto b:id){char t[3];snprintf(t,3,"%02x",b);s+=t;}return s; }
bool parseHex(const String& s,size_t len) {
  if(s.length()!=len)return false;
  for(char c:s)if(!isxdigit((unsigned char)c))return false;
  return true;
}
Id parseId(const String& s) { Id id{}; if(parseHex(s,32)) for(size_t i=0;i<16;++i)id[i]=strtoul(s.substring(i*2,i*2+2).c_str(),nullptr,16); return id; }
uint64_t parse64(const String& s) { return parseHex(s,16)?strtoull(s.c_str(),nullptr,16):0; }
String path(const Id& id,const char* ext) {
  // Keep existing records readable on filesystems that accepted long names.
  String legacy="/records/"+hexId(id)+ext;
  if(fsReady && LittleFS.exists(legacy))return legacy;
  return "/records/"+String(recordName(id).c_str())+ext;
}
bool recordFileId(const String& name,Id& id) {
  String stem=name.substring(0,name.length()-5);
  if(stem.length()==32 && parseHex(stem,32)){id=parseId(stem);return true;}
  return parseRecordName(stem.c_str(),id);
}
bool atomicWrite(const String& name,const String& text) {
  if(!fsReady)return false;
  File f=LittleFS.open(name+".tmp","w"); if(!f)return false;
  bool ok=f.print(text)==text.length();f.flush();f.close();
  if(!ok){LittleFS.remove(name+".tmp");return false;}
  return LittleFS.rename(name+".tmp",name);
}
bool writeJson(const String& p,const JsonDocument& doc) { String s;serializeJson(doc,s);return atomicWrite(p,s); }
bool readJson(const String& p,JsonDocument& doc) { File f=LittleFS.open(p,"r"); if(!f)return false; return !deserializeJson(doc,f); }
std::vector<Id> allIds(bool activeOnly=true,bool bodiesOnly=false) {
  std::vector<Id> ids; if(!fsReady)return ids;
  File dir=LittleFS.open("/records"); File f=dir.openNextFile();
  while(f && ids.size()<MAX_RECORDS) {
    String n=f.name();f.close();
    int slash=n.lastIndexOf('/');if(slash>=0)n=n.substring(slash+1);
    Id id{};
    if(n.endsWith(".meta") && recordFileId(n,id)) {
      JsonDocument m;
      if(readJson(path(id,".meta"),m) && (!activeOnly || parse64(m["incident"]|"")==active) && (!bodiesOnly || String(m["state"]|"")=="stored"))ids.push_back(id);
    }
    f=dir.openNextFile();
  }
  std::sort(ids.begin(),ids.end());return ids;
}
std::vector<Id> trafficIds(bool activeOnly,bool history) {
  std::vector<std::pair<TrafficOrder,Id>> records;
  for(const auto& id:allIds(activeOnly)) {
    JsonDocument m;if(!readJson(path(id,".meta"),m))continue;
    if(!history && String(m["state"]|"")!="stored")continue;
    // Cache the legacy timestamp once, so later page refreshes read only metadata.
    if(m["order"].isNull() && m["trafficSentAt"].isNull()) {
      JsonDocument body;readJson(path(id,".body"),body);
      m["trafficSentAt"]=body["sentAt"]|int64_t(0);writeJson(path(id,".meta"),m);
    }
    records.push_back({{m["order"]|uint32_t(0),m["trafficSentAt"]|int64_t(0),m["receivedOrder"]|uint32_t(0)},id});
  }
  std::sort(records.begin(),records.end());
  std::vector<Id> ids;ids.reserve(records.size());
  for(const auto& record:records)ids.push_back(record.second);
  return ids;
}
bool have(const Id& id) {
  JsonDocument m;if(!fsReady || !readJson(path(id,".meta"),m))return false;
  String state=m["state"]|"";
  return state=="archived" || state=="discarded" || (state=="stored" && LittleFS.exists(path(id,".body")));
}
bool loadRecord(const Id& id,Record& r) {
  JsonDocument m; if(!readJson(path(id,".meta"),m) || String(m["state"]|"")!="stored")return false;
  File f=LittleFS.open(path(id,".body"),"r"); if(!f || f.size()>MAX_BODY)return false;
  String body=f.readString();
  r={id,parse64(m["incident"]|""),parse64(m["origin"]|""),m["priority"].as<uint8_t>(),m["hash"].as<uint32_t>(),body.c_str()};
  return r.body.size()>0 && crc32(r.body)==r.hash;
}
bool validCall(const String& s) {
  if(s.length()<3 || s.length()>16)return false;
  for(char c:s)if(!isalnum((unsigned char)c) && c!='/' && c!='-')return false;
  return true;
}
bool validForm(const JsonDocument& d) {
  if(String(d["type"]|"")!="net-form-8" || !validCall(d["sender"]|""))return false;
  String to=d["recipient"]|"*";
  if(to!="*" && !validCall(to))return false;
  for(const char* key:{"subject","to","from","approvedBy","approvedPosition","signature","replyBy","replyPosition"}) {
    if(!d[key].isNull() && !d[key].is<const char*>())return false;
    if(String(d[key]|"").length()>160)return false;
  }
  if(!d["message"].is<const char*>() || String(d["message"]|"").isEmpty() || String(d["message"]|"").length()>2800)return false;
  String parent=d["parent"]|"";if(parent.length() && !parseHex(parent,32))return false;
  if(!d["location"].isNull()) {
    JsonObjectConst loc=d["location"];
    if(!loc["lat"].is<double>() || !loc["lon"].is<double>())return false;
    double lat=loc["lat"],lon=loc["lon"];
    if(!isfinite(lat)||!isfinite(lon)||lat < -90||lat > 90||lon < -180||lon > 180)return false;
    String source=loc["source"]|"";if(source!="phone" && source!="manual" && source!="radio")return false;
  }
  return true;
}
const char* persistError="Cannot save form";
bool persistRecord(const Record& r) {
  persistError="Form validation or checksum failed; form was not saved";
  if(r.incident!=active || r.body.size()>MAX_BODY || crc32(r.body)!=r.hash)return false;
  persistError="Stored form conflicts with this submission";
  if(have(r.id)) { JsonDocument m;return readJson(path(r.id,".meta"),m) && m["hash"].as<uint32_t>()==r.hash; }
  persistError="Form validation failed; form was not saved";
  JsonDocument body;if(deserializeJson(body,r.body)||!validForm(body))return false;
  persistError="Message history full (512 records). Archive forms you want to keep, then remove an old incident to free message slots";
  if(allIds(false).size()>=MAX_RECORDS)return false;
  persistError="Storage full. Open a Traffic message and choose Archive on this device or Remove message";
  if(LittleFS.totalBytes()-LittleFS.usedBytes()<STORAGE_RESERVE+r.body.size()+8192)return false;
  persistError="Cannot write form body to radio storage; check USB serial logs";
  if(!atomicWrite(path(r.id,".body"),String(r.body.c_str())))return false;
  JsonDocument m;m["id"]=hexId(r.id);m["incident"]=hex64(r.incident);m["origin"]=hex64(r.origin);
  m["hash"]=r.hash;m["priority"]=r.priority;m["state"]="stored";m["recipient"]=body["recipient"];
  m["subject"]=body["subject"];m["sender"]=body["sender"];
  m["from"]=body["from"]|"";m["to"]=body["to"]|"";
  m["order"]=++receivedSequence;prefs.putULong("rxSequence",receivedSequence);
  if(r.origin!=nodeId){m["unread"]=true;m["receivedOrder"]=receivedSequence;}
  JsonArray expected=m["expected"].to<JsonArray>();
  for(const auto& p:peers)if(p.incident==active){JsonObject e=expected.add<JsonObject>();e["id"]=hex64(p.id);e["callsign"]=p.call;}
  JsonArray receipts=m["receipts"].to<JsonArray>();JsonObject own=receipts.add<JsonObject>();own["id"]=hex64(nodeId);own["human"]=false;
  persistError="Cannot write form metadata to radio storage; check USB serial logs";
  if(!writeJson(path(r.id,".meta"),m)){LittleFS.remove(path(r.id,".body"));return false;}stationDirty=true;return true;
}
// Older records can recover form addresses while their body is retained.
void formAddresses(JsonDocument& meta,const Id& id) {
  if(meta["from"].is<const char*>() && meta["to"].is<const char*>())return;
  JsonDocument body;if(!readJson(path(id,".body"),body))return;
  meta["from"]=body["from"]|"";meta["to"]=body["to"]|"";
}
bool recordReceipt(const Id& id,uint64_t peer,uint32_t hash,bool human) {
  JsonDocument m;if(!readJson(path(id,".meta"),m) || m["hash"].as<uint32_t>()!=hash || parse64(m["incident"]|"")!=active)return false;
  if(peer==parse64(m["origin"]|""))human=false;
  stationDirty=true;
  String who=hex64(peer);JsonArray receipts=m["receipts"].as<JsonArray>();
  for(JsonObject item:receipts)if(item["id"]==who){
    if(human && !item["human"].as<bool>()){
      item["human"]=true;
      if(peer==nodeId)item["callsign"]=callsign;
      else for(const auto& p:peers)if(p.id==peer)item["callsign"]=p.call;
      return writeJson(path(id,".meta"),m);
    }
    return true;
  }
  if(receipts.size()>=MAX_PEERS)return false;
  JsonObject entry=receipts.add<JsonObject>();entry["id"]=who;entry["human"]=human;
  if(peer==nodeId)entry["callsign"]=callsign;
  for(const auto& p:peers)if(p.id==peer)entry["callsign"]=p.call;
  JsonArray expected=m["expected"].as<JsonArray>();bool known=peer==nodeId;
  for(JsonObject e:expected)if(e["id"]==who)known=true;
  if(!known && expected.size()<MAX_PEERS){JsonObject e=expected.add<JsonObject>();e["id"]=who;for(const auto& p:peers)if(p.id==peer)e["callsign"]=p.call;}
  return writeJson(path(id,".meta"),m);
}
bool deliveryPending(const JsonDocument& m) {
  return formDeliveryPending(m,hex64(nodeId),[](const String& who,const String& recipient){
    for(const auto& p:peers)if(hex64(p.id)==who && p.call==recipient)return true;
    return false;
  });
}
void refreshStationCounts() {
  if(!stationDirty)return;
  outgoingMessages=0;unreadMessages=0;newestSender="";uint32_t newest=0;
  for(const auto& id:allIds(true,true)){
    JsonDocument m;if(!readJson(path(id,".meta"),m))continue;
    if(parse64(m["origin"]|"")==nodeId){if(deliveryPending(m))++outgoingMessages;}
    else if(m["unread"].as<bool>()){
      ++unreadMessages;uint32_t order=m["receivedOrder"]|uint32_t(0);
      if(newestSender.isEmpty() || order>=newest){newest=order;newestSender=m["sender"]|"Unknown";}
    }
  }
  stationDirty=false;
}
bool markRead(const Id& id) {
  JsonDocument m;if(!readJson(path(id,".meta"),m))return false;
  if(!m["unread"].as<bool>())return true;
  m["unread"]=false;if(!writeJson(path(id,".meta"),m))return false;
  stationDirty=true;return true;
}
void onHello(const Frame& f) {
  JsonDocument d;if(deserializeJson(d,f.payload.data(),f.payload.size()))return;
  String c=d["callsign"]|"",name=d["name"]|"";if(!validCall(c)||name.length()>64)return;stationDirty=true;
  uint32_t session=d["session"]|uint32_t(0);
  for(auto& p:peers)if(p.id==f.origin){
    if(p.incident!=f.incident || p.session!=session || uint32_t(millis()-p.last)>=PEER_ONLINE_MS)broadcasts.discover(active && f.incident==active,millis(),esp_random());
    if(p.incident!=f.incident)p.position.valid=false;
    p.call=c;p.incident=f.incident;p.name=name;p.last=millis();p.session=session;return;
  }
  if(peers.size()>=MAX_PEERS-1)peers.erase(std::max_element(peers.begin(),peers.end(),[](const Peer& a,const Peer& b){return uint32_t(millis()-a.last)<uint32_t(millis()-b.last);}));
  if(peers.size()<MAX_PEERS-1){peers.push_back({f.origin,f.incident,c,name,millis(),session});broadcasts.discover(active && f.incident==active,millis(),esp_random());}
}
// The wire identifies the origin, not the relay transmitter. Signal readings
// therefore describe the final hop; retain that distinction in the API/UI.
void observePacket(const Frame& f,uint32_t now,float rssi,float snr) {
  if(f.origin==nodeId)return;
  auto it=std::find_if(peers.begin(),peers.end(),[&](const Peer& p){return p.id==f.origin;});
  if(it==peers.end()){
    if(peers.size()>=MAX_PEERS-1)peers.erase(std::max_element(peers.begin(),peers.end(),[&](const Peer& a,const Peer& b){return uint32_t(now-a.last)<uint32_t(now-b.last);}));
    peers.push_back({f.origin,f.incident,"","",now,0});it=peers.end()-1;
  }
  it->last=now;it->rssi=rssi;it->snr=snr;it->signalKnown=true;it->relayed=f.ttl<MAX_HOPS;stationDirty=true;
}
void onPosition(const Frame& f) {
  PositionPacket packet;if(!decodePosition(f.payload,packet,millis()))return;
  Peer* peer=nullptr;
  for(auto& p:peers)if(p.id==f.origin){peer=&p;break;}
  if(!peer){if(peers.size()>=MAX_PEERS-1)return;peers.push_back({f.origin,f.incident,String(packet.call.c_str()),"",millis(),0});peer=&peers.back();}
  if(peer->incident==f.incident && peer->positionSession==packet.session && peer->positionSequence && int32_t(packet.sequence-peer->positionSequence)<=0)return;
  peer->incident=f.incident;peer->call=packet.call.c_str();peer->last=millis();peer->position=packet.fix;
  peer->positionSession=packet.session;peer->positionSequence=packet.sequence;
}
void positionJson(JsonObject out,const PositionFix& fix) {
  if(!fix.valid)return;
  out["lat"]=fix.lat;out["lon"]=fix.lon;out["source"]=fix.radio?"radio":"phone";
  out["accuracy"]=fix.accuracy;out["ageMs"]=fix.ageMs(millis());out["fresh"]=fix.fresh(millis());
}
void apiOn(const char* route,HTTPMethod method,std::function<void()> handler){apiGateway.on(route,method,handler);}
String apiArg(const String& name){return apiGateway.arg(name);}
void respond(int code,const JsonDocument& d){apiGateway.respond(code,d);}
void error(int code,const char* message){apiGateway.error(code,message);}
bool input(JsonDocument& d){return apiGateway.input(d);}
#include <ChatStore.h>
void IRAM_ATTR radioIRQ() { radioFlag=true; }
void initRadio() {
  // Radio reconfiguration interrupts in-flight jobs; reload pending durable
  // forms rather than leaving the retry scheduler waiting for a lost TX IRQ.
  mesh->setRelayEnabled(relayEnabled);mesh->setIncident(active);retries.clear();humanAckRetries.clear();chatRetries.interrupted(millis());broadcasts.reset(millis());positionSchedule.reset(millis());
  radioReady=false;radioFlag=false;transmitting=false;transmittingLast=false;receiveActivity.reset();
  radioError=radioBegin(useBackup?backup:primary,bandwidth,spreading,coding,power);
  if(radioError!=RADIOLIB_ERR_NONE)return;
  radio.setPacketReceivedAction(radioIRQ); radioReady=radio.startReceive()==RADIOLIB_ERR_NONE;
}
void saveConfig() {
  prefs.putString("call",callsign);prefs.putString("incident",hex64(active));prefs.putString("name",activeName);
  prefs.putFloat("primary",primary);prefs.putFloat("backup",backup);prefs.putFloat("bw",bandwidth);
  prefs.putUChar("sf",spreading);prefs.putUChar("cr",coding);prefs.putChar("power",power);
  prefs.putBool("alternate",useBackup);prefs.putBool("tx",txEnabled);prefs.putBool("relay",relayEnabled);prefs.putBool("paused",paused);
  prefs.putBool("posEnabled",positionEnabled);prefs.putUInt("posInterval",positionInterval);
}
bool leaveIncident() {
  // Persist leaving before deleting anything; a reboot must not rejoin it.
  if(prefs.putString("incident","0000000000000000")!=16)return false;
  // Preferences returns the string length, so a successful empty write is 0.
  prefs.putString("name","");if(prefs.getString("name","not-cleared")!="")return false;
  active=0;activeName="";mesh->setIncident(0);retries.clear();humanAckRetries.clear();chatRetries.clear();
  broadcasts.reset(millis());positionSchedule.reset(millis());stationDirty=true;inventoryCursor=0;
  return true;
}
bool queueAnnouncement(uint32_t now){
  JsonDocument d;d["callsign"]=callsign;d["name"]=activeName;d["session"]=bootSession;String s;serializeJson(d,s);
  if(s.length()>CHUNK){d["name"]=activeName.substring(0,32);s="";serializeJson(d,s);}
  if(!mesh->announce(s.c_str(),now))return false;
  broadcasts.helloQueued(now,esp_random());return true;
}
void api() {
  chatApi();
  apiOn("/api/status",HTTP_GET,[]{
    refreshStationCounts();
    JsonDocument d;
    d["batteryMillivolts"]=batteryReading().millivolts;d["board"]=BOARD_NAME;d["powerNote"]=BOARD_POWER_NOTE;d["node"]=hex64(nodeId);d["bootSession"]=bootSession;d["callsign"]=callsign;
    d["incident"]=hex64(active);d["incidentName"]=activeName;d["paused"]=paused;d["txEnabled"]=txEnabled;d["relayEnabled"]=relayEnabled;
    d["radioReady"]=radioReady;d["radioError"]=radioError;d["queue"]=mesh->pending(false);d["dropped"]=mesh->dropped;
    d["rxPackets"]=rxPackets;d["rxFrames"]=rxFrames;d["rxErrors"]=rxErrors;d["txFrames"]=txFrames;d["lastRxError"]=lastRxError;
    d["outgoingMessages"]=outgoingMessages;d["unreadMessages"]=unreadMessages;d["newestSender"]=newestSender;d["connectedClients"]=bluetooth.isConnected()?1:WiFi.softAPgetStationNum();d["bluetoothAvailable"]=bluetooth.available;d["bluetoothConnected"]=bluetooth.isConnected();d["bluetoothName"]=bluetoothName;d["wifiEnabled"]=!wifiSuspended;d["clientTransport"]=apiGateway.bluetoothRequest()?"bluetooth":"wifi";
    d["clockSource"]=clockSource;d["freeHeap"]=ESP.getFreeHeap();d["fsReady"]=fsReady;
    d["storageUsed"]=fsReady?LittleFS.usedBytes():0;d["storageTotal"]=fsReady?LittleFS.totalBytes():0;
    d["storageWarning"]=!fsReady || LittleFS.totalBytes()-LittleFS.usedBytes()<STORAGE_RESERVE+512*1024 || allIds(false).size()>460;
    d["frequency"]=useBackup?backup:primary;d["primary"]=primary;d["backup"]=backup;d["useBackup"]=useBackup;
    d["band"]=VHF?"vhf":"uhf";d["bandwidth"]=bandwidth;d["sf"]=spreading;d["cr"]=coding;d["power"]=power;d["powerMin"]=TX_POWER_MIN_DBM;d["powerMax"]=TX_POWER_MAX_DBM;d["powerIsDrive"]=TX_POWER_IS_DRIVE;
    d["gpsAvailable"]=GPS_AVAILABLE;d["gpsFresh"]=gpsFix.fresh(millis());d["positionEnabled"]=positionEnabled;d["positionInterval"]=positionInterval;
    positionJson(d["location"].to<JsonObject>(),preferredPosition(gpsFix,phoneFix,millis()));
    JsonArray a=d["peers"].to<JsonArray>();
    for(const auto& p:peers){JsonObject o=a.add<JsonObject>();o["id"]=hex64(p.id);o["callsign"]=p.call;o["incident"]=hex64(p.incident);o["name"]=p.name;o["online"]=uint32_t(millis()-p.last)<PEER_ONLINE_MS;o["lastHeardAgeMs"]=uint32_t(millis()-p.last);if(p.signalKnown){o["rssi"]=p.rssi;o["snr"]=p.snr;o["relayed"]=p.relayed;}if(p.position.valid && p.position.ageMs(millis())<=POSITION_RETAIN_MS)positionJson(o["location"].to<JsonObject>(),p.position);}
    respond(200,d);
  });
  apiOn("/api/config",HTTP_POST,[]{
    JsonDocument d;if(!input(d))return;
    if(!d["relayEnabled"].isNull() && !d["relayEnabled"].is<bool>()){error(400,"Relay setting must be true or false");return;}
    String call=d["callsign"]|callsign;call.toUpperCase();
    float freq=d["primary"]|primary,bak=d["backup"]|backup,bw=d["bandwidth"]|bandwidth;
    int sf=d["sf"]|spreading,cr=d["cr"]|coding,pwr=d["power"]|power;
    if((!d["power"].isNull() && !d["power"].is<int>()) || !validTxPower(pwr)){
      String message="TX power must be a whole number from "+String(TX_POWER_MIN_DBM)+" to "+String(TX_POWER_MAX_DBM)+" dBm";
      error(400,message.c_str());return;
    }
    bool alt=d["useBackup"]|useBackup;
    int interval=d["positionInterval"]|int(positionInterval);
    if(interval<60 || interval>86400 || (!d["positionInterval"].isNull() && !d["positionInterval"].is<int>()) || (!d["positionEnabled"].isNull() && !d["positionEnabled"].is<bool>())){error(400,"Position interval must be 60–86400 whole seconds");return;}
    auto goodFreq=[](float f){return isfinite(f) && (VHF?(f>=144 && f<=148):(f>=902 && f<=928));};
    const float choices[]={7.8,10.4,15.6,20.8,31.25,41.7,62.5,125,250,500};bool goodBW=false;
    for(float choice:choices)if(fabs(bw-choice)<0.01)goodBW=true;
    // SX1262 supports >=7.8 kHz; allow SF7–12 common to both board families.
    if(!validCall(call)||!goodFreq(freq)||(bak!=0&&!goodFreq(bak))||(alt&&bak==0)||!goodBW||sf<7||sf>12||cr<5||cr>8){
      error(400,"Invalid callsign or radio profile");return;
    }
    callsign=call;primary=freq;backup=bak;bandwidth=bw;spreading=sf;coding=cr;power=pwr;useBackup=alt;
    positionInterval=interval;positionEnabled=d["positionEnabled"]|positionEnabled;
    relayEnabled=d["relayEnabled"]|relayEnabled;txEnabled=d["txEnabled"]|txEnabled;paused=d["paused"]|paused;saveConfig();radio.standby();initRadio();
    JsonDocument out;out["saved"]=true;out["radioReady"]=radioReady;respond(200,out);
  });
  apiOn("/api/nodes/forget",HTTP_POST,[]{
    JsonDocument d;if(!input(d))return;String id=d["id"]|"";
    if(!parseHex(id,16) || !parse64(id) || parse64(id)==nodeId){error(400,"Choose another valid node ID");return;}
    const size_t before=peers.size();
    peers.erase(std::remove_if(peers.begin(),peers.end(),[&](const Peer& peer){return peer.id==parse64(id);}),peers.end());
    stationDirty=true;
    JsonDocument out;out["saved"]=true;out["removed"]=before!=peers.size();respond(200,out);
  });
  apiOn("/api/nodes/request-id",HTTP_POST,[]{
    JsonDocument d;if(!input(d))return;String id=d["id"]|"";
    if(!parseHex(id,16) || !parse64(id) || parse64(id)==nodeId){error(400,"Choose another valid node ID");return;}
    if(!radioReady || !txEnabled || paused || !validCall(callsign)){error(409,"Set Radio transmission to On and save a callsign before requesting an ID");return;}
    if(!mesh->requestIdentity(parse64(id),millis())){error(429,"Request not queued. Wait 30 seconds before retrying this node, or wait for queue space");return;}
    JsonDocument out;out["queued"]=true;respond(200,out);
  });
  apiOn("/api/incident/announce",HTTP_POST,[]{
    if(!active){error(409,"Join an incident before announcing it");return;}
    if(!radioReady || !txEnabled || paused || !validCall(callsign)){error(409,"Enable radio transmission, unpause, and save a callsign before announcing");return;}
    if(!queueAnnouncement(millis())){error(503,"Radio queue full; try announcing again shortly");return;}
    JsonDocument out;out["queued"]=true;respond(200,out);
  });
  apiOn("/api/position",HTTP_POST,[]{
    JsonDocument d;if(!input(d))return;
    if(!d["lat"].is<double>() || !d["lon"].is<double>() || !d["ageMs"].is<uint32_t>()){error(400,"Coordinates and fix age required");return;}
    double lat=d["lat"],lon=d["lon"];uint32_t age=d["ageMs"];
    if(!validCoordinates(lat,lon)||age>POSITION_FRESH_MS){error(400,"Position is invalid or older than two minutes");return;}
    int accuracy=-1;
    if(!d["accuracy"].isNull()){
      if(!d["accuracy"].is<double>() || !isfinite(d["accuracy"].as<double>()) || d["accuracy"].as<double>()<0 || d["accuracy"].as<double>()>65534){error(400,"Invalid position accuracy");return;}
      accuracy=int(ceil(d["accuracy"].as<double>()));
    }
    phoneFix={lat,lon,accuracy,false,true,millis(),age};
    JsonDocument out;out["saved"]=true;respond(200,out);
  });
  apiOn("/api/incident",HTTP_POST,[]{
    JsonDocument d;if(!input(d))return;String name=d["name"]|"",id=d["id"]|"";
    if(name.isEmpty()||name.length()>64||(id.length()&&!parseHex(id,16))){error(400,"Incident name and valid ID required");return;}
    uint64_t next=id.length()?parse64(id):(uint64_t(esp_random())<<32)|esp_random();
    if(!next){error(400,"Zero incident ID is reserved");return;}
    // Save incident names even after switching; message bodies remain unchanged.
    JsonDocument entry;entry["id"]=hex64(next);entry["name"]=name;
    if(!writeJson("/incidents/"+hex64(next)+".json",entry)){error(507,"Cannot save incident");return;}
    active=next;activeName=name;mesh->setIncident(active);retries.clear();humanAckRetries.clear();chatRetries.clear();broadcasts.reset(millis());positionSchedule.reset(millis());stationDirty=true;saveConfig();inventoryCursor=0;
    JsonDocument out;out["id"]=hex64(active);respond(200,out);
  });
  apiOn("/api/incident/leave",HTTP_POST,[]{
    if(!leaveIncident()){error(507,"Could not save incident change");return;}
    JsonDocument out;out["saved"]=true;respond(200,out);
  });
  apiOn("/api/incident/remove",HTTP_POST,[]{
    JsonDocument d;if(!input(d))return;String value=d["id"]|"";
    if(!parseHex(value,16)||!parse64(value)){error(400,"Valid incident ID required");return;}
    if(!fsReady){error(507,"Storage unavailable");return;}
    const uint64_t removing=parse64(value);
    if(active==removing&&!leaveIncident()){error(507,"Could not leave incident; nothing removed");return;}
    unsigned forms=0,chats=0;
    for(const auto& id:allIds(false)){
      JsonDocument m;if(!readJson(path(id,".meta"),m)||parse64(m["incident"]|"")!=removing)continue;
      for(const char* suffix:{".body",".body.tmp",".meta.tmp",".meta"}){
        String file=path(id,suffix);if(LittleFS.exists(file)&&!LittleFS.remove(file)){error(507,"Cleanup incomplete; refresh and retry removing this incident");return;}
      }
      ++forms;
    }
    for(const auto& item:chatIds(false)){
      JsonDocument m;if(!readJson(chatPath(item.id),m)||parse64(m["incident"]|"")!=removing)continue;
      if(!LittleFS.remove(chatPath(item.id))){error(507,"Chat cleanup incomplete; refresh and retry");return;}++chats;
    }
    String file="/incidents/"+hex64(removing)+".json";
    if(LittleFS.exists(file)&&!LittleFS.remove(file)){error(507,"Could not remove incident entry; retry");return;}
    if(chats){++chatRevision;}stationDirty=true;
    JsonDocument out;out["saved"]=true;out["forms"]=forms;out["chatEvents"]=chats;respond(200,out);
  });
  apiOn("/api/incidents",HTTP_GET,[]{
    JsonDocument d;JsonArray a=d["incidents"].to<JsonArray>();File dir=LittleFS.open("/incidents");File f=dir.openNextFile();
    while(f){JsonDocument e;if(!deserializeJson(e,f))a.add(e.as<JsonVariantConst>());f.close();f=dir.openNextFile();}respond(200,d);
  });
  apiOn("/api/time",HTTP_POST,[]{
    JsonDocument d;if(!input(d))return;int64_t epoch=d["epoch"]|int64_t(0);
    if(epoch<1577836800LL||epoch>4102444800LL){error(400,"Invalid time");return;}
    timeval tv{static_cast<time_t>(epoch),0};settimeofday(&tv,nullptr);clockSource="phone/laptop";
    JsonDocument out;out["saved"]=true;respond(200,out);
  });
  apiOn("/api/forms",HTTP_GET,[]{
    JsonDocument d;JsonArray a=d["forms"].to<JsonArray>();bool archives=apiArg("all")=="1";
    auto ids=trafficIds(!archives,apiArg("history")=="1");
    size_t offset=apiArg("offset").toInt();
    String selected=apiArg("selected");
    if(parseHex(selected,32)) {
      auto found=std::find(ids.begin(),ids.end(),parseId(selected));
      if(found!=ids.end()) {
        size_t index=found-ids.begin();offset=(index/20)*20;
        if(index>0)d["previous"]=hexId(ids[index-1]);
        if(index+1<ids.size())d["next"]=hexId(ids[index+1]);
      }
    }
    size_t end=std::min(ids.size(),offset+20);
    for(size_t i=offset;i<end;++i){JsonDocument m;if(readJson(path(ids[i],".meta"),m)){formAddresses(m,ids[i]);a.add(m.as<JsonVariantConst>());}}
    d["total"]=ids.size();d["offset"]=offset;respond(200,d);
  });
  apiOn("/api/form",HTTP_GET,[]{
    String s=apiArg("id");if(!parseHex(s,32)){error(400,"Invalid form ID");return;}Id id=parseId(s);
    JsonDocument d,m;if(!readJson(path(id,".meta"),m)){error(404,"Form not found");return;}
    formAddresses(m,id);d["meta"]=m;Record r;if(loadRecord(id,r))d["body"]=r.body;respond(200,d);
  });
  apiOn("/api/forms",HTTP_POST,[]{
    JsonDocument d;if(!input(d))return;if(!fsReady||!active||!validCall(callsign)){error(409,"Set callsign and join an incident first");return;}
    if(!d["boundIncident"].isNull() && String(d["boundIncident"]|"")!=hex64(active)){error(409,"Draft belongs to another incident");return;}
    String token=d["clientToken"]|"";
    if(!parseHex(token,32)){error(400,"A persistent client submission token is required");return;}
    // Client token is also the record ID, making reconnect/retry idempotent.
    Id id=parseId(token);JsonDocument previous;
    if(chatHave(id)){error(409,"Submission token belongs to a chat event");return;}
    if(readJson(path(id,".meta"),previous)){
      if(parse64(previous["incident"]|"")!=active || String(previous["sender"]|"")!=callsign){error(409,"Submission token already belongs to another form");return;}
      JsonDocument out;out["id"]=token;out["existing"]=true;respond(200,out);return;
    }
    d.remove("clientToken");d["sender"]=callsign;d["incident"]=hex64(active);d["incidentName"]=activeName;
    d["type"]="net-form-8";int priority=d["priority"]|0;if(priority<0||priority>3||!validForm(d)){error(400,"Invalid Form 8 fields or location; message limit is 2800 UTF-8 bytes");return;}
    d["clockSource"]=clockSource;d["sentAt"]=static_cast<int64_t>(time(nullptr));
    String body;serializeJson(d,body);if(body.length()>MAX_BODY){error(413,"Serialized form exceeds 4096 bytes");return;}
    Record r{id,active,nodeId,static_cast<uint8_t>(priority),0,body.c_str()};r.hash=crc32(r.body);
    if(!persistRecord(r)){Serial.printf("Form save failed: %s\n",persistError);error(507,persistError);return;}
    bool queued=mesh->publish(r);if(queued)retries.queued(id);JsonDocument out;out["id"]=hexId(id);out["queued"]=queued;out["saved"]=true;respond(201,out);
  });
  apiOn("/api/resend",HTTP_POST,[]{
    JsonDocument d;if(!input(d))return;String s=d["id"]|"";Record r;
    if(!parseHex(s,32)||!loadRecord(parseId(s),r)){error(404,"Stored form body required to resend");return;}
    if(r.origin!=nodeId){error(409,"Only the originating station can resend a form");return;}
    if(!active || r.incident!=active){error(409,"Join this form's incident before resending");return;}
    if(!radioReady || !txEnabled || paused || !validCall(callsign)){error(409,"Set Radio transmission to On before resending");return;}
    if(!mesh->resend(r,millis())){error(503,"Radio queue full; try resending shortly");return;}
    JsonDocument out;out["id"]=s;out["queued"]=true;respond(200,out);
  });
  apiOn("/api/ack",HTTP_POST,[]{
    JsonDocument d;if(!input(d))return;String s=d["id"]|"";Id id=parseId(s);Record r;
    if(!parseHex(s,32)||!loadRecord(id,r)||r.incident!=active){error(404,"Active stored form required");return;}
    if(!canHumanAcknowledge(nodeId,r.origin)){error(409,"The originating station cannot human-acknowledge its own form");return;}
    if(!recordReceipt(id,nodeId,r.hash,true)){error(507,"Cannot save acknowledgment");return;}
    const uint32_t now=millis();humanAckRetries.begin(id,r.hash,now,mesh->acknowledge(id,r.hash,true,now));JsonDocument out;out["saved"]=true;respond(200,out);
  });
  apiOn("/api/read",HTTP_POST,[]{
    JsonDocument d;if(!input(d))return;String id=d["id"]|"";
    if(!parseHex(id,32)||!LittleFS.exists(path(parseId(id),".meta"))){error(404,"Form not found");return;}
    if(!markRead(parseId(id))){error(507,"Cannot save read status");return;}
    JsonDocument out;out["saved"]=true;respond(200,out);
  });
  apiOn("/api/offload",HTTP_POST,[]{
    JsonDocument d;if(!input(d))return;String s=d["id"]|"",mode=d["mode"]|"";
    if(!parseHex(s,32)||(mode!="archive"&&mode!="discard")){error(400,"Invalid offload request");return;}
    Id id=parseId(s);JsonDocument m;if(!readJson(path(id,".meta"),m)){error(404,"Unknown form");return;}
    if(mode=="archive" && (!d["verified"].as<bool>() || d["hash"].as<uint32_t>()!=m["hash"].as<uint32_t>())){error(409,"Verified client archive required");return;}
    formAddresses(m,id);
    m["state"]=mode=="archive"?"archived":"discarded";m["unread"]=false;
    if(!writeJson(path(id,".meta"),m)){error(507,"Cannot save offload record");return;}
    LittleFS.remove(path(id,".body"));
    stationDirty=true;
    // Cancel this body and stale inventories without restarting unrelated retries
    // or announcing the unchanged incident again.
    mesh->cancelPublish(id,true);retries.cancel(id);JsonDocument out;out["saved"]=true;respond(200,out);
  });
}
void setup() {
  Serial.begin(115200);delay(500);nodeId=ESP.getEfuseMac();bootSession=esp_random();prefs.begin("form8",false);
  receivedSequence=prefs.getULong("rxSequence",0);
  callsign=prefs.getString("call","");active=parse64(prefs.getString("incident",""));activeName=prefs.getString("name","");
  primary=prefs.getFloat("primary",primary);backup=prefs.getFloat("backup",backup);bandwidth=prefs.getFloat("bw",bandwidth);
  spreading=prefs.getUChar("sf",spreading);coding=prefs.getUChar("cr",coding);power=prefs.getChar("power",power);
  if(!validTxPower(power))power=power<TX_POWER_MIN_DBM?TX_POWER_MIN_DBM:TX_POWER_MAX_DBM;
  useBackup=prefs.getBool("alternate",false);txEnabled=prefs.getBool("tx",false);relayEnabled=prefs.getBool("relay",false);paused=prefs.getBool("paused",false);
  positionEnabled=prefs.getBool("posEnabled",true);positionInterval=prefs.getUInt("posInterval",600);
  if(positionInterval<60 || positionInterval>86400)positionInterval=600;
  // Match the partition label in partitions/*.csv. The library defaults to
  // "spiffs", which does not exist in our partition tables. Never auto-format.
  fsReady=LittleFS.begin(false,"/littlefs",10,"littlefs");
  Serial.printf("LittleFS partition 'littlefs': %s\n",fsReady?"mounted":"mount failed");
  if(fsReady){
    LittleFS.mkdir("/records");LittleFS.mkdir("/incidents");LittleFS.mkdir("/chat");
    recoverChat();
    // NVS survives filesystem uploads. Restore the active incident's index entry
    // so the incident list agrees with the saved selection without erasing it.
    if(active && !activeName.isEmpty()) {
      const String incidentPath="/incidents/"+hex64(active)+".json";
      JsonDocument entry;
      if(!readJson(incidentPath,entry) || String(entry["id"]|"")!=hex64(active) || String(entry["name"]|"")!=activeName) {
        entry.clear();entry["id"]=hex64(active);entry["name"]=activeName;
        if(!writeJson(incidentPath,entry))Serial.println("Cannot restore active incident index");
      }
    }
    // Recover uncommitted bodies and interrupted offloads without formatting.
    std::vector<String> garbage;File dir=LittleFS.open("/records");File f=dir.openNextFile();
    while(f){String name=f.name();f.close();int slash=name.lastIndexOf('/');if(slash>=0)name=name.substring(slash+1);
      if(name.endsWith(".tmp"))garbage.push_back("/records/"+name);
      else if(name.endsWith(".body")){Id id{};if(!recordFileId(name,id)){f=dir.openNextFile();continue;}JsonDocument m;
        if(!readJson(path(id,".meta"),m) || String(m["state"]|"")!="stored")garbage.push_back(path(id,".body"));
      }f=dir.openNextFile();
    }
    for(const auto& name:garbage)LittleFS.remove(name);
  }
  mesh=new Mesh(nodeId,esp_random());mesh->setIncident(active);mesh->contains=have;mesh->load=loadRecord;mesh->persist=[](const Record& record){
    const bool saved=persistRecord(record);
    if(!saved)Serial.printf("Received form save failed: %s\n",persistError);
    return saved;
  };
  mesh->identityRequested=[](){return radioReady && txEnabled && !paused && validCall(callsign) && queueAnnouncement(millis());};
  mesh->hello=onHello;mesh->position=onPosition;mesh->receipt=[](const Id& id,uint64_t p,uint32_t hash,bool human){recordReceipt(id,p,hash,human);};
  mesh->chatContains=[](const Id& id,uint32_t hash){JsonDocument m;return readJson(chatPath(id),m) && m["hash"].as<uint32_t>()==hash && parse64(m["incident"]|"")==active;};
  mesh->chatPersist=saveChat;mesh->chatReceipt=chatReceipt;
  mesh->humanAcknowledged=[](const Id& id,uint32_t hash){
    JsonDocument m;if(!readJson(path(id,".meta"),m) || m["hash"].as<uint32_t>()!=hash || !canHumanAcknowledge(nodeId,parse64(m["origin"]|"")))return false;
    for(JsonObject r:m["receipts"].as<JsonArray>())if(r["id"]==hex64(nodeId) && r["human"].as<bool>())return true;
    return false;
  };
  boardPower();SPI.begin(RADIO_SCK,RADIO_MISO,RADIO_MOSI);initRadio();
  beginGps();
  WiFi.mode(WIFI_AP);
  // Use the AP MAC in network byte order. The tail of getEfuseMac()'s
  // integer representation contains the shared manufacturer bytes.
  String apMac=WiFi.softAPmacAddress();apMac.replace(":","");apMac.toLowerCase();
  ssid="form8-"+apMac.substring(apMac.length()-4);
  password=prefs.getString("apPassword","");
  // Bind saved credentials to this device so cloned NVS settings cannot
  // carry the same password to every node. Migrate old unbound passwords once.
  if(password.length()!=8 || prefs.getString("apPasswordMac","")!=apMac){
    char code[9];snprintf(code,sizeof(code),"%08lu",static_cast<unsigned long>(esp_random()%100000000));
    password=code;prefs.putString("apPassword",password);prefs.putString("apPasswordMac",apMac);
  }
  WiFi.softAP(ssid.c_str(),password.c_str());
  Serial.printf("\nForm8 %s\nSSID: %s\nPassword: %s\nOpen http://192.168.4.1\nRadio: %d\n",BOARD_NAME,ssid.c_str(),password.c_str(),radioError);
  showAccessPoint(ssid, password);
  api();
  server.onNotFound([]{
    if(server.method()!=HTTP_GET){error(404,"Unknown API route");return;}
    String uri=server.uri();if(uri=="/")uri="/index.html";
    if(uri.indexOf("..")>=0 || !(uri=="/index.html" || uri=="/app.js" || uri=="/theme.js" || uri=="/position-client.js" || uri=="/map.js" || uri=="/map-model.js" || uri=="/map-store.js" || uri=="/model.js" || uri=="/unread.js" || uri=="/style.css" || uri=="/sw.js" || uri=="/manifest.webmanifest" || uri=="/icon.svg")){error(404,"Not found");return;}
    for(const auto& asset:WEB_ASSETS)if(uri==asset.path){server.sendHeader("Cache-Control","no-cache");server.send_P(200,asset.mime,asset.body);return;}
    error(404,"Not found");
  });server.begin();
  bluetoothName="Form8-"+ssid.substring(6);
  if(!bluetooth.begin(bluetoothName,strtoul(password.substring(password.length()-6).c_str(),nullptr,10)))Serial.println("Bluetooth initialization failed; Wi-Fi remains available.");
}
void serialConsole() {
  // Headless boards need a way to retrieve credentials after startup output.
  static String command;static bool overflow=false;
  for(unsigned count=0;count<32 && Serial.available();++count){
    char c=Serial.read();if(c=='\r')continue;
    if(c=='\n'){
      if(!overflow && command=="wifi")Serial.printf("SSID: %s\nPassword: %s\nOpen http://192.168.4.1\n",ssid.c_str(),password.c_str());
      else if(command.length() || overflow)Serial.println("Command: wifi (print hotspot credentials)");
      command="";overflow=false;
    }else if(command.length()<16 && !overflow)command+=c;
    else overflow=true;
  }
}
String bluetoothRequest(const String& line){
  JsonDocument in,out;if(deserializeJson(in,line))return "";
  int request=in["request"]|0;out["request"]=request;
  if(!parseHex(in["client"]|"",32))out["error"]="Invalid companion identity";
  else if(String(in["op"]|"")=="hello"){
    JsonObject data=out["data"].to<JsonObject>();data["protocol"]="form8-api-v1";data["storage"]="radio";data["node"]=hex64(nodeId);data["board"]=BOARD_NAME;data["wifiPolicy"]="handoff";
  }else if(String(in["op"]|"")=="http")return apiGateway.dispatch(request,in["data"]);
  else out["error"]="Unknown operation";
  String response;serializeJson(out,response);response+='\n';return response;
}
void bluetoothHandoff(){
  bool connected=bluetooth.isConnected();if(connected==wifiSuspended)return;
  wifiSuspended=connected;
  if(connected){server.stop();WiFi.softAPdisconnect(true);WiFi.mode(WIFI_OFF);Serial.println("Bluetooth connected: Wi-Fi hotspot paused.");}
  else{WiFi.mode(WIFI_AP);WiFi.softAP(ssid.c_str(),password.c_str());server.begin();Serial.println("Bluetooth disconnected: Wi-Fi hotspot restored.");}
  stationDirty=true;
}
void loop() {
  serialConsole();
  bluetoothHandoff();bluetooth.poll(bluetoothRequest);
  if(!wifiSuspended)server.handleClient();uint32_t now=millis();readGps(gpsFix,now);
  for(auto* fix:{&gpsFix,&phoneFix})if(fix->valid && fix->ageMs(now)>POSITION_RETAIN_MS)fix->valid=false;
  for(auto& peer:peers)if(peer.position.valid && peer.position.ageMs(now)>POSITION_RETAIN_MS)peer.position.valid=false;
  if(radioReady && radioFlag) {
    radioFlag=false;
    if(transmitting){++txFrames;radio.finishTransmit();transmitting=false;mesh->transmitted(transmittingFrame,now);chatTransmitted(transmittingFrame,now);radio.setPacketReceivedAction(radioIRQ);radio.startReceive();
      if(transmittingLast){retries.sent(transmittingId,now);txNext=now+ACK_LISTEN_MS;}
      else if(transmittingFrame.kind==Kind::Chat && transmittingFrame.origin==nodeId && transmittingFrame.part+1==transmittingFrame.parts)txNext=now+ACK_LISTEN_MS;
      else txNext=now+100+esp_random()%600;
      transmittingLast=false;
    }
    else {
      receiveActivity.completed(now);
      uint8_t bytes[255];size_t len=radio.getPacketLength();
      if(len<=sizeof(bytes)) {
        lastRxError=radio.readData(bytes,len);
        if(lastRxError==RADIOLIB_ERR_NONE){
          ++rxPackets;Frame frame;if(decode(bytes,len,frame))++rxFrames;
          mesh->receive(bytes,len,now,100+esp_random()%1200);
          if(decode(bytes,len,frame))observePacket(frame,now,radio.getRSSI(),radio.getSNR());
        } else ++rxErrors;
      } else ++rxErrors;
      radio.startReceive();
    }
  }
  if(!radioReady || transmitting)receiveActivity.progress(false);
  else if(uint32_t(now-rxProgressAt)>=20){rxProgressAt=now;receiveActivity.progress(radioReceivingPacket());}
  const bool rxVisible=radioReady && !transmitting && receiveActivity.visible(now);
  bool canTransmit=radioReady && txEnabled && !paused && validCall(callsign);
  updateBattery(now);
  if(uint32_t(now-displayAt)>=500 || (rxVisible!=displayedRxActivity && uint32_t(now-displayAt)>=100)){
    displayAt=now;displayedRxActivity=rxVisible;refreshStationCounts();
    StationScreen station;station.callsign=callsign;station.incident=activeName;
    station.frequency=useBackup?backup:primary;station.batteryMv=batteryReading().millivolts;
    for(const auto& peer:peers)if(active && peer.incident==active && uint32_t(now-peer.last)<PEER_ONLINE_MS)++station.online;
    station.radioState=!radioReady?"RADIO ERROR":transmitting?"TX":rxVisible?"RXING":paused?"RF PAUSED":!txEnabled?"TX OFF":!validCall(callsign)?"SET CALLSIGN":"RF ON";
    station.bluetooth=bluetooth.isConnected();
    showStationStatus(ssid,password,bluetooth.isConnected()?1:WiFi.softAPgetStationNum(),outgoingMessages,unreadMessages,newestSender,station);
  }
  if(canTransmit && active && positionEnabled && positionSchedule.due(now,positionInterval)){
    const PositionFix fix=preferredPosition(gpsFix,phoneFix,now);
    if(fix.fresh(now)){
      PositionPacket packet{fix,bootSession,++positionSequence,callsign.c_str()};
      Frame f=mesh->control(Kind::Position);f.payload=encodePosition(packet,now);f.total=f.payload.size();
      if(mesh->queueFrame(f,now,esp_random()%5000))positionSchedule.queued(now);else positionSchedule.failed(now);
    }
  }
  if(canTransmit && broadcasts.helloDue(now)){
    if(!queueAnnouncement(now))broadcasts.helloFailed(now);
  }
  if(canTransmit && active && broadcasts.inventoryDue(now)){
    auto ids=allIds(true,true);
    if(broadcasts.beginInventory(now,ids.size()))inventoryCursor=0;
    const bool repairing=broadcasts.repairing();
    std::vector<InventoryEntry> page;size_t cursor=inventoryCursor;
    for(size_t count=0;count<8&&!ids.empty();++count){Id id=ids[cursor++%ids.size()];JsonDocument m;if(readJson(path(id,".meta"),m))page.push_back({id,m["hash"].as<uint32_t>()});if(cursor%ids.size()==0)break;}
    if(page.empty() || mesh->inventory(page,now)){
      inventoryCursor=cursor;broadcasts.inventoryQueued(now,esp_random());
      for(const auto& entry:page){
        if(repairing || !humanAckRetries.recoveryDue(entry.id,now))continue;
        JsonDocument m;if(readJson(path(entry.id,".meta"),m) && canHumanAcknowledge(nodeId,parse64(m["origin"]|"")))for(JsonObject r:m["receipts"].as<JsonArray>())
          if(r["id"]==hex64(nodeId)&&r["human"].as<bool>() && mesh->acknowledge(entry.id,entry.hash,true,now))humanAckRetries.recovered(entry.id,entry.hash,now);
      }
    }else broadcasts.inventoryFailed(now);
  }
  if(canTransmit && active && uint32_t(now-retryAt)>=1000){
    retryAt=now;humanAckRetries.service(now,[](const Id& id,uint32_t hash){return mesh->acknowledge(id,hash,true,millis());});auto ids=allIds(true,true);
    for(const auto& id:ids){JsonDocument m;
      if(!readJson(path(id,".meta"),m)||parse64(m["origin"]|"")!=nodeId)continue;
      if(!deliveryPending(m)){retries.cancel(id);mesh->cancelPublish(id);continue;}
      if(retries.due(id,now)){Record r;if(loadRecord(id,r)&&mesh->publish(r))retries.queued(id);}
    }
    chatRetries.service(now,[](const Id& id){Record r;return loadChat(id,r) && mesh->publish(r);});
  }
  // Leave receive mode running while idle. Restarting RX on every loop can
  // abort packets before their receive-complete interrupt is raised.
  if(canTransmit && !transmitting && !receiveActivity.receiving() && mesh->ready(now) && int32_t(now-txNext)>=0){
    if(mesh->pending()){
      radio.standby();int16_t scan=radio.scanChannel();
      if(scan!=RADIOLIB_CHANNEL_FREE){radioFlag=false;radio.setPacketReceivedAction(radioIRQ);radio.startReceive();txNext=now+500+esp_random()%2500;delay(1);return;}
      radioFlag=false;
    }
    Frame f;if(mesh->next(now,f)){
      auto bytes=encode(f);radio.standby();radio.setPacketSentAction(radioIRQ);radioFlag=false;
      int16_t result=radio.startTransmit(bytes.data(),bytes.size());
      if(result==RADIOLIB_ERR_NONE){transmitting=true;transmittingFrame=f;transmittingId=f.id;transmittingLast=f.kind==Kind::Data && f.origin==nodeId && f.part+1==f.parts;}
      else {
        radioError=result;
        const bool requeued=mesh->queueFrame(f,now,CONTROL_QUEUE_RETRY_MS);
        if(!requeued && f.origin==nodeId && dataKind(f.kind)){
          mesh->cancelPublish(f.id,true);
          if(f.kind==Kind::Chat)chatRetries.lost(f.id,now);else retries.cancel(f.id);
        }
        radio.setPacketReceivedAction(radioIRQ);radio.startReceive();txNext=now+CONTROL_QUEUE_RETRY_MS;
      }
    }else{radio.setPacketReceivedAction(radioIRQ);radio.startReceive();}
  }
  delay(1);
}
