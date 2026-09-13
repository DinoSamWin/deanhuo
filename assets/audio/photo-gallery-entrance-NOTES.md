# Photography entrance audio

## Current variant: 95% tempo

- Active file: `photo-gallery-entrance-slow95.mp3`, approximately 11.5 seconds.
- Pitch-preserving `atempo=0.95` is applied directly to the original video audio before convolution. The room response and its decay remain unchanged; no browser playback-rate/pitch shift is used.
- The previous `photo-gallery-entrance.mp3` is retained for comparison/recovery. The processing script now generates this slower variant without overwriting either file.

## Original processing

- User-provided source: `/Users/dean/Desktop/微信视频2026-09-13_135527_488.mp4` (2026-09-13).
- Extracted its original stereo audio only; no video frames are shipped with the website. The original video is unchanged. No new words, transcription or voice synthesis were added.
- Processed local asset: `photo-gallery-entrance.mp3`, approximately 11 seconds, 48 kHz stereo / 192 kbps.
- Original generated stereo room impulse: direct sound + asymmetric early reflections at 22–103 ms + a low-pass diffuse tail with approximately 1.15-second RT60. A 1.4-second tail is retained after the original audio.
- 65 Hz high-pass, 12.5 kHz low-pass, short fade-in/tail fade, -18 LUFS loudness target and -2 dBTP safety target. Measured encoded output: -17.96 LUFS integrated, -7.61 dBTP true peak (no clipping).
- Reproduce with `node scripts/process-photo-gallery-intro.mjs /absolute/path/to/video.mp4`. The script refuses to overwrite an existing processed asset.
- Rights/provenance remain with the supplied source; this is not labelled as an original composition or assigned a new third-party licence.

The photography entrance plays it once on every entry (not in a loop), before the existing gallery background music. Skip, cancel and blocked-audio retry controls are available.
