// Cloudflare Worker för majaochfabian.se. Sidan (dist/) serveras som statiska filer; bara /api/* når hit.
import { handleOsa, handleExport } from "./osa.js";
import { handleFarjor } from "./farjor.js";

export default {
  async fetch(request, env, ctx) {
    const { pathname } = new URL(request.url);
    try {
      if (pathname === "/api/osa") return await handleOsa(request, env, ctx);
      if (pathname === "/api/osa.csv") return await handleExport(request, env);
      if (pathname === "/api/farjor") return await handleFarjor(request, env, ctx);
    } catch (e) {
      console.error(pathname, e);
      return new Response(JSON.stringify({ ok: false, fel: "Något gick fel hos oss. Försök igen om en stund." }), {
        status: 500,
        headers: { "Content-Type": "application/json; charset=utf-8" },
      });
    }
    if (pathname.startsWith("/api/")) return new Response("Finns inte.", { status: 404 });
    return env.ASSETS.fetch(request);
  },
};
