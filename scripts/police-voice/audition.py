"""Roadmap ①: the candidates as they will sound, and how intelligible they are.

    python scripts/police-voice/audition.py <candidates dir> <out dir>

<candidates dir> holds one folder per voice from generate.py. For each voice and line this writes
<out>/<voice>/<line>.wav processed the way the game will play it -- a megaphone line through a
patrol car's loudspeaker, a radio line through the radio with its squelch, a shout with a little of
the street round it -- and scores each by transcribing it (faster-whisper, `small`) and comparing the
readings in katakana (pyopenjtalk), so a line that comes out garbled scores low without anyone
listening. Results in <out>/audition.json.
"""
import json
import os
import sys

import numpy as np
import soundfile as sf
from scipy.signal import butter, sosfilt, resample_poly

RATE = 44100
HERE = os.path.dirname(os.path.abspath(__file__))
LINES = {l['id']: l for l in json.load(open(os.path.join(HERE, '..', '..', 'assets', 'police-voice', 'lines.json'), encoding='utf-8'))['lines']}
rng = np.random.default_rng(7)


def band(x, lo, hi, order=4):
    return sosfilt(butter(order, [lo, hi], btype='band', fs=RATE, output='sos'), x)


def tone(hz, seconds, level=.35):
    t = np.arange(int(seconds * RATE)) / RATE
    env = np.minimum(1, np.minimum(t / .004, (seconds - t) / .006))
    return np.sin(2 * np.pi * hz * t) * env * level


def noise(seconds, lo, hi, level):
    n = band(rng.standard_normal(int(seconds * RATE)), lo, hi, 2)
    return n / (np.abs(n).max() + 1e-9) * level


def megaphone(x):
    """A patrol car's loudspeaker: narrow horn band, driven a little, a mic click, the street's slap."""
    y = band(x, 350, 3500)
    y = np.tanh(y * 2.4) / np.tanh(2.4)
    click = noise(.012, 1500, 6000, .25)
    y = np.concatenate([click, np.zeros(int(.03 * RATE)), y])
    d = int(.09 * RATE)
    out = np.concatenate([y, np.zeros(d + int(.25 * RATE))])
    out[d:d + len(y)] += y * .22
    d2 = int(.21 * RATE)
    out[d2:d2 + len(y)] += y * .09
    return out


def radio(x):
    """The dispatcher: a narrow, lo-fi, compressed voice between the squelch's beep and hiss."""
    y = band(x, 300, 3000)
    y = resample_poly(resample_poly(y, 8000, RATE), RATE, 8000)   # an 8 kHz channel
    y = np.tanh(y * 3.2) / np.tanh(3.2)
    y = y + noise(len(y) / RATE, 400, 3000, .035)                   # the channel's own hiss
    open_ = np.concatenate([tone(1850, .07), np.zeros(int(.03 * RATE)), noise(.05, 500, 4000, .3)])
    close = np.concatenate([noise(.09, 500, 4000, .32), np.zeros(int(.04 * RATE)), tone(1450, .05, .25)])
    return np.concatenate([open_, y * .8, close])


def shout(x):
    """An officer on foot: dry, with a little of the street round it."""
    d = int(.07 * RATE)
    out = np.concatenate([x, np.zeros(d + int(.15 * RATE))])
    out[d:d + len(x)] += x * .12
    return out


PROCESS = {'megaphone': megaphone, 'radio': radio, 'shout': shout}


def main(src, dst):
    from faster_whisper import WhisperModel
    import pyopenjtalk
    asr = WhisperModel('small', device='cpu', compute_type='int8')
    kana = lambda s: ''.join(ch for ch in pyopenjtalk.g2p(s, kana=True) if '゠' <= ch <= 'ヿ' and ch != '・')

    def cer(a, b):
        a, b = kana(a), kana(b)
        d = list(range(len(b) + 1))
        for i, ca in enumerate(a, 1):
            p, d[0] = d[0], i
            for j, cb in enumerate(b, 1):
                p, d[j] = d[j], min(d[j] + 1, d[j - 1] + 1, p + (ca != cb))
        return d[len(b)] / max(1, len(a))
    results = {}
    for voice in sorted(os.listdir(src)):
        if not os.path.isdir(os.path.join(src, voice)):
            continue
        os.makedirs(os.path.join(dst, voice), exist_ok=True)
        results[voice] = {'meta': json.load(open(os.path.join(src, voice, 'voice.json'), encoding='utf-8')), 'lines': {}}
        for lid, line in LINES.items():
            path = os.path.join(src, voice, lid + '.wav')
            if not os.path.exists(path):
                continue
            x, rate = sf.read(path)
            assert rate == RATE
            y = PROCESS[line['use']](x)
            y = y / (np.abs(y).max() + 1e-9) * 10 ** (-1 / 20)
            sf.write(os.path.join(dst, voice, lid + '.wav'), y.astype(np.float32), RATE, subtype='PCM_16')
            heard = {}
            for name, audio in (('dry', x), ('processed', y)):
                segs, _ = asr.transcribe(audio.astype(np.float32) if RATE == 16000 else resample_poly(audio, 16000, RATE).astype(np.float32),
                                         language='ja', beam_size=5)
                text = ''.join(s.text for s in segs).strip()
                heard[name] = {'text': text, 'cer': round(cer(line['text'], text), 3)}
            results[voice]['lines'][lid] = heard
            print(voice, lid, heard['dry']['cer'], heard['processed']['cer'], heard['processed']['text'], flush=True)
        for k in ('dry', 'processed'):
            v = [l[k]['cer'] for l in results[voice]['lines'].values()]
            results[voice][k + 'Cer'] = round(float(np.mean(v)), 3)
    json.dump(results, open(os.path.join(dst, 'audition.json'), 'w'), ensure_ascii=False, indent=1)


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
