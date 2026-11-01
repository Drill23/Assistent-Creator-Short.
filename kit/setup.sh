#!/usr/bin/env bash
# Prepara uma pasta de trabalho para um episódio novo.
# uso: bash kit/setup.sh <pasta_de_trabalho>
set -e
REPO="$(cd "$(dirname "$0")/.." && pwd)"
WORK="${1:?informe a pasta de trabalho}"
mkdir -p "$WORK"
cp -r "$REPO/kit/lib" "$REPO/kit/package.json" "$REPO/kit/render4.sh" "$REPO/kit/sheet.py" "$WORK/"
cd "$WORK"
[ -d node_modules/@napi-rs/canvas ] || npm install --silent
python3 -c "import numpy, scipy, PIL" 2>/dev/null || pip install --break-system-packages -q numpy scipy pillow
FD=/usr/share/fonts/truetype/google-fonts
if [ ! -f "$FD/Poppins-Bold.ttf" ]; then
  mkdir -p "$FD"
  for f in Poppins-Bold Poppins-BoldItalic; do
    curl -sSfL -o "$FD/$f.ttf" "https://raw.githubusercontent.com/google/fonts/main/ofl/poppins/$f.ttf"
  done
fi
which ffmpeg >/dev/null
echo "pronto: $WORK"
