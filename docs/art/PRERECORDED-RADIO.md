# Prerecorded radio foundation — inventory/production gate

Baseline: preview/playtest-brineworks at 232aa02c963a55d038aaaf4939ba43928d77ca1c. Existing Node and original art inspections passed; both browser playtest workflows failed. No merge acceptance.

## Current coverage

The catalog in shared/dialogue.js includes all 26 distinct current radio transcripts: 11 Kernel advancement messages (including class variants and completion), 3 Brineworks commissioning messages, 2 survey discoveries, 7 Sinter messages, 3 Kestrel messages. IDs travel on private authored events independently of message text. The split survey log stays unchanged. Legacy/unknown events retain their transcript and current local synthesis. Runtime audio playback is intentionally not replaced in this checkpoint.

Archivist Venn is direct interaction, not radio: 8 ARCHIVIST_LINES in shared/content.js, surveyor initial advice in server/sim/progress.js, 2 evidence reports in shared/survey.js (11 existing distinct lines). Initial Kernel directives have no current radio trigger. FIELD_RECORDS are readable artifacts, not automatically spoken; active timed commissioning and combat warnings remain existing text. Do not invent triggers or turn every notification into dialogue. Kestrel unlock/inventory messages are device confirmations; log 17 is research plus a gameplay instruction. Sinter repeat inventory and sample messages are device confirmations; maintenance/research material needs a different auditory treatment. Class-specific actions and prerequisites remain verbatim until intentional copy revision and validation.

## Production decisions (provisional; not cast or approved)

VOICE-001: mature masculine, measured technical authority; initial Kernel/field assignments.
VOICE-002: mature feminine, restrained analytical delivery; initial Kestrel/recovered field assignments.
These are audition labels, not canon gender or named speakers. Field Archive and Kestrel source labels/portraits are unchanged. Venn casting and final source attribution require auditions and lore review. Some catalog profile labels distinguish automated device confirmations from human logs; they are not yet DSP settings.

Audition Kokoro-82M (Apache-2.0 publisher declaration, https://huggingface.co/hexgrad/Kokoro-82M) first for inexpensive reproducible preset voices; Chatterbox (MIT publisher declaration, https://huggingface.co/ResembleAI/chatterbox) second if performance control is inadequate, using only authorized reference material. Piper voice licenses differ (https://github.com/OHF-Voice/piper1-gpl/blob/main/docs/LICENSING.md). No license clearance or subjective quality certification is claimed. Pin engine/model/voice hashes and capture voice-specific provenance/output terms before distributing. No external runtime service.

Audition the same Kernel directive, Kestrel log 17, pressure receiver discovery and Sinter class instruction across available candidates, plus Venn's engineering line for direct delivery. Preserve original transcript meaning, spell out UI controls and units for spoken reads only, keep pronunciation notes for Kestrel, Venn, Sinter, Aegis and profession/ability names. Separate clean mono PCM masters from delivery derivatives. Proposed target: -18 LUFS integrated for sufficiently long clips, -1 dBTP ceiling; for short clips use level matching and peak checks. Start with mono Opus 48–64 kb/s plus MP3 fallback only if compatibility testing requires it. Use channel-specific gentle EQ/compression; archived noise must not obscure instructions. Distinct opening/closing cues should be short and optional. Measure asset bytes, duration, clipping, loudness and decode success; auditory naturalness and intelligibility require listening, not numeric proxies.

## Next runtime increment

Approved asset map keyed by stable IDs; exact transcript, speaker/voice, asset hash, duration, rights, profile, priority, interruption, repeat policy and context. No remote or raw-message URL resolution. Add explicit audio MIME handling to server/index.js (currently no audio extensions); test GET/HEAD and range requests if seeking is supported. Keep same-origin CSP. Use one client playback owner and cancellation token; no overlap, stale callback, or automatic replay after character change. Maintain current field priority and bounded queue, mute/replay and transcript/log behavior. Add independent volume, actual amplitude using same-origin Web Audio or offline envelope, reduced motion and no repeated autoplay retry; no GPU requirement. Test missing/decode/autoplay/mute, reconnect, character switch, interruption, duplicate/queue and input/combat while active. No changes to gameplay state, rewards or trigger timing.

## Gate

No neural voice model or listening facility available in the current execution environment; FFmpeg and eSpeak exist, but eSpeak is not a suitable artistic substitute. No recordings generated, no casting accepted, no audio assets committed. Existing browser failures plus no listening/runtime verification block merge. Require actual audition clips and listening before broader production. This checkpoint is a data/event foundation only.
