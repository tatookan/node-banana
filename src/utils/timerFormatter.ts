/**
 * Timer formatting utilities for generation nodes
 */

/**
 * Format seconds into human-readable time string
 * @param seconds - Total seconds to format
 * @returns Formatted time string (e.g., "1:23", "1:05:30")
 */
export function formatElapsedTime(seconds: number): string {
  if (seconds < 0) return "0:00";

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${minutes}:${String(secs).padStart(2, '0')}`;
}
