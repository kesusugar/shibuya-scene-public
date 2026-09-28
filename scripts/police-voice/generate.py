"""Roadmap ①: render the police lines (assets/police-voice/lines.json) with a speech engine.

    python scripts/police-voice/generate.py --voice sbv2:jvnv-M1-jp --out <dir>

Nothing here runs in the game or in CI. It is run once, by hand, in a Python environment with the
engines installed (scripts/police-voice/requirements.txt), and what it writes is converted to MP3 and
committed (scripts/police-voice/convert.mjs). The engines and models are chosen for licences that
allow redistributing what they produce:

  kokoro:<voice>        Kokoro-82M (hexgrad/Kokoro-82M, Apache-2.0), e.g. kokoro:jm_kumo
  sbv2:<model>[:style]  Style-Bert-VITS2 JVNV models (litagin/style_bert_vits2_jvnv, CC BY-SA 4.0,
                        from the JVNV corpus), e.g. sbv2:jvnv-M1-jp. A shouted line (megaphone, shout)
                        uses the Angry style unless one is given; a radio line, Neutral.

Output: <out>/<line id>.wav, mono 44.1 kHz float, leading and trailing silence trimmed, peak -1 dBFS;
and <out>/voice.json naming the engine, model, style and licence.
"""
import argparse
import json
import os
from math import gcd

import numpy as np
import soundfile as sf
from scipy.signal import resample_poly

RATE = 44100
HERE = os.path.dirname(os.path.abspath(__file__))
LINES = os.path.join(HERE, '..', '..', 'assets', 'police-voice', 'lines.json')
SBV2_REPO = 'litagin/style_bert_vits2_jvnv'
SBV2_FILES = {'jvnv-M1-jp': 'jvnv-M1-jp_e158_s14000.safetensors', 'jvnv-M2-jp': 'jvnv-M2-jp_e159_s17000.safetensors',
              'jvnv-F1-jp': 'jvnv-F1-jp_e160_s14000.safetensors', 'jvnv-F2-jp': 'jvnv-F2_e166_s20000.safetensors'}


def finish(audio, rate):
    """To 44.1 kHz, the silence at either end off (with a few ms kept), peak -1 dBFS."""
    audio = np.asarray(audio, dtype=np.float64).reshape(-1)
    if rate != RATE:
        g = gcd(RATE, rate)
        audio = resample_poly(audio, RATE // g, rate // g)
    env = np.abs(audio)
    loud = np.nonzero(env > env.max() * 0.02)[0]
    if len(loud):
        pad = int(0.012 * RATE)
        audio = audio[max(0, loud[0] - pad):loud[-1] + pad]
    return (audio / (np.abs(audio).max() + 1e-9) * 10 ** (-1 / 20)).astype(np.float32)


def kokoro_engine(voice):
    from kokoro import KPipeline
    pipe = KPipeline(lang_code='j')

    def say(text, use):
        # A little quicker for a shout; the dispatcher reads at an even pace.
        speed = 1.0 if use == 'radio' else 1.08
        return np.concatenate([a for _, _, a in pipe(text, voice=voice, speed=speed)]), 24000
    meta = {'engine': 'kokoro', 'model': 'hexgrad/Kokoro-82M', 'voice': voice, 'licence': 'Apache-2.0',
            'page': 'https://huggingface.co/hexgrad/Kokoro-82M'}
    return say, meta


def sbv2_engine(model, style=None):
    from huggingface_hub import hf_hub_download
    from style_bert_vits2.constants import Languages
    from style_bert_vits2.nlp import bert_models
    from style_bert_vits2.tts_model import TTSModel
    bert = 'ku-nlp/deberta-v2-large-japanese-char-wwm'
    # Recent transformers load this BERT as float16; the synthesiser on a CPU needs float32.
    bert_models.load_model(Languages.JP, bert).float()
    bert_models.load_tokenizer(Languages.JP, bert)
    paths = [hf_hub_download(SBV2_REPO, f'{model}/{name}') for name in (SBV2_FILES[model], 'config.json', 'style_vectors.npy')]
    tts = TTSModel(model_path=paths[0], config_path=paths[1], style_vec_path=paths[2], device='cpu')

    def say(text, use):
        s = style or ('Neutral' if use == 'radio' else 'Angry')
        rate, audio = tts.infer(text=text, style=s, style_weight=1 if s == 'Neutral' else 2.5,
                                length=1.0 if use == 'radio' else 0.92)
        return audio.astype(np.float32) / 32768 if audio.dtype == np.int16 else audio, rate
    meta = {'engine': 'style-bert-vits2', 'model': f'{SBV2_REPO}/{model}', 'style': style or 'Angry (shouted) / Neutral (radio)',
            'licence': 'CC-BY-SA-4.0', 'page': f'https://huggingface.co/{SBV2_REPO}',
            'credit': 'JVNV corpus (Xin, Takamichi, et al.), CC BY-SA 4.0; Style-Bert-VITS2 JVNV models by litagin'}
    return say, meta


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--voice', required=True)
    ap.add_argument('--out', required=True)
    ap.add_argument('--only', default='', help='comma-separated line ids')
    args = ap.parse_args()
    kind, _, rest = args.voice.partition(':')
    say, meta = kokoro_engine(rest) if kind == 'kokoro' else sbv2_engine(*rest.split(':'))
    lines = json.load(open(LINES, encoding='utf-8'))['lines']
    only = set(filter(None, args.only.split(',')))
    os.makedirs(args.out, exist_ok=True)
    for line in lines:
        if only and line['id'] not in only:
            continue
        audio, rate = say(line.get('read', line['text']), line['use'])
        out = finish(audio, rate)
        sf.write(os.path.join(args.out, line['id'] + '.wav'), out, RATE, subtype='FLOAT')
        print(line['id'], f'{len(out) / RATE:.2f}s', flush=True)
    json.dump({**meta, 'voice_arg': args.voice, 'lines': len(lines)}, open(os.path.join(args.out, 'voice.json'), 'w'), ensure_ascii=False, indent=1)


if __name__ == '__main__':
    main()
