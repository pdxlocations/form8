"""Build the ESP32 target matrix and package app-only firmware with SHA-256 hashes."""
import argparse
import csv
import hashlib
import json
import pathlib
import shutil
import subprocess
import zipfile

root = pathlib.Path(__file__).resolve().parents[1]
catalog = json.loads((root / 'config/firmware-targets.json').read_text())
by_name = {target['environment']: target for target in catalog}
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--targets', nargs='+', choices=by_name, default=list(by_name))
parser.add_argument('--package-only', action='store_true', help='Package existing successful builds instead of rebuilding.')
args = parser.parse_args()
if not args.package_only:
    pio = shutil.which('pio')
    if not pio:
        cached = pathlib.Path.home() / '.platformio/penv/bin/pio'
        if cached.exists():
            pio = str(cached)
    if not pio:
        raise SystemExit('Install PlatformIO Core and make pio available on PATH.')
    command = [pio, 'run']
    for environment in args.targets:
        command.extend(['-e', environment])
    subprocess.run(command, cwd=root, check=True)

# Stage a complete bundle before replacing the previous output directory.
output = root / 'dist/firmware'
stage = root / 'dist/firmware-staging'
if stage.exists():
    shutil.rmtree(stage)
stage.mkdir(parents=True)
manifest = []
for environment in args.targets:
    target = by_name[environment]
    source = root / '.pio/build' / environment / 'firmware.bin'
    if not source.exists():
        raise SystemExit(f'Missing {source}; build this target first.')
    end=0
    app_size=None
    with (root/target['partitions']).open() as table:
        for row in csv.reader(line for line in table if line.strip() and not line.lstrip().startswith('#')):
            offset,size=int(row[3],0),int(row[4],0)
            if offset<end or offset+size>target['flashMiB']*1024*1024:
                raise SystemExit(f'Invalid flash layout for {environment}')
            end=offset+size
            if row[0]=='app0':
                app_size=size
    if app_size is None or source.stat().st_size>app_size:
        raise SystemExit(f'Firmware does not fit the app partition for {environment}')
    filename = f'form8-{environment}.bin'
    shutil.copyfile(source, stage / filename)
    manifest.append({**target, 'file': filename, 'kind': 'app-only', 'flashOffset': '0x10000',
                     'bytes': source.stat().st_size, 'sha256': hashlib.sha256(source.read_bytes()).hexdigest(),
                     'hardwareValidated': False})
(stage / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
(stage / 'SHA256SUMS').write_text(''.join(f"{entry['sha256']}  {entry['file']}\n" for entry in manifest))
(stage / 'README.txt').write_text(
    'Form8 ESP32 firmware builds\n\n'
    'These are app-only images, not merged factory images. Their ESP32-S3 app offset is 0x10000.\n'
    'Choose the exact board, radio chip, and Heltec V4 FEM revision in manifest.json.\n'
    'Build success does not establish hardware operation, RF performance, or battery accuracy.\n\n'
    'Recommended upload from the source project:\n'
    '  pio run -e TARGET -t upload\n\n'
    'Only on a new/empty radio, initialize file storage once:\n'
    '  pio run -e TARGET -t uploadfs\n'
    'uploadfs erases stored forms. It is not needed for routine firmware/webpage updates.\n'
    'Do not change partition layouts on a radio whose records must be preserved.\n'
    'Headless XIAO credentials are printed over USB serial at 115200 baud.\n')
if output.exists():
    shutil.rmtree(output)
stage.rename(output)
bundle = root / 'dist/form8-esp32-firmware.zip'
with zipfile.ZipFile(bundle, 'w', compression=zipfile.ZIP_DEFLATED) as archive:
    for file in sorted(output.iterdir()):
        archive.write(file, arcname=file.name)
print(f'Packaged {len(manifest)} app-only builds in {output}\nBundle: {bundle}')
