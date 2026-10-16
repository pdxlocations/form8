#pragma once
#include <cstdint>

class ReceiveActivity {
  bool active=false,received=false;
  uint32_t receivedAt=0;
public:
  void reset(){active=false;received=false;}
  void progress(bool value){active=value;}
  void completed(uint32_t now){active=false;received=true;receivedAt=now;}
  bool receiving() const{return active;}
  // Briefly retain the indication so short packets are visible on the OLED.
  bool visible(uint32_t now) const{return active || (received && uint32_t(now-receivedAt)<750);}
};
