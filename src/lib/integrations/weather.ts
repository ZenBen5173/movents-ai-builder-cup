import "server-only";

// Open-Meteo: free, no API key. Uses the university's coordinates; VENUE_LAT /
// VENUE_LON (or Kuala Lumpur) when it has none.
const FALLBACK = { lat: Number(process.env.VENUE_LAT ?? 3.139), lon: Number(process.env.VENUE_LON ?? 101.6869) };

export type WeatherNote = { mode: "forecast" | "history" | "unavailable"; note: string; rainChance?: number; source: string };

function shift(date: string, days: number) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export async function weatherFor(date: string, todayIso: string, at: { lat: number; lon: number } | null = null): Promise<WeatherNote> {
  const { lat: LAT, lon: LON } = at ?? FALLBACK;
  const daysAway = Math.round((Date.parse(date) - Date.parse(todayIso)) / 86_400_000);
  try {
    if (daysAway >= 0 && daysAway <= 15) {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}&daily=precipitation_probability_max,precipitation_sum&timezone=Asia%2FKuala_Lumpur&start_date=${date}&end_date=${date}`;
      const j = (await (await fetch(url, { signal: AbortSignal.timeout(8000) })).json()) as { daily: { precipitation_probability_max: number[]; precipitation_sum: number[] } };
      const p = j.daily.precipitation_probability_max[0];
      return { mode: "forecast", rainChance: p, note: `Forecast for ${date}: ${p}% chance of rain, ${j.daily.precipitation_sum[0]} mm expected.`, source: url };
    }
    const lastYear = shift(date, -365);
    const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${LAT}&longitude=${LON}&daily=precipitation_sum&timezone=Asia%2FKuala_Lumpur&start_date=${shift(lastYear, -3)}&end_date=${shift(lastYear, 3)}`;
    const j = (await (await fetch(url, { signal: AbortSignal.timeout(8000) })).json()) as { daily: { precipitation_sum: (number | null)[] } };
    const vals = j.daily.precipitation_sum.filter((v): v is number => v != null);
    const wet = vals.filter((v) => v >= 1).length;
    const total = Math.round(vals.reduce((a, b) => a + b, 0));
    return {
      mode: "history",
      rainChance: vals.length ? Math.round((wet / vals.length) * 100) : undefined,
      note: `Too far out for a forecast. Same week last year: rain on ${wet} of ${vals.length} days (${total} mm total).`,
      source: url,
    };
  } catch {
    return { mode: "unavailable", note: "Weather data unavailable, assume afternoon thunderstorms (inter-monsoon/NE monsoon season).", source: "open-meteo.com" };
  }
}
