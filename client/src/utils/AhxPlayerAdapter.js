/**
 * AhxPlayerAdapter — placeholder for AHX/HVL format playback.
 * AHX synthesis is not yet supported via chiptune3 — these formats
 * use mathematical synthesis (oscillators + envelopes) rather than samples.
 */

export class AhxPlayerAdapter {
  constructor(audioContext) {
    this._audioContext = audioContext;
    this._disposed = false;
    this._metadata = null;
    this._isPlaying = false;
    this._isPaused = false;
    this._currentTime = 0;
    this._duration = null;
    this._volume = 1.0;
  }

  load(arrayBuffer, filename) {
    return new Promise((resolve) => {
      const ext = (filename || '').split('.').pop().toLowerCase();
      this._metadata = {
        title: filename || 'Unknown',
        format: ext.toUpperCase(),
        extension: ext,
        channels: null,
        instruments: null,
        samples: null,
        patterns: null,
        durationSeconds: null,
        fileSizeBytes: arrayBuffer ? arrayBuffer.byteLength : null,
        warnings: [
          'AHX/HVL playback is experimental and not yet available.',
          'These formats use pure mathematical synthesis — no samples.',
          'Consider converting to XM or IT for wider compatibility.',
        ],
      };
      this._duration = null;
      resolve(this._metadata);
    });
  }

  playFrom(seconds) {
    return Promise.reject(
      new Error('AHX playback not yet available — this format is experimental')
    );
  }

  pause() {
    this._isPaused = true;
    this._isPlaying = false;
  }

  stop() {
    this._isPlaying = false;
    this._isPaused = false;
    this._currentTime = 0;
  }

  seek(seconds) {
    this._currentTime = seconds;
  }

  getPositionSeconds() {
    return this._currentTime;
  }

  getDurationSeconds() {
    return this._duration;
  }

  getMetadata() {
    return this._metadata;
  }

  setVolume(volume) {
    this._volume = Math.max(0, Math.min(1, volume));
  }

  dispose() {
    this._disposed = true;
    this._metadata = null;
  }
}
