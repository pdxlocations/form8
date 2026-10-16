#pragma once
#include <algorithm>
#include <array>
#include <cstdint>
#include <cstring>
#include <functional>
#include <string>
#include <vector>

namespace form8 {
constexpr size_t CHUNK = 160, MAX_BODY = 4096, MAX_QUEUE = 48;
constexpr uint8_t MAX_HOPS = 5;
using Id = std::array<uint8_t, 16>;
inline bool emptyId(const Id& id) { return id == Id{}; }
inline uint32_t crc32(const uint8_t* data, size_t size) {
  uint32_t c = ~0u;
  for (size_t i = 0; i < size; ++i) {
    c ^= data[i];
    for (int b = 0; b < 8; ++b) c = (c >> 1) ^ (0xedb88320u & (0u - (c & 1)));
  }
  return ~c;
}
inline uint32_t crc32(const std::string& s) {
  return crc32(reinterpret_cast<const uint8_t*>(s.data()), s.size());
}
enum class Kind : uint8_t { Hello=1, Inventory=2, Request=3, Data=4, Receipt=5, HumanAck=6, Chat=7, ChatReceipt=8 };
inline bool dataKind(Kind kind){return kind==Kind::Data || kind==Kind::Chat;}
struct Frame {
  bool repairReply=false; // Local TX bookkeeping; never serialized on the wire.
  Kind kind = Kind::Data;
  uint8_t ttl = MAX_HOPS, priority = 0, part = 0, parts = 1;
  uint64_t origin = 0, incident = 0;
  Id id{};
  uint32_t nonce = 0, hash = 0;
  uint16_t total = 0;
  std::vector<uint8_t> payload;
};
inline void put(std::vector<uint8_t>& out, uint64_t v, size_t n) {
  for (size_t i=0; i<n; ++i) out.push_back(static_cast<uint8_t>(v >> (i*8)));
}
inline uint64_t get(const uint8_t* p, size_t n) {
  uint64_t v=0; for (size_t i=0; i<n; ++i) v |= uint64_t(p[i]) << (i*8); return v;
}
inline bool valid(const Frame& f) {
  const auto k = static_cast<uint8_t>(f.kind);
  if (k<1 || k>8 || !f.origin || f.ttl>MAX_HOPS || f.priority>3 || f.payload.size()>CHUNK) return false;
  if (f.kind != Kind::Hello && !f.incident) return false;
  if (dataKind(f.kind)) {
    if (emptyId(f.id) || !f.total || f.total>(f.kind==Kind::Chat?768:MAX_BODY) || f.parts!=(f.total+CHUNK-1)/CHUNK || f.part>=f.parts) return false;
    return f.payload.size() == std::min(CHUNK, size_t(f.total)-size_t(f.part)*CHUNK);
  }
  if (f.part || f.parts!=1 || f.total!=f.payload.size()) return false;
  if (f.kind == Kind::Inventory) return !f.payload.empty() && f.payload.size()%20==0;
  if (f.kind == Kind::Request || f.kind == Kind::Receipt || f.kind == Kind::HumanAck || f.kind==Kind::ChatReceipt)
    return !emptyId(f.id) && f.payload.empty();
  return !f.payload.empty();
}
// Explicit little-endian wire format; never serialize compiler struct layouts.
inline std::vector<uint8_t> encode(const Frame& f) {
  if (!valid(f)) return {};
  std::vector<uint8_t> out{'F','8',1,static_cast<uint8_t>(f.kind),f.ttl,f.priority,f.part,f.parts};
  put(out,f.origin,8); put(out,f.incident,8);
  out.insert(out.end(),f.id.begin(),f.id.end());
  put(out,f.nonce,4); put(out,f.hash,4); put(out,f.total,2);
  out.insert(out.end(),f.payload.begin(),f.payload.end());
  put(out,crc32(out.data(),out.size()),4); return out;
}
inline bool decode(const uint8_t* p, size_t n, Frame& f) {
  if (n<54 || n>54+CHUNK || p[0]!='F' || p[1]!='8' || p[2]!=1 || crc32(p,n-4)!=get(p+n-4,4)) return false;
  f.repairReply=false;f.kind=static_cast<Kind>(p[3]); f.ttl=p[4]; f.priority=p[5]; f.part=p[6]; f.parts=p[7];
  f.origin=get(p+8,8); f.incident=get(p+16,8); std::copy(p+24,p+40,f.id.begin());
  f.nonce=get(p+40,4); f.hash=get(p+44,4); f.total=get(p+48,2);
  f.payload.assign(p+50,p+n-4); return valid(f);
}
struct Record { Id id{}; uint64_t incident=0, origin=0; uint8_t priority=0; uint32_t hash=0; std::string body; Kind kind=Kind::Data; };
struct Assembly {
  Frame first;
  std::string body;
  uint32_t mask=0, touched=0;
};
class Reassembler {
  std::vector<Assembly> slots;
public:
  bool accept(const Frame& f, uint32_t now, Record& out) {
    if (!dataKind(f.kind) || !valid(f)) return false;
    slots.erase(std::remove_if(slots.begin(),slots.end(),[now](const Assembly& a){return uint32_t(now-a.touched)>120000;}),slots.end());
    auto it=std::find_if(slots.begin(),slots.end(),[&](const Assembly& a){return a.first.id==f.id && a.first.incident==f.incident && a.first.kind==f.kind;});
    if (it==slots.end()) {
      if (slots.size()>=3) return false;
      slots.push_back({f,std::string(f.total,'\0'),0,now}); it=slots.end()-1;
    }
    if (it->first.hash!=f.hash || it->first.origin!=f.origin || it->first.total!=f.total || it->first.priority!=f.priority) return false;
    std::copy(f.payload.begin(),f.payload.end(),it->body.begin()+size_t(f.part)*CHUNK);
    it->mask |= 1u<<f.part; it->touched=now;
    if (it->mask != (1u<<f.parts)-1) return false;
    if (crc32(it->body)!=f.hash) { slots.erase(it); return false; }
    out={f.id,f.incident,f.origin,f.priority,f.hash,std::move(it->body),f.kind}; slots.erase(it); return true;
  }
};
struct InventoryEntry { Id id{}; uint32_t hash=0; };
class Mesh {
  struct Queued { Frame f; uint32_t due=0, order=0; };
  struct Seen { uint32_t signature=0, at=0; bool used=false; };
  struct Job { Record record; uint8_t next=0; uint32_t nonce=0, order=0; bool repair=false; };
  std::array<Seen,256> seen{};
  size_t seenCursor=0;
  std::vector<Queued> queue;
  std::vector<Job> jobs;
  Reassembler reassembler;
  uint32_t serial=0, order=0, served=0;
  uint64_t self=0, incident=0;
  bool duplicate(const Frame& f,uint32_t now) {
    Frame norm=f; norm.ttl=0; auto b=encode(norm);
    uint32_t sig=crc32(b.data(),b.size()-4);
    for (const auto& s:seen) if (s.used && s.signature==sig && uint32_t(now-s.at)<120000) return true;
    seen[seenCursor++%seen.size()]={sig,now,true}; return false;
  }
public:
  std::function<bool(const Id&)> contains;
  std::function<bool(const Id&,Record&)> load;
  std::function<bool(const Record&)> persist;
  std::function<bool(const Id&,uint32_t)> chatContains;
  std::function<bool(const Record&)> chatPersist;
  std::function<void(const Id&,uint64_t,uint32_t)> chatReceipt;
  std::function<void(const Frame&)> hello;
  std::function<void(const Id&,uint64_t,uint32_t,bool)> receipt;
  std::function<bool(const Id&,uint32_t)> humanAcknowledged;
  uint32_t dropped=0;
  explicit Mesh(uint64_t node,uint32_t bootSequence=0): serial(bootSequence),self(node) {}
  void setIncident(uint64_t value) { incident=value; queue.clear(); jobs.clear(); reassembler=Reassembler{}; }
  uint64_t activeIncident() const { return incident; }
  size_t pending(bool includeChat=true) const {
    if(includeChat)return queue.size()+jobs.size();
    return std::count_if(queue.begin(),queue.end(),[](const Queued& q){return q.f.kind!=Kind::Chat && q.f.kind!=Kind::ChatReceipt;})+
      std::count_if(jobs.begin(),jobs.end(),[](const Job& j){return j.record.kind!=Kind::Chat;});
  }
  bool ready(uint32_t now) const {
    if(!jobs.empty())return true;
    for(const auto& item:queue)if(int32_t(now-item.due)>=0)return true;
    return false;
  }
  void cancelPublish(const Id& id,bool offloaded=false) {
    jobs.erase(std::remove_if(jobs.begin(),jobs.end(),[&](const Job& j){return j.record.id==id && (offloaded || !j.repair);}),jobs.end());
    queue.erase(std::remove_if(queue.begin(),queue.end(),[&](const Queued& q){
      if(dataKind(q.f.kind) && q.f.id==id && (offloaded || !q.f.repairReply))return true;
      if(offloaded && q.f.kind==Kind::Inventory && q.f.origin==self)
        for(size_t i=0;i<q.f.payload.size();i+=20)if(std::equal(id.begin(),id.end(),q.f.payload.begin()+i))return true;
      return false;
    }),queue.end());
  }
  bool queueFrame(Frame f,uint32_t now,uint32_t jitter=0) {
    if (!valid(f)) { ++dropped; return false; }
    // Coalesce our still-unsent control packets; forwarded packets retain
    // their original publisher/nonce and use the duplicate cache instead.
    if(f.origin==self && !dataKind(f.kind))
      for(const auto& item:queue)if(item.f.origin==self && item.f.kind==f.kind && item.f.incident==f.incident){
        if(f.kind==Kind::Hello || f.kind==Kind::Inventory){if(item.f.payload==f.payload)return true;}
        else if(item.f.id==f.id && item.f.hash==f.hash)return true;
      }
    if(queue.size()>=MAX_QUEUE){++dropped;return false;}
    queue.push_back({std::move(f),now+jitter,order++}); return true;
  }
  Frame control(Kind kind, const Id& id={}, uint32_t hash=0) {
    Frame f; f.kind=kind; f.origin=self; f.incident=incident; f.id=id; f.nonce=++serial; f.hash=hash; return f;
  }
  bool publish(const Record& r,bool repair=false) {
    if (!dataKind(r.kind) || r.incident!=incident || r.body.empty() || r.body.size()>(r.kind==Kind::Chat?768:MAX_BODY) || crc32(r.body)!=r.hash) return false;
    for (auto& j:jobs) if (j.record.id==r.id) {j.repair|=repair;return true;}
    if(r.kind==Kind::Chat && jobs.size()>=2)return false; // Keep body-job capacity for forms.
    if (jobs.size()>=4) { ++dropped; return false; }
    jobs.push_back({r,0,++serial,order++,repair}); return true;
  }
  bool announce(const std::string& text,uint32_t now) {
    Frame f=control(Kind::Hello); f.payload.assign(text.begin(),text.end()); f.total=f.payload.size(); return queueFrame(f,now);
  }
  bool inventory(const std::vector<InventoryEntry>& entries,uint32_t now) {
    bool accepted=true;
    for (size_t pos=0;pos<entries.size();pos+=8) {
      Frame f=control(Kind::Inventory);
      for (size_t i=pos;i<std::min(entries.size(),pos+8);++i) {
        f.payload.insert(f.payload.end(),entries[i].id.begin(),entries[i].id.end()); put(f.payload,entries[i].hash,4);
      }
      f.total=f.payload.size(); if(!queueFrame(f,now))accepted=false;
    }
    return accepted;
  }
  bool acknowledge(const Id& id,uint32_t hash,bool human,uint32_t now,bool chat=false) {
    return queueFrame(control(chat?Kind::ChatReceipt:human?Kind::HumanAck:Kind::Receipt,id,hash),now);
  }
  void transmitted(const Frame& f,uint32_t now) {
    if(f.kind==Kind::Data && f.repairReply && f.part+1==f.parts && humanAcknowledged && humanAcknowledged(f.id,f.hash))acknowledge(f.id,f.hash,true,now);
  }
  void receive(const uint8_t* data,size_t len,uint32_t now,uint32_t jitter=100) {
    Frame f; if (!decode(data,len,f) || f.origin==self) return;
    if (f.kind!=Kind::Hello && f.incident!=incident) return;
    if (duplicate(f,now)) return;
    if (f.kind==Kind::Hello) { if (hello) hello(f); }
    else if (f.kind==Kind::Inventory) {
      for (size_t i=0;i<f.payload.size();i+=20) {
        Id id{}; std::copy_n(f.payload.begin()+i,16,id.begin()); auto hash=uint32_t(get(f.payload.data()+i+16,4));
        if (contains && contains(id)) { if (receipt) receipt(id,f.origin,hash,false); }
        else queueFrame(control(Kind::Request,id,hash),now,jitter+uint32_t(i)*20);
      }
    } else if (f.kind==Kind::Request) {
      Record r; if (load && load(f.id,r) && r.hash==f.hash) publish(r,true);
    } else if (f.kind==Kind::Receipt || f.kind==Kind::HumanAck) {
      if (receipt) receipt(f.id,f.origin,f.hash,f.kind==Kind::HumanAck);
    } else if(f.kind==Kind::ChatReceipt){
      if(chatReceipt)chatReceipt(f.id,f.origin,f.hash);
    } else if (dataKind(f.kind)) {
      const bool chat=f.kind==Kind::Chat;
      const auto& save=chat?chatPersist:persist;
      const bool known=chat?(chatContains && chatContains(f.id,f.hash)):(contains && contains(f.id));
      if (known) { if(f.part==0) acknowledge(f.id,f.hash,false,now+jitter,chat); }
      else {
        Record r;
        if (reassembler.accept(f,now,r) && save && save(r)) acknowledge(r.id,r.hash,false,now+jitter,chat);
      }
    }
    if (f.ttl>0) { --f.ttl; queueFrame(f,now,jitter); }
  }
  // Called only when the radio is ready. Every eighth selection serves the oldest
  // eligible item so emergency traffic cannot indefinitely starve repair/control.
  bool next(uint32_t now,Frame& out) {
    const bool oldest=(++served%8)==0;
    size_t qi=queue.size(),ji=jobs.size(); uint8_t best=0; uint32_t age=~0u;
    auto better=[&](uint8_t p,uint32_t o){return age==~0u || (oldest?o<age:(p>best || (p==best && o<age)));};
    for(size_t i=0;i<queue.size();++i) if (int32_t(now-queue[i].due)>=0 && better(queue[i].f.priority,queue[i].order)) {
      qi=i; ji=jobs.size(); best=queue[i].f.priority; age=queue[i].order;
    }
    for(size_t i=0;i<jobs.size();++i) if (better(jobs[i].record.priority,jobs[i].order)) {
      qi=queue.size(); ji=i; best=jobs[i].record.priority; age=jobs[i].order;
    }
    if(qi<queue.size()) { out=std::move(queue[qi].f); queue.erase(queue.begin()+qi); duplicate(out,now); return true; }
    if(ji<jobs.size()) {
      auto& j=jobs[ji]; auto& r=j.record;
      out=Frame{}; out.kind=r.kind; out.repairReply=j.repair;out.origin=r.origin; out.incident=r.incident; out.id=r.id;
      out.hash=r.hash; out.priority=r.priority; out.total=r.body.size(); out.parts=(r.body.size()+CHUNK-1)/CHUNK;
      out.part=j.next++; out.nonce=j.nonce;
      size_t start=size_t(out.part)*CHUNK, end=std::min(r.body.size(),start+CHUNK);
      out.payload.assign(r.body.begin()+start,r.body.begin()+end);
      if(j.next==out.parts)jobs.erase(jobs.begin()+ji);
      duplicate(out,now); return true;
    }
    return false;
  }
};
}
