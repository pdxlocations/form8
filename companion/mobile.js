import {Capacitor, CapacitorHttp} from '@capacitor/core';
import {Geolocation} from '@capacitor/geolocation';
globalThis.Form8Native={
  isNative:()=>Capacitor.isNativePlatform(),
  request:options=>CapacitorHttp.request(options),
  getLocation:options=>Geolocation.getCurrentPosition(options)
};
