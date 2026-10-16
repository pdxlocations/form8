#pragma once
#include <Arduino.h>
#include <OLEDDisplayFonts.h>
#include <array>
#include <cassert>
#include <fstream>
constexpr int GEOMETRY_128_64=0,TEXT_ALIGN_LEFT=0;
struct SSD1306Wire {
  const uint8_t* font=ArialMT_Plain_10;
  std::array<uint8_t,128*64> pixels{};
  unsigned frames=0,overflow=0;
  SSD1306Wire(int,int,int,int){}
  bool init(){return true;}
  void clear(){pixels.fill(0);overflow=0;}
  void setTextAlignment(int){}
  void setFont(const uint8_t* value){font=value;}
  unsigned getStringWidth(const String& s){unsigned w=0;for(unsigned char c:s)if(c>=font[2])w+=font[4+(c-font[2])*4+3];return w;}
  void pixel(int x,int y){if(x<0||x>=128||y<0||y>=64){++overflow;return;}pixels[y*128+x]=1;}
  void drawString(int x,int y,const String& s){
    for(unsigned char c:s){
      if(c<font[2])continue;
      const auto* entry=font+4+(c-font[2])*4;
      unsigned offset=(unsigned(entry[0])<<8)|entry[1],bytes=entry[2],width=entry[3],rows=(font[1]+7)/8;
      if(offset!=65535){const auto* data=font+4+font[3]*4+offset;
        for(unsigned i=0;i<bytes;++i)for(unsigned bit=0;bit<8;++bit)if(data[i]&(1<<bit))pixel(x+i/rows,y+(i%rows)*8+bit);
      }
      x+=width;
    }
  }
  void fillRect(int x,int y,int w,int h){for(int a=x;a<x+w;++a)for(int b=y;b<y+h;++b)pixel(a,b);}
  void drawLine(int x,int y,int x2,int y2){
    int dx=abs(x2-x),sx=x<x2?1:-1,dy=-abs(y2-y),sy=y<y2?1:-1,err=dx+dy;
    for(;;){pixel(x,y);if(x==x2&&y==y2)break;int twice=2*err;if(twice>=dy){err+=dy;x+=sx;}if(twice<=dx){err+=dx;y+=sy;}}
  }
  void drawRect(int x,int y,int w,int h){drawLine(x,y,x+w-1,y);drawLine(x,y+h-1,x+w-1,y+h-1);drawLine(x,y,x,y+h-1);drawLine(x+w-1,y,x+w-1,y+h-1);}
  void display(){++frames;}
  void save(const std::string& path){std::ofstream out(path);out<<"P1\n128 64\n";for(size_t i=0;i<pixels.size();++i)out<<int(pixels[i])<<(i%128==127?'\n':' ');}
};
