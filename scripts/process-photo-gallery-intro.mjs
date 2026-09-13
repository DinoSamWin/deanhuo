import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const source = process.argv[2];
if (!source) throw new Error('Pass the user-supplied video path.');
const tempo = .95;
const probe = spawnSync('ffprobe', ['-v','error','-show_entries','format=duration','-of','json',source], { encoding: 'utf8' });
const sourceDuration = Number(JSON.parse(probe.stdout).format.duration);
if (!Number.isFinite(sourceDuration)) throw new Error('Cannot read source duration.');
const fadeStart = sourceDuration / tempo + 1.4 - .5;
const work = mkdtempSync(join(tmpdir(), 'photo-gallery-acoustics-'));
const sampleRate = 48000, seconds = 1.4, frames = Math.ceil(sampleRate * seconds);
const data = Buffer.alloc(44 + frames * 2 * 4);
data.write('RIFF', 0); data.writeUInt32LE(data.length - 8, 4); data.write('WAVEfmt ', 8);
data.writeUInt32LE(16, 16); data.writeUInt16LE(3, 20); data.writeUInt16LE(2, 22);
data.writeUInt32LE(sampleRate, 24); data.writeUInt32LE(sampleRate * 8, 28);
data.writeUInt16LE(8, 32); data.writeUInt16LE(32, 34); data.write('data', 36); data.writeUInt32LE(frames * 8, 40);
// Original synthetic room impulse: a strong direct sound, asymmetrical early
// reflections and a low-pass diffuse tail. No third-party IR or new speech.
for (let channel = 0; channel < 2; channel++) {
    let seed = 135527 + channel * 488, smooth = 0;
    const echoes = channel ? [[.029,.10],[.047,.074],[.071,.05],[.103,.028]] : [[.022,.11],[.039,.075],[.063,.047],[.091,.031]];
    const taps = new Map(echoes.map(([time,gain]) => [Math.round(time * sampleRate),gain]));
    for (let n = 0; n < frames; n++) {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        smooth += .4 * ((seed / 2147483648 - 1) - smooth);
        const t = n / sampleRate;
        const envelope = t > .055 ? Math.min(1, (t - .055) / .045) * Math.exp(-6.908 * (t - .055) / 1.15) : 0;
        const value = (n === 0 ? 1 : 0) + (taps.get(n) || 0) + smooth * .004 * envelope;
        data.writeFloatLE(value, 44 + (n * 2 + channel) * 4);
    }
}
const impulse = join(work, 'gallery-room-impulse.wav');
writeFileSync(impulse, data);
const output = new URL('../assets/audio/photo-gallery-entrance-slow95.mp3', import.meta.url).pathname;
const result = spawnSync('ffmpeg', ['-hide_banner','-n','-i',source,'-i',impulse,'-filter_complex',
    // Stretch the source without changing pitch, BEFORE applying the unchanged
    // room response. Render from the original video, not the previous MP3.
    `[0:a:0]aresample=48000,atempo=${tempo},highpass=f=65,lowpass=f=12500,apad=pad_dur=1.4[voice];[voice][1:a]afir=dry=1:wet=1:irnorm=-1:irgain=1:precision=float,afade=t=in:d=0.025,afade=t=out:st=${fadeStart.toFixed(4)}:d=0.48,loudnorm=I=-18:TP=-2:LRA=9[out]`,
    '-map','[out]','-vn','-ar','48000','-ac','2','-c:a','libmp3lame','-b:a','192k',decodeURIComponent(output)], {encoding:'utf8'});
if (result.status !== 0) throw new Error(result.stderr);
console.log(result.stderr);
console.log('Processed soundtrack:', decodeURIComponent(output));
console.log('Reproducible impulse retained in:', work);
