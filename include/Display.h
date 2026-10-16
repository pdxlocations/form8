#pragma once
#include <Arduino.h>

#if defined(FORM8_HELTEC_V3)
#include <SSD1306Wire.h>

inline SSD1306Wire& stationDisplay() {
  static SSD1306Wire display(0x3c, SDA_OLED, SCL_OLED, GEOMETRY_128_64);
  return display;
}
inline bool& displayReady(){static bool ready=false;return ready;}
inline String displayFit(SSD1306Wire& display,String value) {
  if(display.getStringWidth(value)<=128)return value;
  while(value.length() && display.getStringWidth(value+"...")>128)value.remove(value.length()-1);
  return value+"...";
}
inline void showStationStatus(const String& ssid,const String& password,uint8_t clients,size_t outgoing,size_t unread,const String& sender) {
  if(!displayReady())return;
  static String previous;
  String state=ssid+"|"+password+"|"+String(clients)+"|"+String(outgoing)+"|"+String(unread)+"|"+sender;
  if(state==previous)return;previous=state;
  auto& display=stationDisplay();
  display.clear();display.setTextAlignment(TEXT_ALIGN_LEFT);display.setFont(ArialMT_Plain_10);
  display.drawString(0,0,ssid+(clients?" ("+String(clients)+")":""));
  if(clients){
    display.setFont(ArialMT_Plain_24);display.drawString(0,10,"Out: "+String(outgoing));
    display.setFont(ArialMT_Plain_10);
    if(unread){
      // Envelope icon, drawn directly so it does not depend on font glyphs.
      display.drawRect(0,40,15,10);display.drawLine(0,40,7,46);display.drawLine(14,40,7,46);
      display.drawString(20,38,String(unread)+" new message"+(unread==1?"":"s"));
      display.drawString(0,51,displayFit(display,"From: "+sender));
    }else display.drawString(0,44,"No new messages");
  }else{
    display.drawString(0,12,"AP password:");display.setFont(ArialMT_Plain_24);
    display.drawString(0,22,password);display.setFont(ArialMT_Plain_10);
    display.drawString(0,51,"http://192.168.4.1");
  }
  display.display();
}
inline void showAccessPoint(const String& ssid, const String& password) {
  // The OLED uses its own I2C pins and the active-low Vext power rail.
  pinMode(Vext, OUTPUT);
  digitalWrite(Vext, LOW);
  delay(100);
  pinMode(RST_OLED, OUTPUT);
  digitalWrite(RST_OLED, LOW);
  delay(20);
  digitalWrite(RST_OLED, HIGH);
  delay(20);

  auto& display=stationDisplay();
  if (!display.init()) {
    Serial.println("OLED initialization failed; AP credentials are available over serial.");
    return;
  }
  displayReady()=true;showStationStatus(ssid,password,0,0,0,"");
}
#else
// Display hardware for the experimental T-Beam BPF is not configured yet.
inline void showAccessPoint(const String&, const String&) {}
inline void showStationStatus(const String&,const String&,uint8_t,size_t,size_t,const String&) {}
#endif
