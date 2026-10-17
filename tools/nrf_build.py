from pathlib import Path
Import('env')
framework=Path(env.PioPlatform().get_package_dir('framework-arduinoadafruitnrf52'))
env.Append(LIBPATH=[str(framework/'cores/nRF5/linker')])
env.Append(CPPPATH=[str(Path(env.subst('$PROJECT_DIR'))/'firmware/nrf52')])
