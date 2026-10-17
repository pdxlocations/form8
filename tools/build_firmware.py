"""Build and package app updates and optional browser factory images with hashes."""
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
parser.add_argument('--webflasher', action='store_true', help='Also build/package factory images with initialized LittleFS.')
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
    if args.webflasher:
        subprocess.run(command + ['-t', 'buildfs'], cwd=root, check=True)

# Stage a complete bundle before replacing the previous output directory.
output = root / 'dist/firmware'
stage = root / 'dist/firmware-staging'
if stage.exists():
    shutil.rmtree(stage)
stage.mkdir(parents=True)
manifest = []
checksums = []
for environment in args.targets:
    target = by_name[environment]
    source = root / '.pio/build' / environment / 'firmware.bin'
    if not source.exists():
        raise SystemExit(f'Missing {source}; build this target first.')
    end=0
    app_size=None
    fs_offset=None
    fs_size=None
    with (root/target['partitions']).open() as table:
        for row in csv.reader(line for line in table if line.strip() and not line.lstrip().startswith('#')):
            offset,size=int(row[3],0),int(row[4],0)
            if offset<end or offset+size>target['flashMiB']*1024*1024:
                raise SystemExit(f'Invalid flash layout for {environment}')
            end=offset+size
            if row[0]=='app0':
                app_size=size
            if row[0]=='littlefs':
                fs_offset,fs_size=offset,size
    if app_size is None or source.stat().st_size>app_size:
        raise SystemExit(f'Firmware does not fit the app partition for {environment}')
    layout = json.loads((source.parent / 'flash-layout.json').read_text())
    families = {'esp32': 'ESP32', 'esp32s3': 'ESP32-S3'}
    chip_family = families.get(layout['chip'])
    if not chip_family or target.get('chipFamily', chip_family) != chip_family:
        raise SystemExit(f'Processor family mismatch for {environment}')
    filename = f'form8-{environment}.bin'
    shutil.copyfile(source, stage / filename)
    entry = {**target, 'chipFamily': chip_family, 'file': filename, 'kind': 'app-only', 'flashOffset': '0x10000',
                     'bytes': source.stat().st_size, 'sha256': hashlib.sha256(source.read_bytes()).hexdigest(),
                     'hardwareValidated': False}
    checksums.append((filename, entry['sha256']))
    if args.webflasher:
        build = source.parent
        layout = json.loads((build / 'flash-layout.json').read_text())
        filesystem = build / 'littlefs.bin'
        if layout['chip'] not in ('esp32', 'esp32s3') or not layout['images'] or fs_offset is None or not filesystem.exists() or filesystem.stat().st_size != fs_size:
            raise SystemExit(f'Missing or invalid factory inputs for {environment}; build firmware and buildfs first.')
        factory_name = f'form8-{environment}-factory.bin'
        factory = stage / factory_name
        command = [layout['python'], layout['esptool'], '--chip', layout['chip'], 'merge_bin',
                   '-o', str(factory), '--flash_mode', layout['mode'],
                   '--flash_freq', layout['frequency'], '--flash_size', layout['size']]
        for offset, image in layout['images']:
            command.extend([hex(offset), image])
        command.extend(['0x10000', str(source), hex(fs_offset), str(filesystem)])
        subprocess.run(command, cwd=root, check=True)
        if factory.stat().st_size > target['flashMiB'] * 1024 * 1024:
            raise SystemExit(f'Factory image exceeds flash size for {environment}')
        entry['factory'] = {'file': factory_name, 'kind': 'factory', 'flashOffset': '0x0',
                            'bytes': factory.stat().st_size,
                            'sha256': hashlib.sha256(factory.read_bytes()).hexdigest(),
                            'erasesData': True}
        checksums.append((factory_name, entry['factory']['sha256']))
    manifest.append(entry)
(stage / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
(stage / 'SHA256SUMS').write_text(''.join(f'{checksum}  {filename}\n' for filename, checksum in checksums))
(stage / 'README.txt').write_text(
    'Form8 ESP32 firmware builds\n\n'
    'Regular .bin files are app-only updates at offset 0x10000 on ESP32 and ESP32-S3.\n'
    'When present, -factory.bin files are first-install images at offset 0; they ERASE saved data.\n'
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
print(f'Packaged {len(manifest)} targets in {output}\nBundle: {bundle}')
