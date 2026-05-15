// Visualizer registry — all available visualizers
// Each entry: { id, name, description, Component }

export const VISUALIZER_NONE = 'none';

export const registry = [
  {
    id: 'spectrum',
    name: 'Spectrum Bars',
    description: 'Classic tracker-style vertical frequency bars',
    category: 'bars',
  },
  {
    id: 'scope',
    name: 'Oscilloscope',
    description: 'Retro waveform scope like old audio test equipment',
    category: 'waveform',
  },
  {
    id: 'tracker',
    name: 'Tracker Meters',
    description: '8-channel MOD tracker-style level meters',
    category: 'meters',
  },
  {
    id: 'starfield',
    name: 'Starfield Pulse',
    description: 'DOS demo-scene starfield that pulses with bass',
    category: 'scene',
  },
  {
    id: 'vu-meters',
    name: 'VU Meter Deck',
    description: 'Left/right retro stereo VU meters like old hi-fi gear',
    category: 'meters',
  },
  {
    id: 'neon-tunnel',
    name: 'Neon Tunnel',
    description: 'Retro 3D wireframe tunnel reacting to beat and volume',
    category: '3d',
  },
  {
    id: 'plasma',
    name: 'Plasma Field',
    description: 'Old-school Amiga demo-scene plasma effect',
    category: 'scene',
  },
  {
    id: 'pixel-eq',
    name: 'Pixel Equalizer',
    description: 'Chunky DOS/VGA-style block equalizer',
    category: 'bars',
  },
  {
    id: 'piano-roll',
    name: 'Piano Roll',
    description: 'Retro MIDI-style piano roll with falling note blocks',
    category: 'scene',
  },
  {
    id: 'matrix-rain',
    name: 'Matrix Rain',
    description: 'Falling green characters, tracker symbols, numbers',
    category: 'scene',
  },
];

export default registry;
