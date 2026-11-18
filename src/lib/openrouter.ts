import "server-only";
import { env } from "./env";

const BASE = "https://openrouter.ai/api/v1";

type Msg = { role: "system" | "user" | "assistant" | "tool"; content: unknown; tool_call_id?: string };

async function call(body: Record<string, unknown>) {
  const res = await fetch(`${BASE}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.openrouterKey()}`,
      "Content-Type": "application/json",
      "HTTP-Referer": env.siteUrl(),
      "X-Title": "Vibersey",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${(await res.text()).slice(0, 500)}`);
  return res.json();
}

// Ask the chat model for a forced tool call and return its parsed arguments.
export async function chatTool<T>(opts: {
  messages: Msg[];
  tool: { name: string; description: string; parameters: Record<string, unknown> };
  model?: string;
}): Promise<T> {
  const model = opts.model ?? env.chatModel();
  const base = { model, messages: opts.messages, tools: [{ type: "function", function: opts.tool }], max_tokens: 16000 };
  let data;
  try {
    data = await call({ ...base, tool_choice: { type: "function", function: { name: opts.tool.name } }, reasoning: { effort: "low" } });
  } catch (e) {
    // models that always think can't be forced to a tool; ask nicely instead
    if (!/tool_choice|thinking|reasoning/i.test(String(e))) throw e;
    data = await call({
      ...base,
      messages: [...opts.messages, { role: "system", content: `Respond only by calling the ${opts.tool.name} tool.` }],
      tool_choice: "auto",
      reasoning: { effort: "low" },
    });
  }
  const msg = data.choices?.[0]?.message;
  const args = msg?.tool_calls?.[0]?.function?.arguments;
  if (args) return JSON.parse(args) as T;
  // some providers return JSON in content instead of a tool call
  const text: string = typeof msg?.content === "string" ? msg.content : "";
  const m = text.match(/\{[\s\S]*\}/);
  if (m) return JSON.parse(m[0]) as T;
  throw new Error("Design model returned no tool call");
}

// Generate one image. Returns raw bytes and the mime type.
export async function generateImage(prompt: string, opts: { aspectRatio?: string; reference?: string } = {}) {
  const content: unknown[] = [{ type: "text", text: prompt }];
  if (opts.reference) content.push({ type: "image_url", image_url: { url: opts.reference } });
  const data = await call({
    model: env.imageModel(),
    messages: [{ role: "user", content }],
    modalities: ["image", "text"],
    image_config: opts.aspectRatio ? { aspect_ratio: opts.aspectRatio } : undefined,
  });
  const url: string | undefined = data.choices?.[0]?.message?.images?.[0]?.image_url?.url;
  if (!url) throw new Error("Image model returned no image");
  if (url.startsWith("data:")) {
    const [, mime, b64] = url.match(/^data:([^;]+);base64,(.*)$/) ?? [];
    return { bytes: Buffer.from(b64, "base64"), mime: mime ?? "image/png" };
  }
  const r = await fetch(url);
  return { bytes: Buffer.from(await r.arrayBuffer()), mime: r.headers.get("content-type") ?? "image/png" };
}
