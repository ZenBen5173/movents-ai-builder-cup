import "server-only";

/**
 * Nano Banana (Gemini image model) — direct path for when the app itself
 * should render a creative. When an AI assistant has its own image model, it
 * generates the image and attaches it back over MCP instead.
 */
export function nanoBananaEnabled() {
  return Boolean(process.env.GEMINI_API_KEY);
}

const RATIO: Record<string, string> = { "1080x1350": "4:5", "1080x1080": "1:1", "1080x1920": "9:16", "1200x627": "16:9" };

export async function generateImage(prompt: string, width: number, height: number) {
  const model = process.env.GEMINI_IMAGE_MODEL ?? "gemini-2.5-flash-image";
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY! },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseModalities: ["IMAGE"], imageConfig: { aspectRatio: RATIO[`${width}x${height}`] ?? "1:1" } },
    }),
    signal: AbortSignal.timeout(90_000),
  });
  if (!res.ok) throw new Error(`Nano Banana ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const json = (await res.json()) as { candidates?: { content?: { parts?: { inlineData?: { mimeType: string; data: string } }[] } }[] };
  const part = json.candidates?.[0]?.content?.parts?.find((p) => p.inlineData);
  if (!part?.inlineData) throw new Error("Nano Banana returned no image");
  return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
}
