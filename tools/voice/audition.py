"""Offline-capable Kokoro audition builder; never installs or publishes game assets."""
import argparse
import hashlib
import importlib.metadata
import json
import pathlib
import re
import subprocess
import os

REPO = 'hexgrad/Kokoro-82M'
REVISION = 'f3ff3571791e39611d31c381e3a41a3af07b4987'
ROOT = pathlib.Path(__file__).resolve().parents[2]
VOICES = {'am_michael': 'a', 'am_fenrir': 'a', 'af_heart': 'a', 'af_bella': 'a'}
CASES = {
    'kernel.directive.relay': ['am_michael', 'am_fenrir'],
    'sinter.instruction.vanguard': ['am_michael', 'am_fenrir'],
    'kestrel.log17': ['af_heart', 'af_bella'],
    'brine.evidence.signal': ['af_heart', 'af_bella'],
}
FILTERS = {
    'kernel': 'highpass=f=100,lowpass=f=6000,acompressor=threshold=0.125:ratio=2:attack=12:release=120',
    'research_log': 'highpass=f=75,lowpass=f=7400,acompressor=threshold=0.16:ratio=1.6',
    'recovered': 'highpass=f=160,lowpass=f=4100,acompressor=threshold=0.13:ratio=2',
    'automated': 'highpass=f=100,lowpass=f=7000',
}
def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()
def catalog():
    result = subprocess.check_output(['node', '--input-type=module', '-e',
      "import {RADIO_DIALOGUE} from './shared/dialogue.js';console.log(JSON.stringify(RADIO_DIALOGUE))"], cwd=ROOT)
    return json.loads(result)
def spoken(text):
    text = re.sub(r'\[([A-Z0-9])\]', r', key \1,', text)
    text = re.sub(r'\b(\d+)m\b', r'\1 meters', text)
    return text.replace('·', ',').replace('—', '.')
def run(*args):
    subprocess.run(args, check=True, stdin=subprocess.DEVNULL)
def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--out', type=pathlib.Path, default=ROOT / 'voice-auditions')
    parser.add_argument('--offline', action='store_true')
    parser.add_argument('--all', action='store_true', help='render all 26 lines with provisional casting; still unapproved')
    parser.add_argument('--remaining', action='store_true', help='render only the 22 unauditioned lines using selected cast')
    args = parser.parse_args()
    if args.all and args.remaining: parser.error('Choose --all or --remaining')
    if args.offline:
        os.environ['HF_HUB_OFFLINE'] = '1'
        os.environ['TRANSFORMERS_OFFLINE'] = '1'
    import numpy as np
    import soundfile as sf
    import torch
    from huggingface_hub import hf_hub_download
    from kokoro import KModel, KPipeline
    torch.set_num_threads(min(4, os.cpu_count() or 1))
    torch.manual_seed(0)
    def fetch(name):
        return pathlib.Path(hf_hub_download(REPO, name, revision=REVISION, local_files_only=args.offline))
    config, weights = fetch('config.json'), fetch('kokoro-v1_0.pth')
    model = KModel(repo_id=REPO, config=str(config), model=str(weights)).to('cpu').eval()
    pipeline = KPipeline(lang_code='a', repo_id=REPO, model=model, device='cpu')
    entries = catalog()
    cases = {k: ['am_michael' if d['voiceProfile']=='VOICE-001' else 'af_heart'] for k,d in entries.items()} if args.all or args.remaining else CASES
    if args.remaining: cases = {k:v for k,v in cases.items() if k not in CASES}
    voice_files = {v: fetch('voices/'+v+'.pt') for v in sorted({v for vs in cases.values() for v in vs})}
    packs = {v: torch.load(str(p), map_location='cpu', weights_only=True) for v,p in voice_files.items()}
    out = args.out.resolve()
    out.mkdir(parents=True, exist_ok=False)
    clips = []
    for id, variants in cases.items():
        d = entries[id]
        text = spoken(d['transcript'])
        for voice in variants:
            speed = 0.94 if voice.startswith('am') else 0.97
            stem = id + '--' + voice
            wav, mp3 = out/(stem+'.wav'), out/(stem+'.mp3')
            chunks = []
            with torch.inference_mode():
                for _, _, audio in pipeline(text, voice=packs[voice], speed=speed):
                    if audio is None: raise RuntimeError('Missing audio: '+stem)
                    chunks.append(audio.detach().cpu().numpy().reshape(-1))
            if not chunks: raise RuntimeError('Empty result: '+stem)
            audio = np.concatenate(chunks)
            if not np.isfinite(audio).all() or len(audio)<12000 or np.max(np.abs(audio))<0.001:
                raise RuntimeError('Invalid signal: '+stem)
            audio = np.pad(audio, (2400, 4800))
            if np.max(np.abs(audio))>0.98: audio = audio * (0.98 / np.max(np.abs(audio)))
            sf.write(wav, audio, 24000, subtype='PCM_24')
            filters = FILTERS[d['communicationProfile']] + ',loudnorm=I=-18:TP=-1.5:LRA=7'
            run('ffmpeg','-nostdin','-v','error','-y','-i',str(wav),'-af',filters,'-ar','24000','-ac','1','-c:a','libmp3lame','-b:a','64k',str(mp3))
            run('ffmpeg','-nostdin','-v','error','-i',str(mp3),'-f','null','-')
            clips.append({'id':id,'voice':voice,'voiceProfile':d['voiceProfile'],'communicationProfile':d['communicationProfile'],
                'transcript':d['transcript'],'spokenText':text,'speed':speed,'durationSeconds':round(len(audio)/24000,3),
                'master':wav.name,'masterSha256':digest(wav),'delivery':mp3.name,'deliverySha256':digest(mp3),'deliveryBytes':mp3.stat().st_size,
                'review':'unreviewed'})
            print('Generated', stem, mp3.stat().st_size, 'bytes', flush=True)
    provenance={'model':REPO,'revision':REVISION,'publisherModelLicense':'Apache-2.0','rightsReview':'pending',
        'modelSha256':digest(weights),'configSha256':digest(config),'voiceSha256':{k:digest(v) for k,v in voice_files.items()},
        'packages':{p:importlib.metadata.version(p) for p in ['kokoro','torch','soundfile','huggingface-hub','misaki','numpy']},'clips':clips}
    (out/'manifest.json').write_text(json.dumps(provenance,indent=2,ensure_ascii=False)+'\n',encoding='utf-8')
if __name__ == '__main__': main()
