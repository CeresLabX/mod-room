/**
 * LibOpenMptPlayerAdapter — plays tracker files via chiptune3 (libopenmpt AudioWorklet).
 * Supports: mod, xm, it, s3m, mptm, mtm, med, 669, dbm, stm, okt, amf, dmf, psm, ptm, ult
 */

import { ChiptuneJsPlayer } from 'chiptune3';

export class LibOpenMptPlayerAdapter {
  /**
   * @param {AudioContext} audioContext
   */
  constructor(audioContext) {
    this._audioContext = audioContext;
    this._player = null;
    this._metadata = null;
    this._isPlaying = false;
    this._isPaused = false;
    this._volume = 1.0;
    this._duration = null;
    this._currentTime = 0;
    this._analyser = null;
    this._disposed = false;

    // Create analyser node
    this._analyser = audioContext.createAnalyser();
    this._analyser.fftSize = 128;
  }

  /**
   * Load a tracker file from an ArrayBuffer.
   * @param {ArrayBuffer} arrayBuffer
   * @param {string} filename
   * @returns {Promise<Object>} TrackerMetadata
   */
  load(arrayBuffer, filename) {
    return new Promise((resolve, reject) => {
      if (this._disposed) {
        reject(new Error('Adapter has been disposed'));
        return;
      }

      const ext = (filename || '').split('.').pop().toLowerCase();

      try {
        this._player = new ChiptuneJsPlayer({ context: this._audioContext });
      } catch (err) {
        reject(err);
        return;
      }

      // Set up analyser routing
      // The player's gain node is already created in constructor
      this._player.gain.connect(this._analyser);
      this._analyser.connect(this._audioContext.destination);

      let initialized = false;
      let metadataReceived = false;

      this._player.onInitialized(() => {
        initialized = true;
      });

      this._player.onMetadata((meta) => {
        this._metadata = {
          title: meta.title || filename || 'Unknown',
          format: (meta.type || ext || '?').toUpperCase(),
          extension: ext,
          channels: meta.channels || null,
          instruments: meta.instruments || null,
          samples: meta.samples || null,
          patterns: meta.patterns || null,
          durationSeconds: meta.dur || null,
          fileSizeBytes: arrayBuffer.byteLength,
          warnings: [],
        };
        this._duration = meta.dur || null;
        metadataReceived = true;

        if (initialized) {
          resolve(this._metadata);
        }
      });

      this._player.onEnded(() => {
        this._isPlaying = false;
        this._isPaused = false;
      });

      this._player.onError((err) => {
        if (!metadataReceived) {
          reject(new Error(`Failed to load tracker: ${err.type || 'unknown error'}`));
        }
      });

      this._player.onProgress((data) => {
        this._currentTime = data.pos || 0;
      });

      // Start playback with the ArrayBuffer
      // chiptune3's play() takes an ArrayBuffer
      try {
        this._player.play(arrayBuffer);
      } catch (err) {
        reject(err);
        return;
      }

      // If not initialized within 1s, resolve with partial metadata
      // (some files may not send metadata immediately)
      setTimeout(() => {
        if (!metadataReceived && !this._disposed) {
          this._metadata = {
            title: filename || 'Unknown',
            format: ext.toUpperCase(),
            extension: ext,
            channels: null,
            instruments: null,
            samples: null,
            patterns: null,
            durationSeconds: this._duration,
            fileSizeBytes: arrayBuffer.byteLength,
            warnings: ['Metadata not available from this file'],
          };
          resolve(this._metadata);
        }
      }, 1500);
    });
  }

  /**
   * Play from a specific position in seconds.
   * @param {number} seconds
   */
  playFrom(seconds) {
    return new Promise((resolve, reject) => {
      if (!this._player) {
        reject(new Error('No player loaded'));
        return;
      }
      try {
        // Pause first, then seek
        this._player.pause();
        this._player.seek(seconds);
        this._player.unpause();
        this._isPlaying = true;
        this._isPaused = false;
        resolve();
      } catch (err) {
        reject(err);
      }
    });
  }

  pause() {
    if (this._player) {
      this._player.pause();
      this._isPaused = true;
      this._isPlaying = false;
    }
  }

  stop() {
    if (this._player) {
      this._player.stop();
      this._isPlaying = false;
      this._isPaused = false;
      this._currentTime = 0;
    }
  }

  /**
   * Seek to a position in seconds.
   * @param {number} seconds
   */
  seek(seconds) {
    if (this._player) {
      this._player.seek(seconds);
      this._currentTime = seconds;
    }
  }

  getPositionSeconds() {
    return this._currentTime;
  }

  getDurationSeconds() {
    return this._duration;
  }

  getMetadata() {
    return this._metadata || null;
  }

  setVolume(volume) {
    this._volume = Math.max(0, Math.min(1, volume));
    if (this._player) {
      this._player.setVol(this._volume);
    }
  }

  getAnalyserNode() {
    return this._analyser;
  }

  dispose() {
    this._disposed = true;
    if (this._player) {
      try { this._player.stop(); } catch {}
      this._player = null;
    }
    if (this._analyser) {
      try { this._analyser.disconnect(); } catch {}
      this._analyser = null;
    }
    this._metadata = null;
    this._duration = null;
    this._currentTime = 0;
  }
}
