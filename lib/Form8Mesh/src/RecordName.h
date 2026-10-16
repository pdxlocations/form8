#pragma once
#include <Mesh.h>

namespace form8 {
// LittleFS images made by mklittlefs have a 32-byte basename limit.
// A 22-character base64url ID leaves room for both ".meta" and ".tmp".
inline std::string recordName(const Id& id) {
  constexpr char alphabet[]="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  std::string out;
  uint32_t bits=0; unsigned count=0;
  for(uint8_t byte:id) {
    bits=(bits<<8)|byte; count+=8;
    while(count>=6){count-=6;out+=alphabet[(bits>>count)&63];}
  }
  if(count)out+=alphabet[(bits<<(6-count))&63];
  return out;
}
inline bool parseRecordName(const std::string& name,Id& id) {
  if(name.size()!=22)return false;
  constexpr char alphabet[]="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  Id decoded{};size_t pos=0;uint32_t bits=0;unsigned count=0;
  for(char c:name) {
    const char* digit=std::strchr(alphabet,c);
    if(c=='\0'||!digit)return false;
    bits=(bits<<6)|uint32_t(digit-alphabet);count+=6;
    if(count>=8){count-=8;decoded[pos++]=uint8_t(bits>>count);}
  }
  if((bits&15)!=0)return false; // Reject noncanonical padding bits.
  id=decoded;return true;
}
}
