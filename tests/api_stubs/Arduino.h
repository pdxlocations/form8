#pragma once
#include <cstdint>
#include <cstdlib>
#include <cctype>
#include <string>
struct String {
 std::string value;
 String()=default;
 String(const char* text):value(text?text:""){}
 String(const std::string& text):value(text){}
 String(int number):value(std::to_string(number)){}
 String& operator=(const char* text){value.assign(text?text:"");return *this;}
 size_t length()const{return value.length();}
 const char* c_str()const{return value.c_str();}
 char operator[](size_t at)const{return value[at];}
 char back()const{return value.back();}
 bool isEmpty()const{return value.empty();}
 void reserve(size_t count){value.reserve(count);}
 bool concat(char byte){value.push_back(byte);return true;}
 bool concat(const char* bytes){value.append(bytes);return true;}
 bool concat(const char* bytes,size_t size){value.append(bytes,size);return true;}
 String& operator+=(char byte){value+=byte;return *this;}
 String& operator+=(const char* text){value+=text;return *this;}
 int indexOf(char c,size_t at=0)const{auto pos=value.find(c,at);return pos==std::string::npos?-1:int(pos);}
 String substring(size_t at,size_t end=std::string::npos)const{return value.substr(at,end==std::string::npos?std::string::npos:end-at);}
 friend String operator+(const String& a,const String& b){return a.value+b.value;}
 friend bool operator==(const String& a,const String& b){return a.value==b.value;}
 friend bool operator<(const String& a,const String& b){return a.value<b.value;}
};
