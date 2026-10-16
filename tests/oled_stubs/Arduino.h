#pragma once
#include <cstdint>
#include <string>
#include <sstream>
#include <iomanip>
#include <type_traits>
#define PROGMEM
constexpr int INPUT=0,OUTPUT=1,LOW=0,HIGH=1,ADC_2_5db=1,ADC_11db=3;
constexpr int SDA_OLED=17,SCL_OLED=18,Vext=36,RST_OLED=21;
struct String:std::string {
  using std::string::string;
  String(const std::string& s):std::string(s){}
  template<typename T,typename=std::enable_if_t<std::is_integral_v<T>>> String(T n):std::string(std::to_string(n)){}
  String(double n,int places){std::ostringstream s;s<<std::fixed<<std::setprecision(places)<<n;assign(s.str());}
  bool isEmpty()const{return empty();}
  void remove(size_t n){erase(n);}
};
inline int modes[50]{},levels[50]{},batteryOff=HIGH;
inline uint32_t sensedMv=800;
inline bool batteryHasControl=true;
inline void pinMode(int pin,int mode){modes[pin]=mode;}
inline void digitalWrite(int pin,int level){levels[pin]=level;}
inline int digitalRead(int pin){return modes[pin]==INPUT?batteryOff:levels[pin];}
inline void analogSetPinAttenuation(int,int){}
inline uint32_t analogReadMilliVolts(int){return !batteryHasControl || (modes[37]==OUTPUT && levels[37]!=batteryOff)?sensedMv:0;}
inline void delay(unsigned){}
struct SerialStub{void println(const char*){}};
inline SerialStub Serial;
