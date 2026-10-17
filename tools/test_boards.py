"""Host-test radio routing, front-end control, and battery logic for every board."""
import os
import pathlib
import shlex
import shutil
import subprocess
import tempfile

root = pathlib.Path(__file__).resolve().parents[1]
clt = pathlib.Path('/Library/Developer/CommandLineTools/usr/bin/clang++')
compiler = os.environ.get('CXX') or (str(clt) if clt.exists() else shutil.which('c++'))
if not compiler:
    raise SystemExit('Install a C++17 compiler or set CXX.')
extra = shlex.split(os.environ.get('CXXFLAGS', ''))
sdk = pathlib.Path('/Library/Developer/CommandLineTools/SDKs/MacOSX27.0.sdk')
if not extra and sdk.exists():
    extra = ['-isysroot', str(sdk), '-isystem', str(sdk / 'usr/include/c++/v1')]

targets = [
    ('FORM8_HELTEC_V3',), ('FORM8_HELTEC_V4',),
    ('FORM8_HELTEC_V4', 'FORM8_HELTEC_V4_KCT8103L'), ('FORM8_XIAO_S3',),
    ('FORM8_TLORA_T3_S3',), ('FORM8_TLORA_T3_S3', 'FORM8_RADIO_SX1276'), ('FORM8_TBEAM_BPF',),
    ('FORM8_TBEAM','FORM8_RADIO_SX1276'), ('FORM8_TBEAM',),
    ('FORM8_TLORA','FORM8_TLORA_V1_3','FORM8_RADIO_SX1276'),
    ('FORM8_TLORA','FORM8_TLORA_V2_1_16','FORM8_RADIO_SX1276'),
]
with tempfile.TemporaryDirectory(prefix='form8-boards-') as directory:
    for index, flags in enumerate(targets):
        binary = pathlib.Path(directory) / f'board-{index}'
        subprocess.run([compiler, *extra, '-std=c++17', '-Wall', '-Wextra', '-Werror', '-fsanitize=address,undefined',
                        *['-D'+flag for flag in flags], '-I'+str(root/'tests/board_stubs'),
                        '-I'+str(root/'tests/oled_stubs'), '-I'+str(root/'include'), str(root/'tests/boards.cpp'),
                        '-o', str(binary)], check=True)
        subprocess.run([str(binary)], check=True)
