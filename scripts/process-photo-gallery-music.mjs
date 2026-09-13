import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const versailles = process.argv[2] === '--versailles';
if (process.argv.length > 2 && (!versailles || !process.argv[3])) {
    throw new Error('Usage: node scripts/process-photo-gallery-music.mjs [--versailles /path/to/source.ogg]');
}
const source = versailles ? process.argv[3] : fileURLToPath(new URL('../assets/audio/photo-gallery-bossa-antigua.mp3', import.meta.url));
const output = fileURLToPath(new URL(versailles ? '../assets/audio/photo-gallery-versailles-hall.mp3' : '../assets/audio/photo-gallery-bossa-antigua-hall.mp3', import.meta.url));
const title = versailles ? 'Versailles (Gallery room mix)' : 'Bossa Antigua (Gallery room mix)';
const artist = versailles ? 'Haneda Ryoko' : 'Kevin MacLeod';
const comment = versailles ? 'User-supplied OGG; gallery room processing added for local preview; no redistribution license asserted.' : 'CC BY 4.0; exhibition room processing added; source incompetech.com, ISRC USUAN1700069';
const work = mkdtempSync(join(tmpdir(), 'photo-gallery-music-room-'));
const probe = spawnSync('ffprobe', ['-v','error','-show_entries','format=duration','-of','json',source], { encoding:'utf8' });
if (probe.status !== 0) throw new Error(probe.stderr || 'Unable to inspect source audio');
const duration = Number(JSON.parse(probe.stdout).format.duration);
if (!Number.isFinite(duration) || duration <= 0) throw new Error('Invalid audio duration');
const sampleRate = 48000, tail = 1.6, frames = Math.ceil(sampleRate * tail);
const wave = Buffer.alloc(44 + frames * 8);
wave.write('RIFF',0); wave.writeUInt32LE(wave.length - 8,4); wave.write('WAVEfmt ',8);
wave.writeUInt32LE(16,16); wave.writeUInt16LE(3,20); wave.writeUInt16LE(2,22);
wave.writeUInt32LE(sampleRate,24); wave.writeUInt32LE(sampleRate * 8,28);
wave.writeUInt16LE(8,32); wave.writeUInt16LE(32,34); wave.write('data',36); wave.writeUInt32LE(frames * 8,40);
for (let channel = 0; channel < 2; channel++) {
    let seed = 13092026 + channel * 997, smooth = 0;
    const reflections = channel ? [[.027,.20],[.052,.13],[.081,.075],[.113,.045]] : [[.019,.21],[.041,.12],[.068,.08],[.101,.05]];
    const taps = new Map(reflections.map(([time,gain]) => [Math.round(time * sampleRate),gain]));
    for (let n = 0; n < frames; n++) {
        seed = (Math.imul(seed,1664525) + 1013904223) >>> 0;
        smooth += .28 * ((seed / 2147483648 - 1) - smooth);
        const t = n / sampleRate;
        const decay = t > .05 ? Math.min(1,(t - .05) / .06) * Math.exp(-6.908 * (t - .05) / 1.35) : 0;
        wave.writeFloatLE((n === 0 ? .94 : 0) + (taps.get(n) || 0) + smooth * .014 * decay,44 + (n * 2 + channel) * 4);
    }
}
const impulse = join(work,'gallery-speaker-room.wav'); writeFileSync(impulse,wave);
// Fixed, modest room coloration: no tempo change, no pitch shift, no periodic
// stereo motion. Retain the complete piece and let its room tail fade naturally.
const result = spawnSync('ffmpeg', ['-hide_banner','-nostats','-n','-i',source,'-i',impulse,
    '-filter_complex',`[0:a]aresample=48000,highpass=f=75,lowpass=f=10000,equalizer=f=3200:t=q:w=0.8:g=-1.2,extrastereo=m=0.75,apad=pad_dur=${tail}[speakers];[speakers][1:a]afir=dry=1:wet=1:irnorm=-1:irgain=1:precision=float,afade=t=in:d=0.6,afade=t=out:st=${(duration + tail - .7).toFixed(4)}:d=0.7,loudnorm=I=-22:TP=-2:LRA=11[out]`,
    '-map','[out]','-map_metadata','-1','-metadata',`title=${title}`,'-metadata',`artist=${artist}`,
    '-metadata',`comment=${comment}`,
    '-ar','48000','-ac','2','-c:a','libmp3lame','-b:a','192k',output], {encoding:'utf8'});
if (result.status !== 0) throw new Error(result.stderr);
console.log('Rendered gallery music:',output);
console.log('Impulse retained:',impulse);
