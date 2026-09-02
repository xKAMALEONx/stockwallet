// US equities market-hours check (NYSE/NASDAQ regular session):
// Mon–Fri, 9:30 AM–4:00 PM America/New_York. DST handled by Intl.
// Note: does not account for market holidays (good enough for an at-a-glance badge).

export type MarketStatus = { open: boolean; label: string };

export function getMarketStatus(now: Date = new Date()): MarketStatus {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);

  const weekday = parts.find((p) => p.type === "weekday")?.value ?? "";
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");

  const isWeekday = !["Sat", "Sun"].includes(weekday);
  const minutesOfDay = (hour % 24) * 60 + minute;
  const OPEN = 9 * 60 + 30; // 9:30 ET
  const CLOSE = 16 * 60; // 16:00 ET

  const open = isWeekday && minutesOfDay >= OPEN && minutesOfDay < CLOSE;
  return { open, label: open ? "Market open" : "Market closed" };
}
