/**
 * getTrackerAdapter.js — Factory to get the right adapter for a tracker file.
 */

import { LibOpenMptPlayerAdapter } from './LibOpenMptPlayerAdapter.js';
import { AhxPlayerAdapter } from './AhxPlayerAdapter.js';
import { UnsupportedFormatAdapter } from './UnsupportedFormatAdapter.js';
import { getEngineForExtension } from './trackerFormats.js';

export const LIBOPENMPT_FORMATS = new Set([
  'mod', 'xm', 'it', 's3m', 'mptm', 'mtm', 'med', '669', 'dbm', 'stm', 'okt', 'amf', 'dmf', 'psm', 'ptm', 'ult',
]);

export const AHX_FORMATS = new Set(['ahx', 'hvl']);

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
