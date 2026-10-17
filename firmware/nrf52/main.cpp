// nRF52840 radio bridge. Bodies are acknowledged only after durable companion commit.
#include <Arduino.h>
#include <SPI.h>
#include <bluefruit.h>
#include <InternalFileSystem.h>
#include <ArduinoJson.h>
#include <RadioLib.h>
#include <TinyGPSPlus.h>
#include <Mesh.h>
#include <NodeId.h>
#include <TrafficSchedule.h>
#include <Chat.h>
#include "Pins.h"
using namespace form8;
using namespace Adafruit_LittleFS_Namespace;
BLEUart uart;
#ifdef NRF_LR1110
LR1110 radio=new Module(NRF_CS,NRF_IRQ,NRF_RESET,NRF_BUSY);
#else
SX1262 radio=new Module(NRF_CS,NRF_IRQ,NRF_RESET,NRF_BUSY);
#endif
uint64_t nodeId; uint32_t bootSession,hostAt=0,sequence=0;
Mesh* mesh; BroadcastSchedule broadcasts; HumanAckRetries humanRetries; PositionSchedule positionSchedule;
JsonDocument config; String client; int owner=-1; bool ready=false,transmitting=false,fsReady=false;
volatile bool radioIrq=false; Frame inFlight; uint32_t txAt=0,txTimeout=10000,nextTx=0,rxPackets=0,rxFrames=0,rxErrors=0,txFrames=0;
uint32_t epochBase=0,epochAt=0;
int radioError=0,lastRxError=0; TinyGPSPlus gps; PositionFix gpsFix,phoneFix;
struct Peer {uint64_t id,incident;String call,name;uint32_t last,session;PositionFix position;};
struct Known {Id id;uint64_t incident;uint32_t hash;bool body,chat,human;};
std::vector<Peer> peers; std::vector<Known> known; std::vector<Record> pending;
struct Event {uint32_t seq;String json;}; std::vector<Event> events;uint32_t eventSeq=0;
String inputLines[2],output[2];size_t outputAt[2]={0,0};bool overflow[2]={false,false};
String hex64(uint64_t n){const auto value=formatNodeId(n);return value.data();}
String hexId(const Id& id){char b[33];for(size_t i=0;i<16;i++)snprintf(b+i*2,3,"%02x",id[i]);return b;}
bool hexValid(const String& s,size_t n){if(s.length()!=n)return false;for(size_t i=0;i<s.length();i++)if(!isxdigit(s[i]))return false;return true;}
uint64_t parse64(const String& s){return strtoull(s.c_str(),nullptr,16);}
Id parseId(const String& s){Id id{};if(hexValid(s,32))for(size_t i=0;i<16;i++)id[i]=strtoul(s.substring(i*2,i*2+2).c_str(),nullptr,16);return id;}
uint64_t incident(){return parse64(config["incident"]|"0");}
bool hostLive(){return owner>=0 && uint32_t(millis()-hostAt)<15000;}
bool canTx(){return ready && config["txEnabled"].as<bool>() && !config["paused"].as<bool>() && validPositionCall((config["callsign"]|""));}
Known* findKnown(const Id& id){for(auto& k:known)if(k.id==id)return &k;return nullptr;}
void event(JsonDocument& d){if(events.size()>=32)return;d["seq"]=++eventSeq;String s;serializeJson(d,s);events.push_back({eventSeq,s});}
void receiptEvent(const Id& id,uint64_t peer,uint32_t hash,bool human,bool chat){JsonDocument d;d["event"]="receipt";d["id"]=hexId(id);d["peer"]=hex64(peer);d["hash"]=hash;d["human"]=human;d["chat"]=chat;event(d);}
void defaults(){config["callsign"]="";config["incident"]="0000000000000000";config["incidentName"]="";config["primary"]=915.0;config["backup"]=906.0;config["useBackup"]=false;config["bandwidth"]=500;config["sf"]=9;config["cr"]=8;config["power"]=14;config["txEnabled"]=false;config["paused"]=false;config["positionEnabled"]=true;config["positionInterval"]=600;}
bool saveConfig(){InternalFS.remove("/config.next");File f(InternalFS);if(!f.open("/config.next",FILE_O_WRITE))return false;size_t n=serializeJson(config,f);f.close();if(n!=measureJson(config))return false;InternalFS.remove("/config.backup");if(InternalFS.exists("/config.json")&&!InternalFS.rename("/config.json","/config.backup"))return false;if(!InternalFS.rename("/config.next","/config.json")){InternalFS.rename("/config.backup","/config.json");return false;}InternalFS.remove("/config.backup");return true;}
void setPin(int pin,bool level){pinMode(pin,OUTPUT);digitalWrite(pin,level);}
void rfPath(bool tx){
#ifdef NRF_AMPLIFIED
  digitalWrite(NRF_FEM_RX,tx?HIGH:LOW);
#endif
}
bool receivingPacket(){
#ifdef NRF_LR1110
 auto flags=radio.getIrqStatus();
 return (flags&RADIOLIB_LR11X0_IRQ_SYNC_WORD_HEADER_VALID)&&!(flags&(RADIOLIB_LR11X0_IRQ_RX_DONE|RADIOLIB_LR11X0_IRQ_TIMEOUT|RADIOLIB_LR11X0_IRQ_CRC_ERR|RADIOLIB_LR11X0_IRQ_HEADER_ERR));
#else
 auto flags=radio.getIrqFlags();
 return (flags&RADIOLIB_SX126X_IRQ_HEADER_VALID)&&!(flags&(RADIOLIB_SX126X_IRQ_RX_DONE|RADIOLIB_SX126X_IRQ_TIMEOUT|RADIOLIB_SX126X_IRQ_CRC_ERR|RADIOLIB_SX126X_IRQ_HEADER_ERR));
#endif
}
void startRx(){rfPath(false);radioIrq=false;radio.startReceive();}
void initRadio(){ready=false;transmitting=false;radio.standby();rfPath(false);
  float frequency=config[config["useBackup"].as<bool>()?"backup":"primary"];
#ifdef NRF_LR1110
  radioError=radio.begin(frequency,config["bandwidth"],config["sf"],config["cr"],0x12,config["power"],8,1.6);
  static const uint32_t pins[]={RADIOLIB_LR11X0_DIO5,RADIOLIB_LR11X0_DIO6,RADIOLIB_LR11X0_DIO7,RADIOLIB_LR11X0_DIO8,RADIOLIB_NC};
  static const Module::RfSwitchMode_t table[]={
    {LR11x0::MODE_STBY,{0,0,0,0}},{LR11x0::MODE_RX,{1,0,0,1}},{LR11x0::MODE_TX,{1,1,0,1}},
    {LR11x0::MODE_TX_HP,{0,1,0,1}},{LR11x0::MODE_TX_HF,{0,0,0,0}},{LR11x0::MODE_GNSS,{0,0,1,0}},
    {LR11x0::MODE_WIFI,{0,0,0,0}},END_OF_MODE_TABLE};
  if(!radioError)radio.setRfSwitchTable(pins,table);
#else
  radioError=radio.begin(frequency,config["bandwidth"],config["sf"],config["cr"],0x12,config["power"],8,1.8);
  if(!radioError)radioError=radio.setDio2AsRfSwitch(true);
#ifdef NRF_RXEN
  radio.setRfSwitchPins(NRF_RXEN,RADIOLIB_NC);
#endif
#endif
  if(!radioError){
#ifdef NRF_LR1110
 radio.setIrqAction([](){radioIrq=true;});
#else
 radio.setDio1Action([](){radioIrq=true;});
#endif
ready=true;startRx();}
}
void positionJson(JsonObject d,const PositionFix& p){d["lat"]=p.lat;d["lon"]=p.lon;d["accuracy"]=p.accuracy;d["ageMs"]=p.ageMs(millis());d["source"]=p.radio?"radio":"device";d["fresh"]=p.fresh(millis());}
void status(JsonDocument& d){d.set(config);d["node"]=hex64(nodeId);d["bootSession"]=bootSession;d["board"]=NRF_BOARD_NAME;d["band"]="uhf";d["frequency"]=config[config["useBackup"].as<bool>()?"backup":"primary"];d["powerMin"]=2;d["powerMax"]=22;
#ifdef NRF_AMPLIFIED
 d["powerIsDrive"]=true;d["powerNote"]="External amplifier; value is chip drive";
#endif
 d["radioReady"]=ready;d["radioError"]=radioError;d["fsReady"]=fsReady;d["queue"]=mesh->pending(false);d["dropped"]=mesh->dropped;d["rxPackets"]=rxPackets;d["rxFrames"]=rxFrames;d["rxErrors"]=rxErrors;d["lastRxError"]=lastRxError;d["txFrames"]=txFrames;d["clockSource"]=epochBase?"phone/laptop":"unset";d["epoch"]=epochBase?epochBase+uint32_t(millis()-epochAt)/1000:0;
#ifndef NRF_NO_GPS
 d["gpsAvailable"]=true;
#endif
 d["gpsFresh"]=gpsFix.fresh(millis());auto p=preferredPosition(gpsFix,phoneFix,millis());if(p.valid)positionJson(d["location"].to<JsonObject>(),p);
 JsonArray a=d["peers"].to<JsonArray>();for(auto& peer:peers){auto o=a.add<JsonObject>();o["id"]=hex64(peer.id);o["incident"]=hex64(peer.incident);o["callsign"]=peer.call;o["name"]=peer.name;o["online"]=uint32_t(millis()-peer.last)<PEER_ONLINE_MS;if(peer.position.valid && peer.position.ageMs(millis())<POSITION_RETAIN_MS)positionJson(o["location"].to<JsonObject>(),peer.position);}
 // Estimated voltage, not a calibrated fuel gauge. Use the board's resistor divider.
 analogReadResolution(12);analogReference(AR_INTERNAL_3_0);float volts=analogRead(NRF_BATTERY)*3.0f/4095*NRF_BAT_RATIO;
 if(volts>2.5f && volts<4.6f){d["batteryMillivolts"]=int(volts*1000);d["batteryVoltage"]=volts;d["batteryPercent"]=int(constrain((volts-3.3f)/0.9f*100,0,100));}
 JsonArray ids=d["pending"].to<JsonArray>();for(auto& r:pending)ids.add(hexId(r.id));
 JsonArray es=d["events"].to<JsonArray>();for(auto& e:events){JsonDocument j;deserializeJson(j,e.json);es.add(j.as<JsonVariant>());}
}
void reply(int transport,int request,JsonDocument& data,const char* error=nullptr){JsonDocument d;d["request"]=request;if(error)d["error"]=error;else d["data"]=data;String s;serializeJson(d,s);s+='\n';if(output[transport].length()-outputAt[transport]+s.length()>24000)return;output[transport]=output[transport].substring(outputAt[transport])+s;outputAt[transport]=0;}
void rpc(int transport,const String& line){JsonDocument in,out;if(deserializeJson(in,line))return;int request=in["request"]|0;String op=in["op"]|"",who=in["client"]|"";JsonVariant d=in["data"];const char* error=nullptr;
 if(who.length()!=32){reply(transport,request,out,"Invalid client identity");return;}
 if(hostLive() && client!=who){reply(transport,request,out,"Another companion is connected");return;}
 owner=transport;client=who;hostAt=millis();
 if(op=="hello" || op=="status")status(out);
 else if(op=="eventsAck"){uint32_t seq=d["seq"];events.erase(std::remove_if(events.begin(),events.end(),[&](const Event& e){return e.seq<=seq;}),events.end());out["saved"]=true;}
 else if(op=="known"){
   auto a=d["records"].as<JsonArray>();if(a.size()>16)error="Index batch too large";
   else{if(d["reset"].as<bool>())known.clear();for(JsonObject v:a){String s=v["id"]|"",i=v["incident"]|"";if(!hexValid(s,32)||!hexValid(i,16)){error="Invalid index";break;}Known k{parseId(s),parse64(i),v["hash"].as<uint32_t>(),v["body"].as<bool>(),v["chat"].as<bool>(),v["human"].as<bool>()};auto p=findKnown(k.id);if(p)*p=k;else if(known.size()<512)known.push_back(k);else{error="Radio index full (512)";break;}}out["saved"]=!error;}
 }
 else if(op=="config"){
   JsonDocument before;before.set(config);String call=d["callsign"]|"";float primary=d["primary"],backup=d["backup"],bw=d["bandwidth"];int sf=d["sf"],cr=d["cr"],power=d["power"],interval=d["positionInterval"];
   if(!validPositionCall(call.c_str())||primary<850||primary>930||(backup!=0&&(backup<850||backup>930))||(d["useBackup"].as<bool>()&&backup==0)||(bw!=125 && bw!=250 && bw!=500)||sf<7||sf>12||cr<5||cr>8||power<2||power>22||interval<60||interval>86400)error="Invalid station settings";
   else{for(JsonPair p:d.as<JsonObject>())if(config[p.key()].is<bool>()||String(p.key().c_str())=="callsign"||String(p.key().c_str())=="primary"||String(p.key().c_str())=="backup"||String(p.key().c_str())=="bandwidth"||String(p.key().c_str())=="sf"||String(p.key().c_str())=="cr"||String(p.key().c_str())=="power"||String(p.key().c_str())=="positionInterval")config[p.key()]=p.value();if(!saveConfig()){config.set(before);error="Cannot save radio config";}else{initRadio();broadcasts.reset(millis());status(out);}}
 }
 else if(op=="leave"){
   JsonDocument before;before.set(config);config["incident"]="0000000000000000";config["incidentName"]="";
   if(!saveConfig()){config.set(before);error="Cannot save incident change";}
   else{mesh->setIncident(0);pending.clear();humanRetries.clear();broadcasts.reset(millis());positionSchedule.reset(millis());status(out);}
 }
 else if(op=="incident"){String id=d["id"]|"",name=d["name"]|"";if(!hexValid(id,16)||!parse64(id)||!name.length()||name.length()>80)error="Invalid incident";else{JsonDocument before;before.set(config);config["incident"]=id;config["incidentName"]=name;if(!saveConfig()){config.set(before);error="Cannot save incident";}else{mesh->setIncident(incident());pending.clear();humanRetries.clear();broadcasts.reset(millis());positionSchedule.reset(millis());out["saved"]=true;}}}
 else if(op=="time"){uint32_t epoch=d["epoch"]|0;if(epoch<1577836800||epoch>4102444800UL)error="Invalid epoch";else{epochBase=epoch;epochAt=millis();out["saved"]=true;}}
 else if(op=="position"){double lat=d["lat"],lon=d["lon"];int age=d["ageMs"]|0;if(!validCoordinates(lat,lon)||age<0||age>120000)error="Invalid position";else{phoneFix={lat,lon,d["accuracy"]|-1,false,true,millis(),uint32_t(age)};out["saved"]=true;}}
 else if(op=="pending"){String id=d["id"]|"";auto p=std::find_if(pending.begin(),pending.end(),[&](const Record& r){return hexId(r.id)==id;});if(p==pending.end())error="Pending body not found";else{out["id"]=id;out["incident"]=hex64(p->incident);out["origin"]=hex64(p->origin);out["hash"]=p->hash;out["priority"]=p->priority;out["chat"]=p->kind==Kind::Chat;out["body"]=p->body;}}
 else if(op=="reject"){Id id=parseId(d["id"]|"");uint32_t hash=d["hash"];pending.erase(std::remove_if(pending.begin(),pending.end(),[&](const Record& r){return r.id==id&&r.hash==hash;}),pending.end());out["removed"]=true;}
 else if(op=="commit"){Id id=parseId(d["id"]|"");uint32_t hash=d["hash"];auto p=std::find_if(pending.begin(),pending.end(),[&](const Record& r){return r.id==id&&r.hash==hash;});if(p==pending.end()){if(!findKnown(id))error="Pending record not found";}else if(known.size()>=512&&!findKnown(id))error="Radio index full";else{Known k{id,p->incident,hash,true,p->kind==Kind::Chat,false};auto v=findKnown(id);if(v)*v=k;else known.push_back(k);mesh->acknowledge(id,hash,false,millis(),k.chat);pending.erase(p);}out["saved"]=!error;}
 else if(op=="publish"){String id=d["id"]|"",inc=d["incident"]|"";Record r{parseId(id),parse64(inc),parse64(d["origin"]|""),d["priority"].as<uint8_t>(),d["hash"].as<uint32_t>(),std::string(d["body"]|""),d["chat"].as<bool>()?Kind::Chat:Kind::Data};if(!hexValid(id,32)||!r.origin||r.incident!=incident()||crc32(r.body)!=r.hash)error="Invalid record or incident";else out["queued"]=mesh->publish(r,d["repair"].as<bool>());}
 else if(op=="ack"){Id id=parseId(d["id"]|"");auto k=findKnown(id);if(!k||k->incident!=incident()||k->chat)error="Stored active form required";else{k->human=true;humanRetries.begin(id,k->hash,millis(),mesh->acknowledge(id,k->hash,true,millis()));out["saved"]=true;}}
 else if(op=="offload"){auto k=findKnown(parseId(d["id"]|""));if(!k)error="Unknown record";else{k->body=false;mesh->cancelPublish(k->id,true);out["saved"]=true;}}
 else if(op=="cancel"){mesh->cancelPublish(parseId(d["id"]|""));out["saved"]=true;}
 else error="Unknown operation";
 reply(transport,request,out,error);
}
void readByte(int t,char c){if(c=='\n'){if(!overflow[t]&&inputLines[t].length())rpc(t,inputLines[t]);inputLines[t]="";overflow[t]=false;}else if(!overflow[t]&&c!='\r'){if(inputLines[t].length()<16384)inputLines[t]+=c;else{inputLines[t]="";overflow[t]=true;}}}
void setup(){Serial.begin(115200);nodeId=(uint64_t(NRF_FICR->DEVICEID[1])<<32)|NRF_FICR->DEVICEID[0];bootSession=0;NRF_RNG->TASKS_START=1;for(int i=0;i<4;i++){while(!NRF_RNG->EVENTS_VALRDY){}NRF_RNG->EVENTS_VALRDY=0;bootSession=(bootSession<<8)|NRF_RNG->VALUE;}NRF_RNG->TASKS_STOP=1;randomSeed(bootSession);
 defaults();fsReady=InternalFS.begin();if(fsReady){if(!InternalFS.exists("/config.json")&&InternalFS.exists("/config.backup"))InternalFS.rename("/config.backup","/config.json");File f(InternalFS);if(f.open("/config.json",FILE_O_READ)){JsonDocument saved;if(!deserializeJson(saved,f))for(JsonPair p:saved.as<JsonObject>())config[p.key()]=p.value();f.close();}}
#ifdef FORM8_POWER_PIN
 setPin(FORM8_POWER_PIN,HIGH);
#endif
#ifdef NRF_AMPLIFIED
 setPin(NRF_FEM_EN,HIGH);setPin(NRF_FEM_POWER,HIGH);setPin(NRF_FEM_RX,LOW);
#endif
#ifdef NRF_BAT_EN
 setPin(NRF_BAT_EN,NRF_BAT_EN_LEVEL);
#endif
#ifndef NRF_NO_GPS
#ifdef NRF_GPS_EN
 setPin(NRF_GPS_EN,NRF_GPS_EN_LEVEL);
#endif
#ifdef NRF_GPS_RESET
 setPin(NRF_GPS_RESET,NRF_GPS_RESET_LEVEL);
#endif
#ifdef NRF_LR1110
 setPin(8,HIGH);setPin(44,HIGH);setPin(15,LOW);pinMode(46,INPUT_PULLUP);
#endif
 #ifdef NRF_GPS_WAKE
 setPin(NRF_GPS_WAKE,HIGH);
#endif
 Serial1.begin(NRF_GPS_BAUD);
#endif
 SPI.begin();mesh=new Mesh(nodeId,bootSession);mesh->setIncident(incident());
 mesh->contains=[](const Id& id){auto k=findKnown(id);return hostLive()&&k&&k->incident==incident()&&!k->chat;};
 mesh->chatContains=[](const Id& id,uint32_t hash){auto k=findKnown(id);return hostLive()&&k&&k->chat&&k->hash==hash;};
 auto save=[](const Record& r){if(!hostLive())return false;for(auto& p:pending)if(p.id==r.id)return false;if(pending.size()<3)pending.push_back(r);return false;};mesh->persist=save;mesh->chatPersist=save;
 mesh->load=[](const Id& id,Record&){auto k=findKnown(id);if(hostLive()&&k&&k->body&&events.size()<32){JsonDocument e;e["event"]="repair";e["id"]=hexId(id);e["hash"]=k->hash;event(e);}return false;};
 mesh->humanAcknowledged=[](const Id& id,uint32_t hash){auto k=findKnown(id);return k&&k->human&&k->hash==hash;};
 mesh->receipt=[](const Id& id,uint64_t p,uint32_t hash,bool human){receiptEvent(id,p,hash,human,false);};mesh->chatReceipt=[](const Id& id,uint64_t p,uint32_t hash){receiptEvent(id,p,hash,false,true);};
 mesh->hello=[](const Frame& f){JsonDocument d;if(deserializeJson(d,f.payload.data(),f.payload.size()))return;String call=d["callsign"]|"",name=d["name"]|"";if(!validPositionCall(call.c_str()))return;if(name.length()&&!validChatText(std::string(name.c_str())))name="Incident "+hex64(f.incident);auto p=std::find_if(peers.begin(),peers.end(),[&](const Peer& p){return p.id==f.origin;});if(p==peers.end()){if(peers.size()>=31)peers.erase(std::min_element(peers.begin(),peers.end(),[](const Peer&a,const Peer&b){return a.last<b.last;}));peers.push_back({f.origin,f.incident,call,name,millis(),d["session"]|0,{}});broadcasts.discover(incident()&&incident()==f.incident);}else{if(p->incident!=f.incident||p->session!=d["session"].as<uint32_t>())broadcasts.discover(incident()==f.incident);p->incident=f.incident;p->call=call;p->name=name;p->last=millis();p->session=d["session"]|0;}};
 mesh->position=[](const Frame& f){PositionPacket p;if(!decodePosition(f.payload,p,millis()))return;for(auto& peer:peers)if(peer.id==f.origin){peer.position=p.fix;peer.last=millis();return;}};
 initRadio();broadcasts.reset(millis());positionSchedule.reset(millis());
 Bluefruit.autoConnLed(false);Bluefruit.configPrphBandwidth(BANDWIDTH_MAX);Bluefruit.begin();Bluefruit.setTxPower(4);String name="Form8-"+hex64(nodeId).substring(10);Bluefruit.setName(name.c_str());uart.begin();Bluefruit.Advertising.addFlags(BLE_GAP_ADV_FLAGS_LE_ONLY_GENERAL_DISC_MODE);Bluefruit.Advertising.addTxPower();Bluefruit.Advertising.addService(uart);Bluefruit.ScanResponse.addName();Bluefruit.Advertising.restartOnDisconnect(true);Bluefruit.Advertising.setInterval(32,244);Bluefruit.Advertising.start(0);
}
void loop(){uint32_t now=millis();for(int n=0;n<512&&Serial.available();n++)readByte(0,Serial.read());for(int n=0;n<512&&uart.available();n++)readByte(1,uart.read());
 for(int t=0;t<2;t++){if(t==0&&!Serial){output[t]="";outputAt[t]=0;continue;}if(t==1&&!Bluefruit.connected()){output[t]="";outputAt[t]=0;continue;}if(outputAt[t]<output[t].length()){size_t n=std::min(size_t(128),output[t].length()-outputAt[t]);size_t w=t==0?Serial.write((const uint8_t*)output[t].c_str()+outputAt[t],n):uart.write((const uint8_t*)output[t].c_str()+outputAt[t],n);outputAt[t]+=w;}if(outputAt[t]>=output[t].length()){output[t]="";outputAt[t]=0;}}
#ifndef NRF_NO_GPS
 for(int n=0;n<256&&Serial1.available();n++)gps.encode(Serial1.read());if(gps.location.isUpdated()&&gps.location.isValid())gpsFix={gps.location.lat(),gps.location.lng(),gps.hdop.isValid()?int(gps.hdop.hdop()*5):-1,true,true,now,uint32_t(gps.location.age())};
#endif
 if(ready&&radioIrq){radioIrq=false;if(transmitting){radio.finishTransmit();mesh->transmitted(inFlight,now);if(dataKind(inFlight.kind)&&inFlight.origin==nodeId&&!inFlight.repairReply&&inFlight.part+1==inFlight.parts&&events.size()<32){JsonDocument e;e["event"]="sent";e["id"]=hexId(inFlight.id);event(e);}txFrames++;transmitting=false;nextTx=now+(dataKind(inFlight.kind)&&inFlight.origin==nodeId&&inFlight.part+1==inFlight.parts?3000:random(100,700));startRx();}else{size_t len=radio.getPacketLength();uint8_t data[254];if(len<=sizeof(data)){rxPackets++;lastRxError=radio.readData(data,len);if(!lastRxError){Frame f;if(decode(data,len,f)){rxFrames++;mesh->receive(data,len,now,random(100,1300));}}else rxErrors++;}startRx();}}
 if(transmitting&&uint32_t(now-txAt)>txTimeout){transmitting=false;mesh->queueFrame(inFlight,now,2000);startRx();}
 if(canTx()){
 if(broadcasts.helloDue(now)){JsonDocument d;d["callsign"]=config["callsign"];String name=config["incidentName"]|"";size_t end=std::min(size_t(32),size_t(name.length()));while(end&&(uint8_t(name[end])&0xc0)==0x80)--end;d["name"]=name.substring(0,end);d["session"]=bootSession;String text;serializeJson(d,text);if(mesh->announce(text.c_str(),now))broadcasts.helloQueued(now,random(30001));else broadcasts.helloFailed(now);}
 if(incident()&&hostLive()&&broadcasts.inventoryDue(now)){std::vector<InventoryEntry> entries;for(auto& k:known)if(k.incident==incident()&&k.body&&!k.chat)entries.push_back({k.id,k.hash});static size_t cursor=0;if(broadcasts.beginInventory(now,entries.size()))cursor=0;std::vector<InventoryEntry> page;for(size_t n=0;n<8&&n<entries.size();n++)page.push_back(entries[(cursor+n)%entries.size()]);if(mesh->inventory(page,now)){if(!broadcasts.repairing())for(auto& entry:page){auto k=findKnown(entry.id);if(k&&k->human&&humanRetries.recoveryDue(k->id,now)&&mesh->acknowledge(k->id,k->hash,true,now))humanRetries.recovered(k->id,k->hash,now);}cursor=entries.empty()?0:(cursor+page.size())%entries.size();broadcasts.inventoryQueued(now,random(60001));}else broadcasts.inventoryFailed(now);}
 humanRetries.service(now,[](const Id& id,uint32_t h){return mesh->acknowledge(id,h,true,millis());});
 auto p=preferredPosition(gpsFix,phoneFix,now);if(incident()&&config["positionEnabled"].as<bool>()&&p.fresh(now)&&positionSchedule.due(now,config["positionInterval"])){PositionPacket packet{p,bootSession,++sequence,std::string(config["callsign"]|"")};Frame f=mesh->control(Kind::Position);f.payload=encodePosition(packet,now);f.total=f.payload.size();if(mesh->queueFrame(f,now,random(5000)))positionSchedule.queued(now);else positionSchedule.failed(now);}
 if(!transmitting&&int32_t(now-nextTx)>=0&&mesh->ready(now)&&!receivingPacket()){radio.standby();int cad=radio.scanChannel();if(cad==RADIOLIB_CHANNEL_FREE){Frame f;if(mesh->next(now,f)){auto data=encode(f);rfPath(true);radioIrq=false;int e=radio.startTransmit(data.data(),data.size());if(!e){inFlight=f;transmitting=true;txAt=now;txTimeout=radio.getTimeOnAir(data.size())/1000+3000;}else{mesh->queueFrame(f,now,2000);nextTx=now+2000;startRx();}}else startRx();}else{nextTx=now+random(500,3000);startRx();}}
 }delay(1);
}
