"""Exercise ESP32 BLE idle timing with deterministic callback interleaving."""
import os
from pathlib import Path
import shlex
import shutil
import subprocess
import tempfile
ROOT=Path(__file__).resolve().parents[1]
clt=Path('/Library/Developer/CommandLineTools/usr/bin/clang++')
compiler=os.environ.get('CXX') or (str(clt) if clt.exists() else shutil.which('c++'))
extra=shlex.split(os.environ.get('CXXFLAGS',''))
sdk=Path('/Library/Developer/CommandLineTools/SDKs/MacOSX27.0.sdk')
if not extra and sdk.exists():extra=['-isysroot',str(sdk),'-isystem',str(sdk/'usr/include/c++/v1')]
with tempfile.TemporaryDirectory(prefix='form8-ble-') as folder:
 binary=Path(folder)/'ble-tests'
 subprocess.run([compiler,*extra,'-std=c++17','-Wall','-Wextra','-Werror','-I'+str(ROOT/'tests/ble_stubs'),'-I'+str(ROOT/'include'),str(ROOT/'tests/ble_session.cpp'),'-o',str(binary)],check=True)
 subprocess.run([str(binary)],check=True)
