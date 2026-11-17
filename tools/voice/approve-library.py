"""Construct decisions for the exact 22-file owner-reviewed library artifact only."""
import json
import pathlib
import re
import sys
from audition import catalog, REPO, REVISION
root=pathlib.Path(__file__).resolve().parents[2]
source=pathlib.Path(sys.argv[1])
out=pathlib.Path(sys.argv[2])
first=json.loads((root/'tools/voice/approved-preview-decisions.json').read_text(encoding='utf-8'))
manifest=json.loads((source/'manifest.json').read_text(encoding='utf-8'))
assert manifest['model']==REPO and manifest['revision']==REVISION
entries=catalog()
expected=set(entries)-{d['id'] for d in first}
clips=manifest['clips']
assert len(expected)==22 and len(clips)==22 and {c['id'] for c in clips}==expected
decisions=[]
for clip in clips:
    d=entries[clip['id']]
    voice='am_michael' if d['voiceProfile']=='VOICE-001' else 'af_heart'
    assert clip['voice']==voice and clip['transcript']==d['transcript']
    assert re.fullmatch(r'[a-f0-9]{64}',clip['deliverySha256'])
    decisions.append(dict(id=clip['id'],voice=voice,deliverySha256=clip['deliverySha256'],
      decision='accepted',reviewer='Attunement project owner (chat approval of remaining library)',
      listeningNotes='Owner replied Approved after being invited to review the exact remaining-library artifact from run 44167225466; assistant interprets that approval as covering this library, not a new rendition.',
      rightsNotes=first[0]['rightsNotes'],distributionScope='private-playtest'))
out.write_text(json.dumps(decisions,indent=2)+'\n',encoding='utf-8')
