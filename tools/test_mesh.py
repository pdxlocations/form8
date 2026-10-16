"""Build/run the same portable C++ transport used by the firmware."""
import os
import pathlib
import shutil
import shlex
import subprocess
import tempfile

root = pathlib.Path(__file__).resolve().parents[1]
compiler = os.environ.get('CXX')
if not compiler:
    clt = '/Library/Developer/CommandLineTools/usr/bin/clang++'
    compiler = clt if pathlib.Path(clt).exists() else shutil.which('c++')
if not compiler:
    raise SystemExit('Install a C++17 compiler or set CXX.')
with tempfile.TemporaryDirectory(prefix='form8-test-') as directory:
    binary = pathlib.Path(directory) / 'mesh-tests'
    extra = shlex.split(os.environ.get('CXXFLAGS', ''))
    sdk = pathlib.Path('/Library/Developer/CommandLineTools/SDKs/MacOSX27.0.sdk')
    if not extra and str(compiler).startswith('/Library/Developer/CommandLineTools/') and sdk.exists():
        extra = ['-isysroot', str(sdk), '-isystem', str(sdk/'usr/include/c++/v1')]
    subprocess.run([compiler, *extra, '-std=c++17', '-Wall', '-Wextra', '-Werror', '-fsanitize=address,undefined',
                    '-I'+str(root/'lib/Form8Mesh/src'), str(root/'tests/mesh.cpp'), '-o', str(binary)], check=True)
    subprocess.run([str(binary)], check=True)
