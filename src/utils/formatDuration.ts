/**
 * Format a millisecond duration as m:ss or h:mm:ss.
 *
 * Examples:
 *   formatDuration(92000)     // "1:32"
 *   formatDuration(38000)     // "0:38"
 *   formatDuration(3670000)   // "1:01:10"
 *   formatDuration(undefined) // ""
 */
export function formatDuration(ms: number | undefined | null): string {
  if (ms == null || !Number.isFinite(ms) || ms < 0) return "";

  const totalSeconds = Math.floor(ms / 1000);
  const seconds = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const minutes = totalMinutes % 60;
  const hours = Math.floor(totalMinutes / 60);

  const pad = (n: number) => n.toString().padStart(2, "0");

  if (hours > 0) {
    return `${hours}:${pad(minutes)}:${pad(seconds)}`;
  }
  return `${minutes}:${pad(seconds)}`;
}
