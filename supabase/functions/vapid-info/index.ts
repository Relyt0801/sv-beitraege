// Gibt den öffentlichen VAPID-Schlüssel des Servers heraus.
//
// Warum: Der Schlüssel in der App (Vercel, .env) und der auf dem Server
// müssen zueinander passen. Holt die App ihn hier ab, können sie gar nicht
// mehr auseinanderlaufen. Der öffentliche Schlüssel ist nicht geheim, er
// steckt ohnehin in der ausgelieferten App. Der private bleibt auf dem Server.

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

Deno.serve((req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const oeffentlich = Deno.env.get("VAPID_PUBLIC_KEY") ?? null;
  return new Response(
    JSON.stringify({
      public_key: oeffentlich,
      bereit: Boolean(oeffentlich && Deno.env.get("VAPID_PRIVATE_KEY")),
    }),
    { headers: { ...cors, "content-type": "application/json" } },
  );
});
