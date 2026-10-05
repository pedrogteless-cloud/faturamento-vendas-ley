// Gera um PNG de tabela estilo Excel a partir de JSON (?d=<base64url>).
// O Telegram baixa a imagem por esta URL (sendPhoto) — a função não lê o banco
// nem guarda segredos: apenas desenha os números recebidos.
import { initWasm, Resvg } from "npm:@resvg/resvg-wasm@2.6.2";
import { tableSvg, type TableData } from "./table-svg.ts";

const CDN = "https://cdn.jsdelivr.net/npm";
let ready: Promise<Uint8Array[]> | null = null;

function load() {
  ready ??= (async () => {
    await initWasm(fetch(`${CDN}/@resvg/resvg-wasm@2.6.2/index_bg.wasm`));
    const fonts = await Promise.all(
      ["400Regular/Inter_400Regular.ttf", "700Bold/Inter_700Bold.ttf"].map(async (f) => {
        const r = await fetch(`${CDN}/@expo-google-fonts/inter@0.4.2/${f}`);
        return new Uint8Array(await r.arrayBuffer());
      }),
    );
    return fonts;
  })().catch((e) => {
    ready = null;
    throw e;
  });
  return ready;
}

function decode(b64url: string): TableData {
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
  const bytes = Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}

Deno.serve(async (req) => {
  try {
    const d = new URL(req.url).searchParams.get("d");
    if (!d || d.length > 8000) return new Response("parâmetro d ausente", { status: 400 });
    const data = decode(d);
    const fontBuffers = await load();
    const { svg } = tableSvg(data);
    const png = new Resvg(svg, {
      fitTo: { mode: "zoom", value: 2 },
      font: { fontBuffers, defaultFontFamily: "Inter", loadSystemFonts: false },
    })
      .render()
      .asPng();
    return new Response(png, {
      headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=86400" },
    });
  } catch (e) {
    return new Response(`erro: ${(e as Error).message}`, { status: 500 });
  }
});
