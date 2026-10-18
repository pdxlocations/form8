"""Resolve the numeric firmware version for the device display."""
import json
import os
from pathlib import Path
import re
import subprocess


def numeric_version(value):
    match = re.fullmatch(r'v?((?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*))(?:[.+-].*)?', value.strip())
    if not match:
        raise ValueError(f'Invalid firmware version: {value!r}')
    return match.group(1)


def firmware_version(root):
    if os.environ.get('FORM8_VERSION'):
        return numeric_version(os.environ['FORM8_VERSION'])
    result = subprocess.run(['git', 'describe', '--tags', '--abbrev=0', '--match', 'v[0-9]*'],
                            cwd=root, capture_output=True, text=True)
    if result.returncode == 0:
        return numeric_version(result.stdout)
    return numeric_version(json.loads((root / 'package.json').read_text())['version'])


if __name__ == '__main__':
    print(firmware_version(Path(__file__).resolve().parents[1]))
