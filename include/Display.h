#pragma once
#include <Arduino.h>
#include <BatteryGauge.h>
#include <BoardConfig.h>

struct StationScreen {
  bool bluetooth=false;
  String callsign,incident,radioState;
  size_t online=0;
  float frequency=0;
  uint16_t batteryMv=0;
};
#if defined(FORM8_HAS_OLED)
#include <SSD1306Wire.h>
#include <FirmwareVersion.h>

inline SSD1306Wire& stationDisplay() {
  static SSD1306Wire display(0x3c, DISPLAY_SDA, DISPLAY_SCL, GEOMETRY_128_64);
  return display;
}
inline bool& displayReady(){static bool ready=false;return ready;}
inline String displayFit(SSD1306Wire& display,String value,uint16_t width=128) {
  if(display.getStringWidth(value)<=width)return value;
  while(value.length() && display.getStringWidth(value+"...")>width)value.remove(value.length()-1);
  return value+"...";
}
inline void drawBattery(SSD1306Wire& display,uint16_t mv) {
  display.drawRect(105,2,20,9);display.fillRect(125,4,2,5);
  if(!mv){display.drawString(111,0,"?");return;}
  const uint8_t bars=batteryBars(mv);
  for(uint8_t i=0;i<bars;++i)display.fillRect(107+i*4,4,3,5);
  if(!bars)display.drawString(111,0,"!");
}
inline void drawNodeIcon(SSD1306Wire& d,int x,int y) {
  d.drawLine(x+2,y+2,x+11,y+2);d.drawLine(x+2,y+2,x+6,y+10);d.drawLine(x+11,y+2,x+6,y+10);
  d.fillRect(x,y,4,4);d.fillRect(x+9,y,4,4);d.fillRect(x+4,y+8,4,4);
}
inline void drawOutgoingIcon(SSD1306Wire& d,int x,int y) {
  d.drawRect(x,y+6,12,6);d.drawLine(x+6,y+8,x+6,y);
  d.drawLine(x+6,y,x+2,y+4);d.drawLine(x+6,y,x+10,y+4);
}
inline void drawEnvelopeIcon(SSD1306Wire& d,int x,int y) {
  d.drawRect(x,y+1,13,10);d.drawLine(x,y+1,x+6,y+7);d.drawLine(x+12,y+1,x+6,y+7);
}
inline void drawCounter(SSD1306Wire& d,int x,size_t count) {
  const String value=String(count);d.setFont(ArialMT_Plain_16);
  const bool small=d.getStringWidth(value)>24;
  if(small)d.setFont(ArialMT_Plain_10);
  d.drawString(x,small?25:21,value);
}
inline void showStationStatus(const String& ssid,const String& password,uint8_t clients,size_t outgoing,size_t unread,const String& sender,const StationScreen& station={}) {
  if(!displayReady())return;
  static String previous;
  String state=ssid+"|"+password+"|"+String(clients)+"|"+String(outgoing)+"|"+String(unread)+"|"+sender+"|"+station.callsign+"|"+station.incident+"|"+station.radioState+"|"+String(station.online)+"|"+String(station.frequency,3)+"|"+String(station.batteryMv/10)+"|"+String(station.bluetooth);
  if(state==previous)return;previous=state;
  auto& display=stationDisplay();
  display.clear();display.setTextAlignment(TEXT_ALIGN_LEFT);display.setFont(ArialMT_Plain_10);
  if(clients){
    display.drawString(0,0,displayFit(display,station.callsign.isEmpty()?"Set callsign":station.callsign,100));
  }else{
    const String version=String("v")+FORM8_FIRMWARE_VERSION;
    const int versionWidth=display.getStringWidth(version);
    const String label=displayFit(display,ssid,100-versionWidth-5);
    display.drawString(0,0,label);
    display.drawString(display.getStringWidth(label)+5,0,version);
  }
  drawBattery(display,station.batteryMv);
  if(clients){
    display.drawString(0,11,displayFit(display,station.incident.isEmpty()?"Join an incident":station.incident));
    drawNodeIcon(display,0,26);drawOutgoingIcon(display,44,26);drawEnvelopeIcon(display,88,26);
    drawCounter(display,16,station.online);drawCounter(display,60,outgoing);drawCounter(display,104,unread);
    display.setFont(ArialMT_Plain_10);
    display.drawString(0,39,displayFit(display,station.radioState,78));
    display.drawString(84,39,station.batteryMv?String(station.batteryMv/1000.0f,2)+"V":"--V");
    display.drawString(0,51,displayFit(display,unread?"From: "+sender:String(station.frequency,3)+" MHz "+(station.bluetooth?"BT":"WiFi:"+String(clients))));
  }else{
    display.drawString(0,12,"AP password:");
    if(station.radioState=="RXING")display.drawString(92,12,"RXING");
    display.setFont(ArialMT_Plain_24);
    display.drawString(0,22,password);display.setFont(ArialMT_Plain_10);
    display.drawString(0,51,"http://192.168.4.1");
  }
  display.display();
}
inline void showAccessPoint(const String& ssid, const String& password) {
  // The OLED uses its own I2C pins and the active-low Vext power rail.
  if(DISPLAY_POWER>=0){pinMode(DISPLAY_POWER,OUTPUT);digitalWrite(DISPLAY_POWER,LOW);delay(100);}
  if(DISPLAY_RESET>=0){pinMode(DISPLAY_RESET,OUTPUT);digitalWrite(DISPLAY_RESET,LOW);delay(20);digitalWrite(DISPLAY_RESET,HIGH);delay(20);}
  auto& display=stationDisplay();
  if (!display.init()) {
    Serial.println("OLED initialization failed; AP credentials are available over serial.");return;
  }
  displayReady()=true;showStationStatus(ssid,password,0,0,0,"");
}
#else
// Headless targets provide credentials over USB serial.
inline void showAccessPoint(const String&, const String&) {}
inline void showStationStatus(const String&,const String&,uint8_t,size_t,size_t,const String&,const StationScreen& ={}) {}
#endif
