#pragma once
#include <Position.h>
#if defined(FORM8_HAS_GPS)
#include <TinyGPSPlus.h>
#include <XPowersLib.h>
#include <Wire.h>
TinyGPSPlus gpsParser;
HardwareSerial gpsSerial(1);
XPowersAXP2101 gpsPower;
bool gpsPowerReady=false;
inline void beginGps(){
  Wire.begin(GPS_SDA,GPS_SCL);
  gpsPowerReady=gpsPower.begin(Wire,AXP2101_SLAVE_ADDRESS,GPS_SDA,GPS_SCL);
  if(gpsPowerReady){gpsPower.setALDO4Voltage(3300);gpsPower.enableALDO4();}
  gpsSerial.begin(9600,SERIAL_8N1,GPS_RX,GPS_TX);
}
inline void readGps(form8::PositionFix& fix,uint32_t now){
  // Bound work per loop so serial input cannot starve LoRa or HTTP.
  for(unsigned i=0;i<256 && gpsSerial.available();++i)gpsParser.encode(gpsSerial.read());
  if(gpsParser.location.isUpdated() && gpsParser.location.isValid()){
    const double lat=gpsParser.location.lat(),lon=gpsParser.location.lng();
    if(form8::validCoordinates(lat,lon) && gpsParser.location.age()<=form8::POSITION_FRESH_MS)
      fix={lat,lon,-1,true,true,now,uint32_t(gpsParser.location.age())};
  }
}
constexpr bool GPS_AVAILABLE=true;
#else
inline void beginGps(){}
inline void readGps(form8::PositionFix&,uint32_t){}
constexpr bool GPS_AVAILABLE=false;
#endif
