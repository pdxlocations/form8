"""Host-test actual OLED layout with the firmware's fonts; export PBM previews."""
import os
import pathlib
import shlex
import shutil
import subprocess
import tempfile

root = pathlib.Path(__file__).resolve().parents[1]
fonts = root / '.pio/libdeps/heltec-v3/ESP8266 and ESP32 OLED driver for SSD1306 displays/src'
if not (fonts / 'OLEDDisplayFonts.h').exists():
    raise SystemExit('Build heltec-v3 once to install its OLED font dependency.')
clt = pathlib.Path('/Library/Developer/CommandLineTools/usr/bin/clang++')
compiler = os.environ.get('CXX') or (str(clt) if clt.exists() else shutil.which('c++'))
if not compiler:
    raise SystemExit('Install a C++17 compiler or set CXX.')
extra = shlex.split(os.environ.get('CXXFLAGS', ''))
sdk = pathlib.Path('/Library/Developer/CommandLineTools/SDKs/MacOSX27.0.sdk')
if not extra and sdk.exists():
    extra = ['-isysroot', str(sdk), '-isystem', str(sdk / 'usr/include/c++/v1')]
previews = root / 'tmp/oled-previews'
previews.mkdir(parents=True, exist_ok=True)
with tempfile.TemporaryDirectory(prefix='form8-oled-') as directory:
    binary = pathlib.Path(directory) / 'display-tests'
    subprocess.run([compiler, *extra, '-std=c++17', '-Wall', '-Wextra', '-Werror', '-fsanitize=address,undefined',
                    '-DFORM8_HELTEC_V3', '-I'+str(root/'tests/oled_stubs'), '-I'+str(root/'include'), '-I'+str(fonts),
                    str(root/'tests/display.cpp'), '-o', str(binary)], check=True)
    subprocess.run([str(binary), str(previews)], check=True)
print(f'128x64 previews: {previews}')
