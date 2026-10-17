"""Check the environments pioarduino actually sees, including inherited extra configs."""
import json
import configparser
from pathlib import Path
import shutil
import subprocess

ROOT = Path(__file__).resolve().parents[1]


def main():
    pio = shutil.which('pio') or str(Path.home()/'.platformio/penv/bin/pio')

    def expanded_config(*arguments):
        result = subprocess.run([pio, 'project', 'config', *arguments, '--json-output'],
                                cwd=ROOT, check=True, capture_output=True, text=True)
        return {section: dict(options) for section, options in json.loads(result.stdout)}

    config = expanded_config()
    environments = {section[4:]: options for section, options in config.items()
                    if section.startswith('env:')}
    catalogs = {}
    nrf_profiles = {}
    for filename, platform in [('firmware-targets.json', 'espressif32@6.13.0'),
                               ('nrf52-targets.json', 'nordicnrf52@10.11.0')]:
        entries = json.loads((ROOT/'config'/filename).read_text())
        names = {entry['environment'] for entry in entries}
        if len(names) != len(entries) or names & catalogs.keys():
            raise SystemExit(f'Duplicate targets in {filename}')
        for name in names:
            catalogs[name] = platform
        if platform.startswith('nordic'):
            nrf_profiles = {entry['environment']: entry for entry in entries}
    if environments.keys() != catalogs.keys():
        raise SystemExit('The combined project environments must match both firmware catalogs')
    for name, platform in catalogs.items():
        env = environments[name]
        if env.get('platform') != platform:
            raise SystemExit(f'{name} inherited the wrong processor platform')
        scripts = env.get('extra_scripts', [])
        if platform.startswith('nordic'):
            if scripts != ['pre:tools/nrf_build.py'] or env.get('board_build.filesystem'):
                raise SystemExit(f'{name} inherited ESP32 build settings')
            profile = nrf_profiles[name]
            version = profile.get('softdevice')
            expected = {'6.1.1': ('0x26000', 'firmware/nrf52/app-s140-6.ld'),
                        '7.3.0': ('0x27000', 'firmware/nrf52/app.ld')}.get(version)
            if not expected or profile.get('applicationStart') != expected[0] or env.get('board_build.softdevice.sd_version') != version or env.get('board_build.ldscript') != expected[1]:
                raise SystemExit(f'{name} catalog and compiled SoftDevice layout differ')
        elif 'pre:tools/embed_web.py' not in scripts or 'pre:tools/nrf_build.py' in scripts:
            raise SystemExit(f'{name} inherited nRF build settings')
    if any(name not in environments for name in config['platformio']['default_envs']):
        raise SystemExit('A default environment is missing from the combined project')
    wrapper = configparser.ConfigParser(interpolation=None)
    wrapper.read(ROOT/'platformio-nrf52.ini')
    if wrapper['platformio'].get('extra_configs') != 'config/nrf52.ini':
        raise SystemExit('The nRF-only wrapper must use the same shared environments')
    if any(section.startswith('env:') for section in wrapper.sections()):
        raise SystemExit('Keep nRF environments in the shared configuration, not the wrapper')
    expected_nrf = {name for name, platform in catalogs.items() if platform.startswith('nordic')}
    print(f'All {len(environments)} environments are visible, packaged, and isolated by processor family.')
    print(f'The optional nRF-only wrapper shares the same {len(expected_nrf)} nRF environments.')


if __name__ == '__main__':
    main()
