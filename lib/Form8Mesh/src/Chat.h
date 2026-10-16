#pragma once
#include <Mesh.h>
#include <map>
namespace form8 {
constexpr size_t CHAT_TEXT_BYTES=200, CHAT_RECORDS=96;
inline bool validChatText(const std::string& s){
  if(s.empty() || s.size()>CHAT_TEXT_BYTES)return false;
  bool content=false;
  for(size_t i=0;i<s.size();){
    const uint8_t c=s[i++];uint32_t cp=c;unsigned count=0;
    if(c<0x80){if((c<32 && c!='\n' && c!='\t') || c==127)return false;if(c!=' ' && c!='\n' && c!='\t')content=true;continue;}
    if(c>=0xc2 && c<=0xdf){cp=c&31;count=1;}
    else if(c>=0xe0 && c<=0xef){cp=c&15;count=2;}
    else if(c>=0xf0 && c<=0xf4){cp=c&7;count=3;}
    else return false;
    const unsigned bytes=count;
    while(count--){if(i==s.size() || (uint8_t(s[i])&0xc0)!=0x80)return false;cp=(cp<<6)|(uint8_t(s[i++])&63);}
    if((bytes==1 && cp<0x80)||(bytes==2 && cp<0x800)||(bytes==3 && cp<0x10000)||cp>0x10ffff||(cp>=0xd800 && cp<=0xdfff))return false;
    content=true;
  }
  return content;
}
inline bool chatEmoji(const std::string& emoji){
  for(const char* choice:{"👍","👎","❤️","✅","❓","🚨","👀"})if(emoji==choice)return true;
  return false;
}
class ChatRetries {
  struct State {uint32_t due=0;uint8_t attempts=0;bool queued=false;};
  std::map<Id,State> states;
public:
  void clear(){states.clear();}
  void cancel(const Id& id){states.erase(id);}
  void begin(const Id& id,uint32_t now){states.emplace(id,State{now,0,false});}
  void interrupted(uint32_t now){for(auto& item:states){item.second.queued=false;item.second.due=now;}}
  void lost(const Id& id,uint32_t now){auto it=states.find(id);if(it!=states.end()){it->second.queued=false;it->second.due=now+2000;}}
  bool active(const Id& id) const {auto it=states.find(id);return it!=states.end() && it->second.attempts<3;}
  uint8_t sent(const Id& id,uint32_t now){
    auto it=states.find(id);if(it==states.end())return 0;
    auto& s=it->second;s.queued=false;if(s.attempts<3)++s.attempts;
    s.due=now+(s.attempts==1?15000:45000);return s.attempts;
  }
  template<typename Send> void service(uint32_t now,Send send){
    for(auto& item:states){auto& s=item.second;
      if(s.attempts>=3 || s.queued || int32_t(now-s.due)<0)continue;
      if(send(item.first))s.queued=true;else s.due=now+2000;
    }
  }
};
}
