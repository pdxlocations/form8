"""Host-test the shared HTTP/BLE dispatcher with the firmware's ArduinoJson."""
import os
from pathlib import Path
import shlex
import shutil
import subprocess
import tempfile
ROOT=Path(__file__).resolve().parents[1]
clt=Path('/Library/Developer/CommandLineTools/usr/bin/clang++')
compiler=os.environ.get('CXX') or (str(clt) if clt.exists() else shutil.which('c++'))
headers=ROOT/'.pio/libdeps/heltec-v3/ArduinoJson/src'
if not (headers/'ArduinoJson.h').exists():raise SystemExit('Build heltec-v3 first to install ArduinoJson.')
extra=shlex.split(os.environ.get('CXXFLAGS',''))
sdk=Path('/Library/Developer/CommandLineTools/SDKs/MacOSX27.0.sdk')
if not extra and sdk.exists():extra=['-isysroot',str(sdk),'-isystem',str(sdk/'usr/include/c++/v1')]
with tempfile.TemporaryDirectory(prefix='form8-api-') as folder:
 binary=Path(folder)/'api-tests'
 subprocess.run([compiler,*extra,'-std=c++17','-Wall','-Wextra','-Werror','-fsanitize=address,undefined','-I'+str(ROOT/'tests/api_stubs'),'-I'+str(ROOT/'include'),'-I'+str(headers),str(ROOT/'tests/api_gateway.cpp'),'-o',str(binary)],check=True)
 subprocess.run([str(binary)],check=True)
