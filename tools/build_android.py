"""Build the installable Form8 Android development APK (JDK 21+, Android SDK 35)."""
import hashlib
import os
from pathlib import Path
import shutil
import subprocess
ROOT = Path(__file__).resolve().parents[1]
env = os.environ.copy()
mac_java = Path('/Applications/Android Studio.app/Contents/jbr/Contents/Home')
if not env.get('JAVA_HOME') and mac_java.exists():
    env['JAVA_HOME'] = str(mac_java)
sdk = env.get('ANDROID_HOME') or env.get('ANDROID_SDK_ROOT')
if not sdk:
    candidate = Path.home()/'Library/Android/sdk'
    if candidate.exists():
        env['ANDROID_HOME'] = str(candidate)
if not (ROOT/'node_modules/@capacitor/android').exists():
    raise SystemExit('Run npm ci first.')
subprocess.run(['npm','run','mobile:sync'],cwd=ROOT,env=env,check=True)
wrapper = 'gradlew.bat' if os.name == 'nt' else './gradlew'
subprocess.run([wrapper,':app:assembleDebug',':app:lintDebug',':app:testDebugUnitTest'],cwd=ROOT/'android',env=env,check=True)
output = ROOT/'dist/form8-android-debug.apk'
shutil.copy2(ROOT/'android/app/build/outputs/apk/debug/app-debug.apk',output)
output.with_suffix('.apk.sha256').write_text(f'{hashlib.sha256(output.read_bytes()).hexdigest()}  {output.name}\n')
print(f'Installable development APK: {output}')
