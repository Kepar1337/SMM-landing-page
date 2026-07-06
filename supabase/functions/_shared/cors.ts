// CORS-заголовки на випадок, якщо лендінг викликатиме функції через fetch
// з іншого домену. Для звичайного переходу за посиланням (кнопка «Купити»)
// CORS не потрібен.

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

export function corsPreflight(req: Request): Response | null {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  return null;
}
