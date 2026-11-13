// BIM Loading · Realidad aumentada en iPhone.
// Safari no muestra la franja de ajustes de la RA de Apple cuando el modelo es un archivo temporal (blob).
// La página guarda aquí el USDZ ajustado (escala y elevación) y lo pide con una dirección normal del
// sitio: modelos/<archivo>.usdz?ra-ajuste=N. Si por algo este servicio no responde, esa misma dirección
// entrega el archivo publicado, así que la RA siempre abre.
const CACHE = "blg-ra-ajustes";
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin || !url.searchParams.has("ra-ajuste")) return;
  e.respondWith(
    caches.open(CACHE)
      .then((c) => c.match(url.pathname + url.search))
      .then((r) => r || fetch(e.request))
  );
});
