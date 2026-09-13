# Versailles — local exhibition room mix

- Recording: **Versailles (凡尔赛)** by **Haneda Ryoko**, from *Farewell In Paris*.
- Source: user-supplied `/Users/dean/Music/QQ音乐/Haneda Ryoko-Versailles (凡尔赛).ogg`, downloaded by the user from QQ Music. The original is untouched.
- Source inspection: standard Ogg Vorbis, stereo, 44.1 kHz, approximately 96 kbps, duration 275.932494 seconds. No encryption or access-control circumvention was required.
- Derivative: `photo-gallery-versailles-hall.mp3`, MP3 192 kbps, stereo, 48 kHz. Converted directly from the OGG with no intermediate lossy encode. Higher output bitrate does not restore detail missing from the source.
- Processing: gentle speaker EQ, slightly narrowed stereo field, early wall reflections and a diffuse approximately 1.35-second decay. Pitch and tempo are unchanged. Includes a 1.6-second room tail, gentle fades and -22 LUFS loudness target with -2 dBTP ceiling.
- Verification: derivative duration 277.5325 seconds; complete decode succeeded; measured -21.76 LUFS, -4.01 dBTP, LRA 6.8 LU (no clipping). Browser verified this source playing alongside the welcome and continuing after the gallery opens. Audio, intro, viewer and wall-layout regression tests pass.
- Welcome and exhibition share this exact media element: 10% volume under narration, rising to 24% over 2.6 seconds after narration ends or is skipped, without restarting the song.
- Rights: supplied for this local preview. No Creative Commons license is asserted for this recording. A QQ Music download does not establish website redistribution rights; confirm appropriate permission before public deployment. Previous Bossa Antigua assets and their own CC BY license remain untouched.
- Track metadata reference: https://music.bugs.co.kr/track/2286346

## Reproduce

Requires Node.js and FFmpeg (with `afir` and `loudnorm`). The script refuses to overwrite existing outputs.

```sh
node scripts/process-photo-gallery-music.mjs --versailles '/Users/dean/Music/QQ音乐/Haneda Ryoko-Versailles (凡尔赛).ogg'
```
