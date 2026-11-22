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
SOURCE_DIR = ROOT / 'assets' / 'audio' / 'source'
# Cat sounds are trimmed from CC0 / public-domain recordings in assets/audio/source/; only the BGM is synthesised.
REAL_SOUNDS = [
    {'id': 'purr', 'file': 'purring-cat-mysid.oga', 'ss': '0.5', 't': '3.0', 'credit': 'Mysid, Public Domain'},
    {'id': 'meow', 'file': 'meow-short-tsester.flac', 'ss': '0.212', 't': '0.663', 'credit': 'Tsester, CC0'},
    {'id': 'meow-long', 'file': 'meow-long-heismark.oga', 'ss': '9.40', 't': '1.97', 'credit': 'Heismark, Public Domain'},
    {'id': 'trill', 'file': 'trill-jsbarrett.mp3', 'ss': '3.48', 't': '0.70', 'credit': 'jsbarrett, CC0'},
    {'id': 'happy', 'file': 'meow-happy-miquilena.ogg', 'ss': '0', 't': '1.174', 'credit': 'George Miquilena, CC0'},
]
SFX_BYTES_MAX = 20480
PURR_BYTES_MAX = 40960
SFX_TOTAL_MAX = 102400
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


def encode_real(sound, mp3):
    """A missing source must fail, never fall back to synthesis."""
    source = SOURCE_DIR / sound['file']
    if not source.is_file():
        print('%s source missing: %s (%s)' % (sound['id'], source, sound['credit']))
        print('restore it from the URL in assets/audio/source/README.md; no synthetic fallback')
        raise SystemExit(1)
    cmd = ['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y',
           '-ss', sound['ss'], '-t', sound['t'], '-i', str(source),
           '-af', 'aformat=sample_rates=44100:channel_layouts=mono,loudnorm=I=-18:TP=-6:LRA=7'] + \
          FFMPEG_ARGS + [str(mp3)]
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

    tmp = out / '_wav'
    tmp.mkdir(parents=True, exist_ok=True)
    bgm = out / 'bgm.mp3'
    wav = tmp / 'bgm.wav'
    write_wav(wav, finalize(render_bgm()))
    encode(wav, bgm)
    wav.unlink()
    tmp.rmdir()

    written = [('bgm', bgm)]
    for sound in REAL_SOUNDS:
        mp3 = out / (sound['id'] + '.mp3')
        encode_real(sound, mp3)
        written.append((sound['id'], mp3))

    total = 0
    sfx_total = 0
    bad = False
    for name, path in written:
        size = path.stat().st_size
        total += size
        extra = ''
        if name == 'bgm':
            if size > 358400:
                print('bgm.mp3 exceeds 350 KiB')
                bad = True
        else:
            sfx_total += size
            if name == 'purr':
                if size > PURR_BYTES_MAX:
                    print('purr.mp3 exceeds 40 KiB')
                    bad = True
            elif size > SFX_BYTES_MAX:
                print('%s.mp3 exceeds 20 KiB' % name)
                bad = True
            extra = '  ' + next(s['credit'] for s in REAL_SOUNDS if s['id'] == name)
        print('%s.mp3 %d bytes%s' % (name, size, extra))
    print('cat sounds %d bytes (max %d)' % (sfx_total, SFX_TOTAL_MAX))
    print('total %d bytes' % total)
    if sfx_total > SFX_TOTAL_MAX:
        print('cat sounds exceed 100 KiB')
        bad = True
    if total > 512000:
        print('audio total exceeds 500 KiB')
        bad = True
    if bad:
        raise SystemExit(1)


if __name__ == '__main__':
    main()
