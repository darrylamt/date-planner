import type { Itinerary, PlanInputs } from "./types";

/**
 * Added feature: "Add to calendar", builds an .ics file for the date so the
 * plan lands in Google/Apple Calendar with the full stop-by-stop rundown.
 */
export function buildIcs(inputs: PlanInputs, itinerary: Itinerary): string {
  const [y, m, d] = inputs.date.split("-").map(Number);
  const [hh, mm] = inputs.startTime.split(":").map(Number);
  const pad = (n: number) => String(n).padStart(2, "0");
  const dtStart = `${y}${pad(m)}${pad(d)}T${pad(hh)}${pad(mm)}00`;
  const endMins = hh * 60 + mm + inputs.hours * 60;
  const dtEnd = `${y}${pad(m)}${pad(d)}T${pad(Math.floor(endMins / 60) % 24)}${pad(endMins % 60)}00`;

  const agenda = itinerary.stops
    .map((s) => `${s.arrival_time}, ${s.name} (${s.area})`)
    .join("\\n");

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//aduro//date-planner//EN",
    "BEGIN:VEVENT",
    `UID:${Date.now()}@aduro`,
    `DTSTART;TZID=Africa/Accra:${dtStart}`,
    `DTEND;TZID=Africa/Accra:${dtEnd}`,
    `SUMMARY:${itinerary.title.replace(/,/g, "\\,")}`,
    `DESCRIPTION:${agenda}\\n\\nPlanned with aduro · est. GHS ${itinerary.est_total_ghs}`,
    `LOCATION:${itinerary.summary_route.replace(/,/g, "\\,")}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}

export function downloadIcs(inputs: PlanInputs, itinerary: Itinerary) {
  const blob = new Blob([buildIcs(inputs, itinerary)], { type: "text/calendar" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "aduro-date.ics";
  a.click();
  URL.revokeObjectURL(url);
}
