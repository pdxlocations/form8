#pragma once
#include <algorithm>
#include <cmath>
#include <cstdint>
#include <string>
#include <vector>

namespace form8 {
constexpr uint32_t POSITION_FRESH_MS=120000, POSITION_RETAIN_MS=1800000;
inline bool validCoordinates(double lat,double lon){return std::isfinite(lat)&&std::isfinite(lon)&&lat>=-90&&lat<=90&&lon>=-180&&lon<=180;}
struct PositionFix {
  double lat=0,lon=0;int accuracy=-1;bool radio=false,valid=false;uint32_t at=0,age=0;
  uint32_t ageMs(uint32_t now) const {return age+uint32_t(now-at);}
  bool fresh(uint32_t now) const {return valid && ageMs(now)<=POSITION_FRESH_MS;}
};
inline PositionFix preferredPosition(const PositionFix& gps,const PositionFix& phone,uint32_t now){
  if(gps.fresh(now))return gps;
  if(phone.fresh(now))return phone;
  if(!gps.valid)return phone;
  if(!phone.valid)return gps;
  return gps.ageMs(now)<phone.ageMs(now)?gps:phone;
}
struct PositionPacket {PositionFix fix;uint32_t session=0,sequence=0;std::string call;};
inline bool validPositionCall(const std::string& s){
  if(s.size()<3||s.size()>16)return false;
  for(char c:s)if(!((c>='A'&&c<='Z')||(c>='0'&&c<='9')||c=='/'||c=='-'))return false;
  return true;
}
inline void positionPut(std::vector<uint8_t>& out,uint32_t value,size_t n){for(size_t i=0;i<n;++i)out.push_back(value>>(8*i));}
inline uint32_t positionGet(const uint8_t* p,size_t n){uint32_t v=0;for(size_t i=0;i<n;++i)v|=uint32_t(p[i])<<(8*i);return v;}
inline std::vector<uint8_t> encodePosition(const PositionPacket& p,uint32_t now){
  if(!p.fix.fresh(now)||!validCoordinates(p.fix.lat,p.fix.lon)||!validPositionCall(p.call)||!p.sequence)return {};
  std::vector<uint8_t> out{1,uint8_t(p.fix.radio)};
  positionPut(out,uint32_t(int32_t(std::lround(p.fix.lat*1e7))),4);positionPut(out,uint32_t(int32_t(std::lround(p.fix.lon*1e7))),4);
  positionPut(out,p.fix.accuracy<0?65535:std::min(p.fix.accuracy,65534),2);positionPut(out,p.fix.ageMs(now)/1000,2);
  positionPut(out,p.session,4);positionPut(out,p.sequence,4);out.insert(out.end(),p.call.begin(),p.call.end());return out;
}
inline bool decodePosition(const std::vector<uint8_t>& data,PositionPacket& p,uint32_t now){
  if(data.size()<25||data.size()>38||data[0]!=1||data[1]>1)return false;
  p.fix.lat=int32_t(positionGet(data.data()+2,4))/1e7;p.fix.lon=int32_t(positionGet(data.data()+6,4))/1e7;
  const auto acc=positionGet(data.data()+10,2);p.fix.accuracy=acc==65535?-1:int(acc);
  p.fix.age=positionGet(data.data()+12,2)*1000;p.fix.at=now;p.fix.radio=data[1];p.fix.valid=true;
  p.session=positionGet(data.data()+14,4);p.sequence=positionGet(data.data()+18,4);p.call.assign(data.begin()+22,data.end());
  return validCoordinates(p.fix.lat,p.fix.lon)&&p.fix.fresh(now)&&validPositionCall(p.call)&&p.sequence;
}
class PositionSchedule {
  bool sent=false;uint32_t last=0,retry=0;
public:
  void reset(uint32_t now){sent=false;retry=now;}
  bool due(uint32_t now,uint32_t intervalSeconds) const {return int32_t(now-retry)>=0&&(!sent||uint32_t(now-last)>=intervalSeconds*1000);}
  void queued(uint32_t now){sent=true;last=now;retry=now;}
  void failed(uint32_t now){retry=now+2000;}
};
}
