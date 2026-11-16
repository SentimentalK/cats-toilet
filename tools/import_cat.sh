#!/usr/bin/env bash
# Cut one cat's three raw sheets into the folder the game loads.
#
#   tools/import_cat.sh <id>          e.g. tools/import_cat.sh british-blue
#
# Reads  assets/raw/cats/<id>/{sheet-a,sheet-b,run}.png  (2x2 green-screen sheets)
# Writes assets/cats/<id>/{sit,squat,sleep,happy,eat,loaf,groom,yawn,walk-1..4}.png
# Afterwards set that cat's `ready: true` in js/cats.js and add the files to
# the precache list in sw.js.
set -euo pipefail
id="${1:?cat id, e.g. british-blue}"
here="$(cd "$(dirname "$0")" && pwd)"
root="$(dirname "$here")"
raw="$root/assets/raw/cats/$id"
out="$root/assets/cats/$id"
mkdir -p "$out"
cut() { python3 -I "$here/cutout.py" "$@"; }
cut sheet "$raw/sheet-a.png" "$out/sit.png" "$out/squat.png" "$out/sleep.png" "$out/happy.png"
cut sheet "$raw/sheet-b.png" "$out/eat.png" "$out/loaf.png" "$out/groom.png" "$out/yawn.png"
cut sheet "$raw/run.png" "$out/walk-1.png" "$out/walk-2.png" "$out/walk-3.png" "$out/walk-4.png" --frames --max 620
