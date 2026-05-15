/**
 * trackerFormats.js — Definitions for all supported tracker music formats.
 */

export const FORMAT_DATA = [
  {
    extension: 'mod',
    name: 'ProTracker / SoundTracker Module',
    description: 'The original tracker format, created on the Amiga. Defines sample data, pattern sequences, and instrument assignments for 4-channel playback.',
    whyItMatters: [
      'Birthplace of tracked music — the format that started it all',
      'Classic sound of late-80s/early-90s demo scene and video games',
      '4-channel polyphonony produces that iconic "Amiga crunch"',
    ],
    whyForMusic: 'Many MOD files contain incredibly catchy, well-composed chiptune tracks from legendary demo groups like Faible, Scoop, Unique, and others.',
    references: [
      { label: 'ModArchive — 100k+ MOD files', url: 'https://modarchive.org/' },
      { label: 'ProTracker on Wikipedia', url: 'https://en.wikipedia.org/wiki/ProTracker' },
    ],
    isExperimental: false,
    engine: 'modplayer',
  },
  {
    extension: 'xm',
    name: 'FastTracker II Extended Module',
    description: 'Extended Module format from FastTracker 2. Supports many channels (up to 32), wavetable instruments, and advanced effects. Became the de facto standard for 90s tracker music.',
    whyItMatters: [
      'Most popular format of the "golden age" of tracker music',
      '32 channels enabled richer compositions than MOD ever could',
      'Wavetable instruments brought near-sample-quality sounds',
    ],
    whyForMusic: 'XM files from FastTracker 2 are a huge part of tracker music culture — from demo scene anthems to game soundtracks.',
    references: [
      { label: 'FT2 on Wikipedia', url: 'https://en.wikipedia.org/wiki/FastTracker_2' },
      { label: 'XM files on ModArchive', url: 'https://modarchive.org/' },
    ],
    isExperimental: false,
    engine: 'libopenmpt',
  },
  {
    extension: 'it',
    name: 'Impulse Tracker Module',
    description: 'Format from Impulse Tracker. Supports 64 channels, VBL effects, macro-based instruments, and high-quality mixing. Favorite of serious composers for its flexibility.',
    whyItMatters: [
      '64 channels — essentially unlimited for most compositions',
      'VBL (Vertical Beat Length) effects for smoother playback',
      'Macro system enables expressive, sample-like instruments',
    ],
    whyForMusic: 'IT files often push the boundaries of what tracker music can sound like, with complex arrangements and expressive instruments.',
    references: [
      { label: 'Impulse Tracker on Wikipedia', url: 'https://en.wikipedia.org/wiki/Impulse_Tracker' },
      { label: 'OpenMPT — IT format reference', url: 'https://wiki.openmpt.org/' },
    ],
    isExperimental: false,
    engine: 'libopenmpt',
  },
  {
    extension: 's3m',
    name: 'Scream Tracker 3 Module',
    description: 'Format from Scream Tracker 3. Known for its aggressive, high-energy sound. Supported 32 channels and digital samples — popular in the early 90s demo scene.',
    whyItMatters: [
      'Represented a leap in sound quality for tracker formats',
      '32 channels bridged the gap between MOD and XM',
      'Pioneered Adlib/Sound Blaster FM instrument support',
    ],
    whyForMusic: 'S3M files capture the raw energy of early 90s electronic music and demo scene productions.',
    references: [
      { label: 'Scream Tracker on Wikipedia', url: 'https://en.wikipedia.org/wiki/Scream_Tracker' },
    ],
    isExperimental: false,
    engine: 'libopenmpt',
  },
  {
    extension: 'ahx',
    name: 'AHX / HivelyTracker Synth Module',
    description: 'Synthesizer-based format that generates all sounds from pure math — no samples required. Created for the Amiga, AHX produces distinctive, electronic tones using oscillator combinations.',
    whyItMatters: [
      'Sample-free synthesis enables tiny file sizes with huge musical variety',
      'Pure mathematical sound generation is a unique approach to music',
      'AHX/HVL files can sound remarkably complex from tiny filesizes',
    ],
    whyForMusic: 'AHX and HVL files represent a unique branch of tracker music where sound is synthesized rather than sampled.',
    references: [
      { label: 'HivelyTracker', url: 'https://hivelytracker.co.uk/' },
      { label: 'AHX on ModArchive', url: 'https://modarchive.org/' },
    ],
    isExperimental: true,
    engine: 'ahx',
  },
  {
    extension: 'mptm',
    name: 'OpenMPT Module',
    description: 'OpenMPT\'s native format, supporting all tracker features including VSTi instruments, scripts, and the most advanced effect set of any tracker format.',
    whyItMatters: [
      'Most feature-complete tracker format ever created',
      'VSTi instrument support brings professional music production to trackers',
      'Active development — still evolving with new features',
    ],
    whyForMusic: 'MPT files pushed tracker music into the realm of full professional music production.',
    references: [
      { label: 'OpenMPT', url: 'https://openmpt.org/' },
      { label: 'MPT format documentation', url: 'https://wiki.openmpt.org/' },
    ],
    isExperimental: false,
    engine: 'libopenmpt',
  },
  {
    extension: 'mtm',
    name: 'MultiTracker Module',
    description: 'Format from MultiTracker, an early Windows tracker. Supported 32 channels and was one of the first trackers to run natively on Windows.',
    whyItMatters: [
      'Part of the early Windows tracker era',
      '32-channel compositions with digital samples',
      'Historical significance in the evolution of tracker software',
    ],
    whyForMusic: 'MTM files represent an interesting transitional era between Amiga-native formats and the Windows tracker boom.',
    references: [
      { label: 'MTM on ModArchive', url: 'https://modarchive.org/' },
    ],
    isExperimental: false,
    engine: 'libopenmpt',
  },
  {
    extension: 'med',
    name: 'MED / OctaMED Module',
    description: 'Multi-channel format from the Amiga\'s MED/OctaMED tracker. Supported up to 32 channels in later versions and was used extensively for music on Amiga games and demos.',
    whyItMatters: [
      'Up to 32 channels on Amiga — a huge leap from 4-channel MOD',
      'Used professionally in Amiga game and demo production',
      'Advanced sequencing features beyond basic MOD',
    ],
    whyForMusic: 'MED files were used in many commercial Amiga games, meaning polished, professional compositions.',
    references: [
      { label: 'MED on ModArchive', url: 'https://modarchive.org/' },
      { label: 'OctaMED on Wikipedia', url: 'https://en.wikipedia.org/wiki/OctaMED' },
    ],
    isExperimental: false,
    engine: 'libopenmpt',
  },
  {
    extension: '669',
    name: 'Composer 669 Module',
    description: 'Format from the Composer 669 tracker on the Atari ST. Notable for its unique 64-row pattern structure and 8-channel limitation.',
    whyItMatters: [
      'Represents the Atari ST tracker scene',
      'Unusual 64-row patterns differ from the standard 64-row MOD approach',
      'Distinctive, slightly unusual sound character',
    ],
    whyForMusic: '669 files are relatively rare and offer a distinctive, vintage electronic sound from the Atari era.',
    references: [
      { label: '669 on ModArchive', url: 'https://modarchive.org/' },
    ],
    isExperimental: false,
    engine: 'libopenmpt',
  },
  {
    extension: 'dbm',
    name: 'DigiBooster Module',
    description: 'Format from DigiBooster, an Amiga tracker known for high-quality mixing and support for 32 channels with digital samples.',
    whyItMatters: [
      'High-quality mixing engine for its time',
      '32 channels of digital audio',
      'Part of the late-era Amiga tracker scene',
    ],
    whyForMusic: 'DBM files capture the polished end of Amiga tracker music production.',
    references: [
      { label: 'DigiBooster on ModArchive', url: 'https://modarchive.org/' },
    ],
    isExperimental: false,
    engine: 'libopenmpt',
  },
  {
    extension: 'stm',
    name: 'Scream Tracker 2 Module',
    description: 'Format from Scream Tracker 2, predecessor to S3M. Limited to 32 channels and digital samples, it was an early Windows/DOS tracker format.',
    whyItMatters: [
      'Early PC tracker era format',
      '32 channels with digital samples',
      'Historical link between DOS trackers and the later S3M format',
    ],
    whyForMusic: 'STM files represent the early days of PC-based tracker music.',
    references: [
      { label: 'STM on ModArchive', url: 'https://modarchive.org/' },
    ],
    isExperimental: false,
    engine: 'libopenmpt',
  },
  {
    extension: 'okt',
    name: 'Oktalyzer Module',
    description: 'Format from the Oktalyzer tracker on the Atari ST. Known for its OKT pattern format and 8-channel limitation, it has a distinctive sound.',
    whyItMatters: [
      'Atari ST tracker with unique pattern architecture',
      '8 channels with digital samples',
      'Part of the vibrant Atari ST tracker scene',
    ],
    whyForMusic: 'OKT files have a characteristically "Atari" sound that\'s distinct from Amiga-derived formats.',
    references: [
      { label: 'OKT on ModArchive', url: 'https://modarchive.org/' },
    ],
    isExperimental: false,
    engine: 'libopenmpt',
  },
  {
    extension: 'amf',
    name: 'Advanced Module Format',
    description: 'Format from the AMS (Advanced Music System) tracker. Supported various channel counts and was used for game music due to its compact size.',
    whyItMatters: [
      'Used in game development for compact music storage',
      'Various channel configurations supported',
      'Part of the game audio tracker ecosystem',
    ],
    whyForMusic: 'AMF files often contain well-crafted game music compositions.',
    references: [
      { label: 'AMF on ModArchive', url: 'https://modarchive.org/' },
    ],
    isExperimental: false,
    engine: 'libopenmpt',
  },
  {
    extension: 'dmf',
    name: 'Delusion / X-Tracker Music File',
    description: 'Format from Delusion Tracker (also known as X-Tracker). Supported 32 channels and was notable among DOS trackers for its advanced features.',
    whyItMatters: [
      'Part of the DOS tracker evolution',
      '32 channels with advanced features',
      'Shows how tracker software evolved on PC',
    ],
    whyForMusic: 'DMF files represent the advanced end of DOS-era tracker production.',
    references: [
      { label: 'DMF on ModArchive', url: 'https://modarchive.org/' },
    ],
    isExperimental: false,
    engine: 'libopenmpt',
  },
  {
    extension: 'psm',
    name: 'ProTracker Studio / Epic MegaGames Module',
    description: 'Format from ProTracker Studio. Used by Epic MegaGames for game soundtracks. Notable for its cross-platform ambitions and polished composition tools.',
    whyItMatters: [
      'Used by Epic MegaGames for commercial game soundtracks',
      'Cross-platform ambitions made it notable',
      'Professional polish in commercial game music',
    ],
    whyForMusic: 'PSM files from Epic MegaGames contain high-quality game music compositions.',
    references: [
      { label: 'PSM on ModArchive', url: 'https://modarchive.org/' },
    ],
    isExperimental: false,
    engine: 'libopenmpt',
  },
  {
    extension: 'ptm',
    name: 'Poly Tracker Module',
    description: 'Format from Poly Tracker, a DOS tracker. Supported 32 channels and was known for its professional-quality output.',
    whyItMatters: [
      'Professional DOS tracker format',
      '32 channels with digital samples',
      'Used for quality game music production',
    ],
    whyForMusic: 'PTM files represent polished DOS-era tracker compositions.',
    references: [
      { label: 'PTM on ModArchive', url: 'https://modarchive.org/' },
    ],
    isExperimental: false,
    engine: 'libopenmpt',
  },
  {
    extension: 'ult',
    name: 'UltraTracker Module',
    description: 'Format from UltraTracker, a DOS tracker. Supported 32 channels and was part of the competitive DOS tracker scene in the mid-90s.',
    whyItMatters: [
      'Part of the mid-90s DOS tracker scene',
      '32 channels with digital samples',
      'Contributed to the diversity of DOS tracker formats',
    ],
    whyForMusic: 'ULT files contain tracker music from the competitive mid-90s DOS era.',
    references: [
      { label: 'ULT on ModArchive', url: 'https://modarchive.org/' },
    ],
    isExperimental: false,
    engine: 'libopenmpt',
  },
  {
    extension: 'digi',
    name: 'DigiBooster Module',
    description: 'Format from DigiBooster, an Amiga tracker known for high-quality mixing and 32-channel support with digital samples.',
    whyItMatters: [
      'High-quality Amiga tracker format',
      '32 channels of digital audio',
    ],
    whyForMusic: 'DigiBooster modules are known for their rich, layered sound.',
    references: [
      { label: 'DigiBooster on ModArchive', url: 'https://modarchive.org/' },
    ],
    isExperimental: false,
    engine: 'libopenmpt',
  },
  {
    extension: 'gdm',
    name: 'General Digital Music',
    description: 'General Digital Music format — a versatile tracker format used by various DOS trackers.',
    whyItMatters: [
      'Flexible multi-format tracker',
      'Supports digital samples and standard tracker features',
    ],
    whyForMusic: 'GDM files represent a broad range of late-90s DOS tracker compositions.',
    references: [
      { label: 'GDM on ModArchive', url: 'https://modarchive.org/' },
    ],
    isExperimental: false,
    engine: 'libopenmpt',
  },
  {
    extension: 'imf',
    name: 'Imago Orpheus Module',
    description: 'Format from Imago Orpheus, a DOS tracker that supported 32 channels and digital samples.',
    whyItMatters: [
      'DOS-era tracker with 32-channel support',
      'Part of the competitive mid-90s tracker scene',
    ],
    whyForMusic: 'IMF files capture the creative output of the DOS tracker community.',
    references: [
      { label: 'IMF on ModArchive', url: 'https://modarchive.org/' },
    ],
    isExperimental: false,
    engine: 'libopenmpt',
  },
  {
    extension: 'j2b',
    name: 'FamiTracker Backup',
    description: 'FamiTracker is a popular modern tracker for NES/GameBoy music. .j2b is its project backup format.',
    whyItMatters: [
      'Modern chiptune tracker format',
      'NES and GameBoy sound hardware emulation',
    ],
    whyForMusic: 'J2B files preserve FamiTracker projects — not a libopenmpt-supported format.',
    references: [
      { label: 'FamiTracker', url: 'https://famitracker.com/' },
    ],
    isExperimental: true,
    engine: 'unsupported',
  },
  {
    extension: 'ams',
    name: 'AMS Module',
    description: 'Advanced Music System format — an early Windows tracker format.',
    whyItMatters: ['Early Windows tracker format', 'Part of the late-90s tracker evolution'],
    whyForMusic: 'AMS modules capture music from the early Windows tracker era.',
    references: [{ label: 'AMS on ModArchive', url: 'https://modarchive.org/' }],
    isExperimental: false,
    engine: 'libopenmpt',
  },
  {
    extension: 'dsm',
    name: 'DSynth Module',
    description: 'Format from the DSynth tracker — a Windows tracker supporting digital samples.',
    whyItMatters: ['Windows tracker format', 'Part of the early NT-era tracker tools'],
    whyForMusic: 'DSMs preserve music from early Windows tracker composers.',
    references: [{ label: 'DSM on ModArchive', url: 'https://modarchive.org/' }],
    isExperimental: false,
    engine: 'libopenmpt',
  },
  {
    extension: 'far',
    name: 'Farandole Tracker',
    description: 'Format from Farandole Composer, a Windows tracker popular in the late 90s.',
    whyItMatters: ['Well-regarded Windows tracker', 'Supported 32 channels'],
    whyForMusic: 'FAR modules are known for their creative compositions from the late 90s.',
    references: [{ label: 'FAR on ModArchive', url: 'https://modarchive.org/' }],
    isExperimental: false,
    engine: 'libopenmpt',
  },
  {
    extension: 'mdl',
    name: 'MDL Module',
    description: 'Digitrakker format — a popular DOS tracker format supporting digital samples.',
    whyItMatters: ['Early DOS tracker with digital sample support', 'Part of the pre-AIFF DOS era'],
    whyForMusic: 'MDL files contain early examples of digital audio in trackers.',
    references: [{ label: 'MDL on ModArchive', url: 'https://modarchive.org/' }],
    isExperimental: false,
    engine: 'libopenmpt',
  },
  {
    extension: 'umx',
    name: 'Unreal Music Package',
    description: 'Music format used by Unreal Engine 1 games. Based on standard tracker formats.',
    whyItMatters: ['Game music format from Unreal Engine 1', 'Contains notable game soundtracks'],
    whyForMusic: 'UMX files often contain full-length compositions from classic Unreal Engine games.',
    references: [
      { label: 'UMX on ModArchive', url: 'https://modarchive.org/' },
      { label: 'Unreal Engine documentation', url: 'https://docs.unrealengine.com/' },
    ],
    isExperimental: false,
    engine: 'libopenmpt',
  },
];

export const LIBOPENMPT_FORMATS = new Set([
  'mod', 'xm', 'it', 's3m', 'mptm', 'mtm', 'med', '669', 'dbm', 'stm', 'okt', 'amf', 'dmf', 'psm', 'ptm', 'ult',
  'ams', 'dsm', 'far', 'mdl', 'umx', 'gdm', 'imf', 'digi',
]);

export const EXPERIMENTAL_FORMATS = new Set(['j2b']);

export const AHX_FORMATS = new Set(['ahx', 'hvl']);

export const MODPLAYER_FORMATS = new Set(['mod']);

export const ALL_TRACKER_EXTENSIONS = new Set([
  ...LIBOPENMPT_FORMATS,
  ...AHX_FORMATS,
  ...MODPLAYER_FORMATS,
]);

/**
 * Get the engine/adapter type for a given file extension.
 * @param {string} ext - Lowercase file extension (without dot)
 * @returns {'libopenmpt' | 'ahx' | 'modplayer' | 'unsupported'}
 */
export function getEngineForExtension(ext) {
  const e = ext.toLowerCase();
  if (MODPLAYER_FORMATS.has(e)) return 'modplayer';
  if (LIBOPENMPT_FORMATS.has(e)) return 'libopenmpt';
  if (AHX_FORMATS.has(e)) return 'ahx';
  return 'unsupported';
}

export function getFormatByExtension(ext) {
  return FORMAT_DATA.find(f => f.extension === ext.toLowerCase()) || null;
}
