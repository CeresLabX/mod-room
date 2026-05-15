/**
 * getTrackerAdapter.js — Factory to get the right adapter for a tracker file.
 */

import { LibOpenMptPlayerAdapter } from './LibOpenMptPlayerAdapter.js';
import { AhxPlayerAdapter } from './AhxPlayerAdapter.js';
import { UnsupportedFormatAdapter } from './UnsupportedFormatAdapter.js';
import { getEngineForExtension, LIBOPENMPT_FORMATS, AHX_FORMATS } from './trackerFormats.js';

// Re-export for consumers that import from this module
export { LIBOPENMPT_FORMATS, AHX_FORMATS };

/**
 * Get an adapter instance for the given file, using the provided AudioContext.
 *
 * @param {string} filename - Full filename (e.g. "song.xm")
 * @param {AudioContext} audioContext
 * @returns {LibOpenMptPlayerAdapter | AhxPlayerAdapter | UnsupportedFormatAdapter}
 */
export function getAdapterForFile(filename, audioContext) {
  const ext = (filename || '').split('.').pop().toLowerCase();
  const engine = getEngineForExtension(ext);

  switch (engine) {
    case 'libopenmpt':
      return new LibOpenMptPlayerAdapter(audioContext);
    case 'ahx':
      return new AhxPlayerAdapter(audioContext);
    default:
      return new UnsupportedFormatAdapter(audioContext);
  }
}
