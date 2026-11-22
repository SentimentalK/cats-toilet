import argparse
import math
import struct
import subprocess
import wave
from pathlib import Path

SR = 44100
TAU = 2.0 * math.pi
PEAK = 0.5
FADE_MS = 10
BARS = 16
BEAT = 0.5
BAR = 2.0
BGM_LEN = 32.0
PROGRESSION = [
    (36, [60, 64, 67]),
    (43, [59, 62, 67]),
    (45, [57, 60, 64]),
    (41, [53, 57, 60]),
]
ROOT = Path(__file__).resolve().parent.parent
SYNTH_SOUNDS = ['meow', 'meow-long', 'trill', 'happy']
PURR_SOURCE = ROOT / 'assets' / 'audio' / 'source' / 'purring-cat-mysid.oga'
FFMPEG_ARGS = [
    '-codec:a', 'libmp3lame', '-b:a', '64k', '-ar', str(SR), '-ac', '1',
    '-fflags', '+bitexact', '-flags:a', '+bitexact', '-map_metadata', '-1', '-id3v2_version', '0',
]


def hz(midi):
    return 440.0 * (2.0 ** ((midi - 69) / 12.0))


def env(t, dur):
    attack = 0.012
    release = min(0.06, dur * 0.35)
    if t < attack:
        return t / attack
    if t > dur - release:
        return max(0.0, (dur - t) / release)
    return 1.0


def add_tone(buf, start, dur, freq, amp, harmonics):
    first = int(round(start * SR))
    count = int(round(dur * SR))
    for i in range(count):
        idx = first + i
        if idx < 0 or idx >= len(buf):
            continue
        t = i / SR
        sample = 0.0
        for h, weight in enumerate(harmonics, 1):
            sample += weight * math.sin(TAU * freq * h * t)
        buf[idx] += sample * amp * env(t, dur)


def add_glide(buf, start, dur, f0, f1, amp, harmonics, shape='sine'):
    first = int(round(start * SR))
    count = int(round(dur * SR))
    phase = 0.0
    for i in range(count):
        idx = first + i
        if idx < 0 or idx >= len(buf):
            continue
        t = i / SR
        freq = f0 + (f1 - f0) * (t / dur)
        phase += TAU * freq / SR
        sample = 0.0
        for h, weight in enumerate(harmonics, 1):
            sample += weight * math.sin(phase * h)
        if shape == 'tri':
            sample += 0.25 * math.sin(phase * 3.0) / 9.0
        buf[idx] += sample * amp * env(t, dur)


def render_bgm():
    n = int(round(BGM_LEN * SR))
    buf = [0.0] * n
    for bar in range(BARS):
        root, chord = PROGRESSION[bar % 4]
        t0 = bar * BAR
        add_tone(buf, t0, 0.9, hz(root), 0.22, [1.0, 0.25])
        add_tone(buf, t0 + 1.0, 0.9, hz(root), 0.18, [1.0, 0.25])
        for step in range(8):
            note = chord[[0, 1, 2, 1][step % 4]] + 12
            add_tone(buf, t0 + step * 0.25, 0.2, hz(note), 0.075, [1.0, 0.3, 0.12])
        pattern = [0, 2, 1, 2] if bar % 2 == 0 else [2, 1, 2, 0]
        for step in range(4):
            note = chord[pattern[step]] + 12
            add_tone(buf, t0 + step * BEAT, 0.44, hz(note), 0.17, [1.0, 0.35, 0.12])
    return buf


def render_meow():
    n = int(round(0.55 * SR))
    buf = [0.0] * n
    add_glide(buf, 0.0, 0.55, 700.0, 450.0, 0.6, [1.0, 0.35, 0.15])
    return buf


def render_meow_long():
    n = int(round(1.2 * SR))
    buf = [0.0] * n
    add_glide(buf, 0.0, 0.45, 620.0, 380.0, 0.6, [1.0, 0.35, 0.18])
    add_glide(buf, 0.45, 0.75, 380.0, 480.0, 0.5, [1.0, 0.3, 0.14])
    return buf


def render_trill():
    n = int(round(0.7 * SR))
    buf = [0.0] * n
    phase = 0.0
    for i in range(n):
        t = i / SR
        phase += TAU * 520.0 / SR
        sample = math.sin(phase) + 0.4 * math.sin(phase * 2.0) + 0.15 * math.sin(phase * 3.0)
        tremolo = 0.5 + 0.5 * math.sin(TAU * 18.0 * t)
        buf[i] = sample * tremolo * env(t, 0.7) * 0.6
    return buf


def render_happy():
    n = int(round(0.8 * SR))
    buf = [0.0] * n
    add_glide(buf, 0.0, 0.38, 600.0, 760.0, 0.55, [1.0, 0.3, 0.12])
    add_glide(buf, 0.38, 0.42, 700.0, 900.0, 0.5, [1.0, 0.3, 0.12])
    return buf


RENDERERS = {
    'meow': render_meow,
    'meow-long': render_meow_long,
    'trill': render_trill,
    'happy': render_happy,
}


def finalize(samples):
    peak = 0.0
    for value in samples:
        mag = abs(value)
        if mag > peak:
            peak = mag
    scale = PEAK / peak if peak > 0 else 0.0
    out = [v * scale for v in samples]
    fade = int(round(FADE_MS / 1000.0 * SR))
    total = len(out)
    for i in range(min(fade, total)):
        k = i / fade
        out[i] *= k
        out[total - 1 - i] *= k
    return [max(-32768, min(32767, int(round(v * 32767.0)))) for v in out]


def write_wav(path, ints):
    payload = bytearray()
    for start in range(0, len(ints), 8192):
        chunk = ints[start:start + 8192]
        payload += struct.pack('<%dh' % len(chunk), *chunk)
    with wave.open(str(path), 'wb') as handle:
        handle.setnchannels(1)
        handle.setsampwidth(2)
        handle.setframerate(SR)
        handle.writeframes(bytes(payload))


def encode(wav, mp3):
    cmd = ['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-i', str(wav)] + FFMPEG_ARGS + [str(mp3)]
    try:
        done = subprocess.run(cmd)
    except FileNotFoundError:
        print('ffmpeg not found: install ffmpeg with libmp3lame to build the audio assets')
        raise SystemExit(1)
    if done.returncode != 0:
        print('ffmpeg failed for %s (exit %d)' % (mp3.name, done.returncode))
        raise SystemExit(1)


def encode_purr(source, mp3):
    if not source.is_file():
        print('purr source missing: %s' % source)
        print('restore assets/audio/source/purring-cat-mysid.oga; see assets/audio/source/README.md')
        raise SystemExit(1)
    cmd = ['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y',
           '-ss', '0.5', '-t', '3.0', '-i', str(source),
           '-af', 'aformat=sample_rates=44100:channel_layouts=mono,loudnorm=I=-18:TP=-6:LRA=7'] + FFMPEG_ARGS + [str(mp3)]
    try:
        done = subprocess.run(cmd)
    except FileNotFoundError:
        print('ffmpeg not found: install ffmpeg with libmp3lame to build the audio assets')
        raise SystemExit(1)
    if done.returncode != 0:
        print('ffmpeg failed for %s (exit %d)' % (mp3.name, done.returncode))
        raise SystemExit(1)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--out', default=str(ROOT / 'assets' / 'audio'))
    args = parser.parse_args()
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)

    purr_mp3 = out / 'purr.mp3'
    encode_purr(PURR_SOURCE, purr_mp3)

    tmp = out / '_wav'
    tmp.mkdir(parents=True, exist_ok=True)

    tracks = [('bgm', render_bgm())] + [(name, RENDERERS[name]()) for name in SYNTH_SOUNDS]
    written = []
    for name, samples in tracks:
        wav = tmp / (name + '.wav')
        mp3 = out / (name + '.mp3')
        write_wav(wav, finalize(samples))
        encode(wav, mp3)
        wav.unlink()
        written.append((name, mp3))
    tmp.rmdir()
    written.insert(1, ('purr', purr_mp3))

    total = 0
    bad = False
    for name, path in written:
        size = path.stat().st_size
        total += size
        print('%s.mp3 %d bytes' % (name, size))
        if name == 'bgm':
            if size > 358400:
                print('bgm.mp3 exceeds 350 KiB')
                bad = True
        elif name == 'purr':
            if size > 40960:
                print('purr.mp3 exceeds 40 KiB')
                bad = True
        elif size > 20480:
            print('%s.mp3 exceeds 20 KiB' % name)
            bad = True
    print('total %d bytes' % total)
    if total > 512000:
        print('audio total exceeds 500 KiB')
        bad = True
    if bad:
        raise SystemExit(1)


if __name__ == '__main__':
    main()
