#pragma once
// Included after the shared storage/HTTP helpers in main.cpp. Chat has its own
// bounded store, packet kinds and retry state; it never becomes a Form 8 record.
uint32_t chatOrder=0;
uint32_t chatRevision=0;
String chatPath(const Id& id){return "/chat/"+String(recordName(id).c_str())+".json";}
std::string chatString(JsonVariantConst value){
  JsonString s=value.as<JsonString>();return s?std::string(s.c_str(),s.size()):std::string{};
}
bool validChat(const JsonDocument& d){
  if(!validCall(d["sender"]|"") || !d["sentAt"].is<int64_t>())return false;
  const String type=d["type"]|"";
  if(type=="chat-message"){
    if(!d["text"].is<const char*>() || !validChatText(chatString(d["text"])))return false;
    if(!d["parent"].isNull() && (!d["parent"].is<const char*>() || !parseHex(d["parent"]|"",32) || emptyId(parseId(d["parent"]|""))))return false;
    return true;
  }
  return type=="chat-reaction" && parseHex(d["target"]|"",32) && !emptyId(parseId(d["target"]|"")) &&
    chatEmoji(chatString(d["emoji"])) && d["active"].is<bool>() && d["sequence"].is<uint32_t>() && d["sequence"].as<uint32_t>()>0;
}
struct ChatIndex {Id id{};uint32_t order=0;};
std::vector<ChatIndex> chatIds(bool activeOnly=true){
  std::vector<ChatIndex> result;if(!fsReady)return result;
  File dir=LittleFS.open("/chat");File file=dir.openNextFile();
  while(file){String name=file.name();file.close();int slash=name.lastIndexOf('/');if(slash>=0)name=name.substring(slash+1);Id id{};
    if(name.endsWith(".json") && recordFileId(name,id)){
      JsonDocument m;if(readJson(chatPath(id),m) && (!activeOnly || parse64(m["incident"]|"")==active))result.push_back({id,m["order"]|uint32_t(0)});
    }file=dir.openNextFile();
  }
  std::sort(result.begin(),result.end(),[](const ChatIndex& a,const ChatIndex& b){return a.order<b.order;});return result;
}
void recoverChat(){
  // Temporary writes never count as received; retrying the event can save it again.
  std::vector<String> temporary;File dir=LittleFS.open("/chat");File file=dir.openNextFile();
  while(file){String name=file.name();file.close();int slash=name.lastIndexOf('/');if(slash>=0)name=name.substring(slash+1);
    if(name.endsWith(".tmp"))temporary.push_back("/chat/"+name);file=dir.openNextFile();
  }
  for(const auto& name:temporary)LittleFS.remove(name);
  for(const auto& item:chatIds(false))chatOrder=std::max(chatOrder,item.order);
}
bool chatHave(const Id& id){return fsReady && LittleFS.exists(chatPath(id));}
bool loadChat(const Id& id,Record& r){
  JsonDocument m;if(!fsReady || !readJson(chatPath(id),m))return false;
  r={id,parse64(m["incident"]|""),parse64(m["origin"]|""),0,m["hash"].as<uint32_t>(),chatString(m["body"]),Kind::Chat};
  return !r.body.empty() && r.body.size()<=768 && crc32(r.body)==r.hash;
}
bool saveChat(const Record& r){
  if(!fsReady || r.kind!=Kind::Chat || r.incident!=active || emptyId(r.id) || r.body.size()>768 || crc32(r.body)!=r.hash)return false;
  JsonDocument old;if(readJson(chatPath(r.id),old))return old["hash"].as<uint32_t>()==r.hash && parse64(old["origin"]|"")==r.origin && parse64(old["incident"]|"")==r.incident;
  JsonDocument body;if(deserializeJson(body,r.body) || !validChat(body))return false;
  if(LittleFS.totalBytes()-LittleFS.usedBytes()<STORAGE_RESERVE+r.body.size()+4096)return false;
  JsonDocument m;m["id"]=hexId(r.id);m["incident"]=hex64(r.incident);m["origin"]=hex64(r.origin);m["hash"]=r.hash;
  m["body"]=r.body;m["order"]=++chatOrder;m["attempts"]=0;m["receipts"].to<JsonArray>();
  if(!writeJson(chatPath(r.id),m))return false;
  ++chatRevision;
  // Commit before pruning, so a failed write never destroys a previous message.
  auto records=chatIds(false);
  for(size_t i=0;i+CHAT_RECORDS<records.size();++i){
    if(mesh)mesh->cancelPublish(records[i].id,true);
    chatRetries.cancel(records[i].id);LittleFS.remove(chatPath(records[i].id));
  }
  return true;
}
void chatReceipt(const Id& id,uint64_t peer,uint32_t hash){
  JsonDocument m;if(!readJson(chatPath(id),m) || parse64(m["incident"]|"")!=active || m["hash"].as<uint32_t>()!=hash)return;
  const String who=hex64(peer);JsonArray receipts=m["receipts"].as<JsonArray>();
  for(JsonObject receipt:receipts)if(receipt["id"]==who)return;
  if(receipts.size()>=MAX_PEERS)return;
  JsonObject receipt=receipts.add<JsonObject>();receipt["id"]=who;
  for(const auto& p:peers)if(p.id==peer)receipt["callsign"]=p.call;
  if(writeJson(chatPath(id),m)){
    ++chatRevision;
    if(parse64(m["origin"]|"")==nodeId){chatRetries.cancel(id);mesh->cancelPublish(id);}
  }
}
void chatTransmitted(const Frame& f,uint32_t now){
  if(f.kind!=Kind::Chat || f.origin!=nodeId || f.part+1!=f.parts)return;
  const uint8_t attempts=chatRetries.sent(f.id,now);
  if(attempts){JsonDocument m;if(readJson(chatPath(f.id),m)){m["attempts"]=attempts;if(writeJson(chatPath(f.id),m))++chatRevision;}}
}
void chatApi(){
  apiOn("/api/chat",HTTP_GET,[]{
    JsonDocument out;out["incident"]=hex64(active);
    const String version=String(bootSession,HEX)+"-"+String(chatRevision);out["version"]=version;
    if(apiArg("since")==version){out["unchanged"]=true;respond(200,out);return;}
    JsonArray messages=out["messages"].to<JsonArray>();auto records=chatIds();
    // Only keep the newest 30 text messages in this HTTP response.
    std::vector<Id> texts;
    struct Reaction {String target,emoji,call;uint64_t origin=0;uint32_t sequence=0;bool enabled=false,acked=false,retrying=false;};
    std::vector<Reaction> reactions;
    for(const auto& item:records){JsonDocument m,body;if(!readJson(chatPath(item.id),m)||deserializeJson(body,chatString(m["body"])))continue;
      if(String(body["type"]|"")=="chat-message")texts.push_back(item.id);
      else if(String(body["type"]|"")=="chat-reaction"){
        Reaction next;next.target=body["target"]|"";next.emoji=body["emoji"]|"";next.call=body["sender"]|"";
        next.origin=parse64(m["origin"]|"");next.sequence=body["sequence"]|uint32_t(0);next.enabled=body["active"]|false;
        next.acked=m["receipts"].size()>0;next.retrying=chatRetries.active(item.id);bool found=false;
        for(auto& previous:reactions)if(previous.target==next.target && previous.origin==next.origin && previous.emoji==next.emoji){
          if(int32_t(next.sequence-previous.sequence)>0)previous=next;found=true;break;
        }if(!found)reactions.push_back(next);
      }
    }
    const size_t start=texts.size()>30?texts.size()-30:0;
    for(size_t i=start;i<texts.size();++i){JsonDocument m,body;if(!readJson(chatPath(texts[i]),m)||deserializeJson(body,chatString(m["body"])))continue;
      JsonObject message=messages.add<JsonObject>();message["id"]=m["id"];message["origin"]=m["origin"];message["order"]=m["order"];
      message["sender"]=body["sender"];message["text"]=body["text"];message["sentAt"]=body["sentAt"];message["parent"]=body["parent"];
      message["receipts"]=m["receipts"];message["attempts"]=m["attempts"];message["retrying"]=chatRetries.active(texts[i]);
      JsonArray list=message["reactions"].to<JsonArray>();
      for(const auto& reaction:reactions)if(reaction.target==hexId(texts[i]) && reaction.enabled){JsonObject value=list.add<JsonObject>();
        value["emoji"]=reaction.emoji;value["callsign"]=reaction.call;value["origin"]=hex64(reaction.origin);value["acked"]=reaction.acked;value["retrying"]=reaction.retrying;
      }
    }respond(200,out);
  });
  apiOn("/api/chat",HTTP_POST,[]{
    JsonDocument inputDoc;if(!input(inputDoc))return;
    if(!fsReady || !active || !validCall(callsign)){error(409,"Set callsign and join an incident first");return;}
    if(String(inputDoc["incident"]|"")!=hex64(active)){error(409,"Chat belongs to another incident; review it before sending");return;}
    const String token=inputDoc["clientToken"]|"";Id id=parseId(token);
    if(!parseHex(token,32) || emptyId(id)){error(400,"A chat submission token is required");return;}
    if(have(id)){error(409,"Submission token belongs to a form");return;}
    JsonDocument previous;
    if(readJson(chatPath(id),previous)){
      if(parse64(previous["incident"]|"")!=active || parse64(previous["origin"]|"")!=nodeId){error(409,"Chat token already in use");return;}
      JsonDocument out;out["id"]=token;out["existing"]=true;respond(200,out);return;
    }
    JsonDocument body;body["type"]=inputDoc["type"];body["sender"]=callsign;body["sentAt"]=static_cast<int64_t>(time(nullptr));
    if(String(inputDoc["type"]|"")=="chat-message"){
      body["text"]=inputDoc["text"];if(!inputDoc["parent"].isNull())body["parent"]=inputDoc["parent"];
    }else{
      body["target"]=inputDoc["target"];body["emoji"]=inputDoc["emoji"];body["active"]=inputDoc["active"];
      const String target=inputDoc["target"]|"";Record parent;JsonDocument parentBody;
      if(!parseHex(target,32)||!loadChat(parseId(target),parent)||parent.incident!=active||deserializeJson(parentBody,parent.body)||String(parentBody["type"]|"")!="chat-message"){
        error(404,"Reaction target is no longer in this incident's chat history");return;
      }
      uint32_t sequence=prefs.getULong("chatSeq",0)+1;if(!sequence)sequence=1;
      body["sequence"]=sequence;
      if(!prefs.putULong("chatSeq",sequence)){error(507,"Cannot save reaction sequence");return;}
    }
    if(!validChat(body)){error(400,"Chat needs 1–200 UTF-8 bytes of text, a valid reply ID, or a supported emoji reaction");return;}
    String serialized;serializeJson(body,serialized);Record r{id,active,nodeId,0,0,serialized.c_str(),Kind::Chat};r.hash=crc32(r.body);
    if(!saveChat(r)){error(507,"Cannot save chat; check storage space");return;}
    chatRetries.begin(id,millis());JsonDocument out;out["id"]=token;out["saved"]=true;respond(201,out);
  });
}
