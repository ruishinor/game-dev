// Authored radio inventory. No audio is shipped by this foundation.
import { DIRECTIVES, directiveFor } from './content.js';
import { SURVEY } from './survey.js';

const entries = Object.create(null);
function add(id, source, kind, transcript, communicationProfile, voiceProfile) {
  if (Object.hasOwn(entries, id)) throw new Error('Duplicate dialogue ID: '+id);
  entries[id] = Object.freeze({ id, source, kind, transcript, communicationProfile, voiceProfile });
}

for (const row of [
  [
    "brine.prepare.engineering",
    "field",
    "info",
    "Preparation recorded. Continue to B · Engineering (east).",
    "automated",
    "VOICE-001"
  ],
  [
    "brine.prepare.research",
    "field",
    "info",
    "Preparation recorded. Continue to A · Research (west).",
    "automated",
    "VOICE-001"
  ],
  [
    "brine.commissioned",
    "field",
    "gain",
    "Brineworks commissioned. A: research fabrication and resource service. B: engineering fabrication and field repair. Approach either station and open Workshop [B].",
    "automated",
    "VOICE-001"
  ],
  [
    "kestrel.implant.present",
    "kestrel",
    "info",
    "The recovered stress-buffering implant is already in your inventory.",
    "automated",
    "VOICE-002"
  ],
  [
    "kestrel.log17",
    "kestrel",
    "info",
    "Kestrel log 17: the living strata absorbed mechanical stress without retaining the original waveform. Bring a Sinter Laminate and learn Resonance to read the recovered calibration.",
    "research_log",
    "VOICE-002"
  ],
  [
    "kestrel.implant.unlocked",
    "kestrel",
    "gain",
    "The recorder recognizes your laminate trace and unlocks a stored Kestrel Phase Damper. Your reference sample is not consumed.",
    "automated",
    "VOICE-002"
  ],
  [
    "sinter.sample.present",
    "field",
    "info",
    "The interferometer identifies the same mineral-biological composite already in your inventory.",
    "automated",
    "VOICE-001"
  ],
  [
    "sinter.maintenance",
    "field",
    "info",
    "A maintenance note identifies the pale strata as living filters. The interference pattern requires Resonance attunement.",
    "recovered",
    "VOICE-001"
  ],
  [
    "sinter.instruction.vanguard",
    "field",
    "info",
    "Inscribe Resonant Aegis, activate Kinetic Ward beside the probe, then inspect it again. The ward isolates the mineral pattern.",
    "research_log",
    "VOICE-001"
  ],
  [
    "sinter.instruction.symbiotech",
    "field",
    "info",
    "Inscribe Shared Pulse, bring your Mender in Triage, cast Mending Graft on yourself, then inspect the probe again. Its culture traces the pattern.",
    "research_log",
    "VOICE-001"
  ],
  [
    "sinter.instruction.surveyor",
    "field",
    "info",
    "Inscribe Faultline and deploy your Field Rig within 4m of the probe. Inspect again while the rig is active.",
    "research_log",
    "VOICE-001"
  ],
  [
    "sinter.instruction.keeper",
    "field",
    "info",
    "Inscribe Hinge, project your own Hinge Field and inspect while the barrier remains active.",
    "research_log",
    "VOICE-001"
  ],
  [
    "sinter.sample.recovered",
    "field",
    "info",
    "A stable interference trace separates a loose laminate from the collector. The grazers and their predators incorporate the same mineral layers.",
    "automated",
    "VOICE-001"
  ],
  [
    "kernel.directive.complete",
    "kernel",
    "info",
    "Directive chain complete. Return to the Sanctum when ready.",
    "kernel",
    "VOICE-001"
  ]
]) add(...row);

// Only directives actually transmitted after advancement (steps 1 onward).
// Shared class lines share an ID; divergent authored variants do not.
export function directiveDialogueId(cls, step) {
  if (step >= DIRECTIVES.length) return 'kernel.directive.complete';
  const base = DIRECTIVES[step];
  if (!base || step < 1) return null;
  const variant = directiveFor(cls, step);
  const suffix = variant.title !== base.title || variant.text !== base.text ? '.'+cls : '';
  return 'kernel.directive.'+base.id+suffix;
}
for (let step=1;step<DIRECTIVES.length;step++) {
  for (const cls of ['vanguard','symbiotech','keeper','surveyor']) {
    const id=directiveDialogueId(cls,step);
    if (Object.hasOwn(entries,id)) continue;
    const d=directiveFor(cls,step);
    add(id,'kernel','info','Next directive — '+d.title+'. '+d.text,'kernel','VOICE-001');
  }
}
for (const branch of Object.keys(SURVEY)) {
  add('brine.evidence.'+branch,'field','info',SURVEY[branch].field+' Return to Archivist Venn to report your findings.','recovered','VOICE-002');
}
export const RADIO_DIALOGUE=Object.freeze(entries);
export function getRadioDialogue(id) {
  return typeof id==='string' && Object.hasOwn(RADIO_DIALOGUE,id) ? RADIO_DIALOGUE[id] : null;
}
