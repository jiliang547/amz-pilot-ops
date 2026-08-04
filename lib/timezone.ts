const MARKETPLACE_TIMEZONES: Record<string, string> = { US: "America/Los_Angeles", CA: "America/Toronto", MX: "America/Mexico_City", UK: "Europe/London", DE: "Europe/Berlin", FR: "Europe/Paris", IT: "Europe/Rome", ES: "Europe/Madrid", JP: "Asia/Tokyo", AU: "Australia/Sydney", SG: "Asia/Singapore" };

export function effectiveTimezone(row: Record<string, unknown> | { timezone?: string; marketplace?: string; region?: string }) {
  const timezone = String(row.timezone ?? "").trim();
  if (timezone && timezone !== "UTC" && timezone !== "Etc/UTC") return timezone;
  const marketplace = String(row.marketplace ?? "").toUpperCase();
  return MARKETPLACE_TIMEZONES[marketplace] ?? (String(row.region ?? "").toLowerCase() === "eu" ? "Europe/London" : timezone || "UTC");
}
