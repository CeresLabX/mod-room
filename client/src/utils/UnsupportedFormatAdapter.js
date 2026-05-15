/**
 * UnsupportedFormatAdapter — fallback for extensions we don't recognize.
 */

import { LIBOPENMPT_FORMATS, MODPLAYER_FORMATS, AHX_FORMATS } from './trackerFormats.js';

const SUPPORTED_LIST = [...MODPLAYER_FORMATS, ...LIBOPENMPT_FORMATS, ...AHX_FORMATS]
  .map(e => e.toUpperCase()).sort().join(', ');

export class UnsupportedFormatAdapter {
  constructor(audioContext) {
    this._audioContext = audioContext;
    this._disposed = false;
  }

  load(arrayBuffer, filename) {
    const ext = (filename || '').split('.').pop();
    return Promise.reject(
      new Error(
        `Unsupported tracker format: "${filename}" (.${ext}). ` +
        `Supported: ${SUPPORTED_LIST}. AHX/HVL are experimental and not yet available.`
      )
    );
  }

  playFrom() {
    return Promise.reject(new Error('No player loaded for this format'));
  }

  pause() {}
  stop() {}
  seek() {}
  getPositionSeconds() { return 0; }
  getDurationSeconds() { return null; }
  getMetadata() { return null; }
  setVolume() {}
  dispose() { this._disposed = true; }
}
