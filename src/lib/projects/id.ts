/** First 4 letters of company name (letters only), padded with X. */
export function projectIdPrefix(companyName: string): string {
  const letters = companyName.replace(/[^a-zA-Z]/g, "").toUpperCase();
  return (letters.slice(0, 4) || "PROJ").padEnd(4, "X");
}

/** e.g. ACME + 4829 → ACME4829 */
export function buildProjectId(companyName: string): string {
  const suffix = String(Math.floor(Math.random() * 10000)).padStart(4, "0");
  return `${projectIdPrefix(companyName)}${suffix}`;
}
