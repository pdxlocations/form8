"""Bundle the webpage into app firmware so updates preserve incident storage."""
from pathlib import Path
Import("env")

root = Path(env.subst("$PROJECT_DIR"))
generated = root / ".pio" / "generated"
generated.mkdir(parents=True, exist_ok=True)
mimes = {"html": "text/html", "js": "text/javascript", "css": "text/css", "svg": "image/svg+xml", "webmanifest": "application/manifest+json"}
names = ["index.html", "app.js", "model.js", "style.css", "sw.js", "manifest.webmanifest", "icon.svg"]
parts = ["#pragma once\n#include <Arduino.h>\n"]
for i, name in enumerate(names):
    content = (root / "web" / name).read_text()
    assert ')FORM8WEB"' not in content
    parts.append(f'static const char web_{i}[] PROGMEM=R"FORM8WEB({content})FORM8WEB";\n')
parts.append("struct WebAsset { const char* path; const char* mime; const char* body; };\nstatic const WebAsset WEB_ASSETS[]={\n")
for i, name in enumerate(names):
    parts.append(f'{{"/{name}","{mimes[name.rsplit(".", 1)[1]]}",web_{i}}},\n')
parts.append("};\n")
header = generated / "WebAssets.h"
text = "".join(parts)
if not header.exists() or header.read_text() != text:
    header.write_text(text)
env.Append(CPPPATH=[str(generated)])
