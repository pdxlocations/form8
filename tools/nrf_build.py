from pathlib import Path
Import('env')
# Select the nRF source tree even when built through the combined platformio.ini.
nrf_dir=Path(env.subst('$PROJECT_DIR'))/'firmware/nrf52'
env.Replace(PROJECT_SRC_DIR=str(nrf_dir), PROJECT_INCLUDE_DIR=str(nrf_dir))
framework=Path(env.PioPlatform().get_package_dir('framework-arduinoadafruitnrf52'))
env.Append(LIBPATH=[str(framework/'cores/nRF5/linker')])
env.Append(CPPPATH=[str(Path(env.subst('$PROJECT_DIR'))/'firmware/nrf52')])
