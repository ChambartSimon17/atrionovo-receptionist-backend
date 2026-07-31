// ======================================================
// Time Utilities
// ======================================================
//
// Responsibility
// Helper functions for converting and formatting time.
//
// Time is represented internally as the number of minutes
// after midnight.
//
// Examples
// 0    -> 00:00
// 570  -> 09:30
// 720  -> 12:00
// 1020 -> 17:00
// ======================================================

/**
 * Converts minutes after midnight to a HH:MM time string.
 *
 * @param {number} minutes
 * @returns {string}
 */
export function minutesToTime(minutes) {
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  return `${String(hours).padStart(2, "0")}:${String(
    remainingMinutes
  ).padStart(2, "0")}`;
}