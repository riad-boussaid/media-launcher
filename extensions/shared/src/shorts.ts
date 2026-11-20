/** Label for a stored short-form video: Reel on Facebook/Instagram, Short elsewhere. */
export function shortFormLabel(url: string): string {
  return /\/reels?\//i.test(url) ? "Reel" : "Short";
}
