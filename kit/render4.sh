#!/usr/bin/env bash
# usage: bash render4.sh story.js music_script.py music_spec.json OutputName [procs]
set -e
STORY=$1; MUSIC=$2; SPEC=$3; NAME=$4; P=${5:-4}
python3 "$MUSIC" "$SPEC" music.wav
NF=$(node "$STORY" frames); CH=$(( (NF + P - 1) / P )); : > list.txt
for i in $(seq 0 $((P-1))); do a=$((i*CH)); b=$(( (i+1)*CH )); node "$STORY" $a $b part$i.mp4 > log$i.txt 2>&1 & echo "file 'part$i.mp4'" >> list.txt; done
wait
ffmpeg -y -loglevel error -f concat -safe 0 -i list.txt -i music.wav -map 0:v -map 1:a -c:v libx264 -preset medium -crf 20 -pix_fmt yuv420p -c:a aac -b:a 256k -movflags +faststart -shortest "${NAME}_HQ.mp4"
DUR=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "${NAME}_HQ.mp4")
VBR=$(python3 -c "print(int(min(9000, (27.5*8192/float('$DUR')) - 200)))")
ffmpeg -y -loglevel error -i "${NAME}_HQ.mp4" -c:v libx264 -preset slow -b:v ${VBR}k -pass 1 -an -f null /dev/null
ffmpeg -y -loglevel error -i "${NAME}_HQ.mp4" -c:v libx264 -preset slow -b:v ${VBR}k -maxrate $((VBR*3/2))k -bufsize $((VBR*2))k -pass 2 -pix_fmt yuv420p -c:a aac -b:a 192k -movflags +faststart "${NAME}.mp4"
rm -f ffmpeg2pass-0.log* part*.mp4
ls -la "${NAME}.mp4" "${NAME}_HQ.mp4"
