/**
 * UnsupportedFormatAdapter — fallback for extensions we don't recognize.
 */

export class UnsupportedFormatAdapter {
  constructor(audioContext) {
    this._audioContext = audioContext;
    this._disposed = false;
  }

  load(arrayBuffer, filename) {
    return Promise.reject(
      new Error(
        `Unsupported tracker format: "${filename}". ` +
        'Supported formats include: MOD, XM, IT, S3M, MPTM, MTM, MED, 669, DBM, STM, OKT, AMF, DMF, PSM, PTM, ULT. ' +
        'AHX/HVL are experimental and not yet available.'
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
