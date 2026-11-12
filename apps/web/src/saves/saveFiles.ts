import { SaveError, type SaveData } from '@tactics/engine';

/** Larger files are refused before reading. Real saves are far smaller. */
export const MAX_SAVE_FILE_BYTES = 8 * 1024 * 1024;

/** A descriptive file name such as `twinFords-day-4-2026-11-12.json`. */
export function saveFileName(save: SaveData): string {
  const date = save.savedAt.slice(0, 10);
  return `${save.map.id}-day-${save.state.day}${date === '' ? '' : `-${date}`}.json`;
}

/** Offers a save to the player as a downloaded JSON file. Returns the file name. */
export function downloadSave(save: SaveData): string {
  const name = saveFileName(save);
  const url = URL.createObjectURL(new Blob([JSON.stringify(save)], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  // The download has started by now; the delay only covers slower browsers.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return name;
}

/** Reads a file the player picked, refusing anything too large to be a save. */
export async function readSaveFile(file: File): Promise<string> {
  if (file.size > MAX_SAVE_FILE_BYTES) {
    const megabytes = (file.size / (1024 * 1024)).toFixed(1);
    throw new SaveError('malformed', `"${file.name}" is too large to be a save (${megabytes} MB).`);
  }
  return file.text();
}
