#include <Display.h>
#include <Battery.h>
#include <cassert>
#include <iostream>
int main(int argc,char** argv){
  assert(argc==2);
  assert(!plausibleBatteryVoltage(0) && !plausibleBatteryVoltage(5000));
  assert(batteryBars(3400)==0 && batteryBars(3500)==1 && batteryBars(3700)==2 && batteryBars(3900)==3 && batteryBars(4200)==4);
  // The board's off-level bias selects the opposite enable polarity.
  batteryOff=HIGH;sensedMv=800;updateBattery(0);assert(levels[37]==LOW);updateBattery(9);assert(batteryReading().millivolts==0);
  updateBattery(10);assert(batteryReading().millivolts==3920 && modes[37]==INPUT);
  batteryOff=LOW;updateBattery(5010);assert(levels[37]==HIGH);updateBattery(5020);assert(batteryReading().millivolts==3920);
  sensedMv=0;updateBattery(10020);updateBattery(10030);assert(batteryReading().millivolts==0);
  displayReady()=true;auto& d=stationDisplay();
  StationScreen station;station.callsign="NET-A";station.incident="Practice drill";station.online=3;station.frequency=919.5;station.radioState="RXING";station.batteryMv=3920;
  showStationStatus("form8-abcd","12345678",1,2,5,"NET-B",station);assert(d.overflow==0);d.save(std::string(argv[1])+"/connected.pbm");
  for(const auto& label:d.labels)assert(label.text!="0.1.4");
  unsigned frame=d.frames;showStationStatus("form8-abcd","12345678",1,2,5,"NET-B",station);assert(d.frames==frame);
  station.online=2;showStationStatus("form8-abcd","12345678",1,2,5,"NET-B",station);assert(d.frames==frame+1);
  station.callsign="WWWWWWWWWWWWWWWW";station.incident=String(64,'W');station.online=29;station.radioState="RF PAUSED";station.batteryMv=3400;
  showStationStatus("form8-abcd","12345678",4,512,512,"WWWWWWWWWWWWWWWW",station);assert(d.overflow==0);d.save(std::string(argv[1])+"/busy.pbm");
  station.batteryMv=0;station.online=0;station.incident="";station.callsign="";station.radioState="TX OFF";
  showStationStatus("form8-abcd","12345678",1,0,0,"",station);assert(d.overflow==0);d.save(std::string(argv[1])+"/empty.pbm");
  showStationStatus("form8-abcd","12345678",0,0,0,"",station);assert(d.overflow==0);d.save(std::string(argv[1])+"/credentials.pbm");
  assert(d.labels[0].text=="form8-abcd" && d.labels[0].y==0);
  assert(d.labels[1].text=="0.1.4" && d.labels[1].y==0);
  assert(d.labels[1].x==int(d.getStringWidth(d.labels[0].text))+5);
  assert(d.labels[1].x+int(d.getStringWidth(d.labels[1].text))<=100);
  station.radioState="RXING";showStationStatus("form8-abcd","12345678",0,0,0,"",station);assert(d.overflow==0);d.save(std::string(argv[1])+"/credentials-rxing.pbm");
  std::cout<<"OLED tests passed: exact font pixels fit, counters, redraw, credential screen, unknown/low battery, both sense polarities.\n";
}
