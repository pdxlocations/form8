// ESP32 owns its store; nRF52 exposes a full status and uses companion storage.
export function radioStorage(hello) {
 if(!hello || !/^[a-f0-9]{16}$/.test(hello.node||''))throw new Error('Unrecognized Form8 radio. Update the firmware and Android app together.');
 if(hello.storage==='radio' && hello.protocol==='form8-api-v1')return 'radio';
 if(hello.storage==='radio' || hello.protocol==='form8-api-v1')throw new Error('Unsupported ESP32 API. Update the firmware and Android app together.');
 if(Array.isArray(hello.peers) && (!hello.storage || hello.storage==='companion'))return 'companion';
 throw new Error('Unrecognized radio handshake. Install the matching current Form8 firmware and Android APK.');
}
