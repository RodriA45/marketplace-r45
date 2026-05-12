/* ═══════════════════════════════════════
   MARKETPLACE R45 — Módulo Productos
   Carga via Claude API + fallback estático
   ═══════════════════════════════════════ */

const Productos = (() => {

  const PROMPT = `Generá 16 productos trending para revender online en Argentina. 
Categorías: Electrónica, Moda, Hogar, Deportes, Belleza, Juguetes, Mascotas, Herramientas. Al menos 2 por categoría.

SOLO JSON puro sin backticks ni texto:
[{"id":1,"name":"nombre corto","category":"Electrónica","emoji":"📱","price_usd":25,"price_sell_ars":72000,"sales_month":2400,"rating":4.6,"trend":"🔥 HOT","seller":"AliExpress","seller_url":"https://aliexpress.com","vendor_type":"exterior","desc":"una oración por qué se vende bien en Argentina ahora"}]

Reglas estrictas:
- price_usd: precio real del proveedor en USD (5–180)
- price_sell_ars: precio sugerido reventa en pesos (vos le agregás margen)
- vendor_type: "exterior" para AliExpress/Amazon/Alibaba/Shein, "local" para MercadoLibre
- trend: "🔥 HOT" | "📈 SUBIENDO" | "⭐ NUEVO" | "💎 PREMIUM"
- seller: AliExpress | Shein | Alibaba | Amazon | MercadoLibre
- Productos reales, populares y con alta demanda en Argentina 2025`;

  const FALLBACK = [
    {id:1, name:"Auriculares TWS Noise Cancel",  category:"Electrónica", emoji:"🎧", price_usd:18, price_sell_ars:68000, sales_month:3200, rating:4.6, trend:"🔥 HOT",    seller:"AliExpress", seller_url:"https://aliexpress.com", vendor_type:"exterior", desc:"Cancelación de ruido real a precio accesible, los más vendidos del trimestre en electrónica."},
    {id:2, name:"Smartwatch Ultra Fitness",      category:"Electrónica", emoji:"⌚", price_usd:34, price_sell_ars:115000,sales_month:2100, rating:4.5, trend:"📈 SUBIENDO",seller:"AliExpress", seller_url:"https://aliexpress.com", vendor_type:"exterior", desc:"Monitor de salud completo, GPS y batería de 7 días, boom posverano."},
    {id:3, name:"Mini proyector 4K portátil",    category:"Electrónica", emoji:"📽️",price_usd:55, price_sell_ars:195000,sales_month:980,  rating:4.8, trend:"💎 PREMIUM",  seller:"AliExpress", seller_url:"https://aliexpress.com", vendor_type:"exterior", desc:"Proyector de bolsillo con batería incluida, favorito para regalos premium."},
    {id:4, name:"Cámara seguridad WiFi 4MP",     category:"Electrónica", emoji:"📷", price_usd:22, price_sell_ars:72000, sales_month:2800, rating:4.5, trend:"📈 SUBIENDO",seller:"AliExpress", seller_url:"https://aliexpress.com", vendor_type:"exterior", desc:"Alta demanda residencial, visión nocturna y app en celular."},
    {id:5, name:"Vestido lino resort 2025",       category:"Moda",        emoji:"👗", price_usd:11, price_sell_ars:36000, sales_month:4500, rating:4.4, trend:"🔥 HOT",    seller:"Shein",      seller_url:"https://shein.com",      vendor_type:"exterior", desc:"Tendencia fuerte en Instagram, restock constante y margen alto."},
    {id:6, name:"Zapatillas chunky dad-shoe",     category:"Moda",        emoji:"👟", price_usd:27, price_sell_ars:92000, sales_month:1800, rating:4.7, trend:"⭐ NUEVO",   seller:"AliExpress", seller_url:"https://aliexpress.com", vendor_type:"exterior", desc:"Viral en TikTok esta temporada, difícil de conseguir localmente."},
    {id:7, name:"Bolso cuero PU minimalista",     category:"Moda",        emoji:"👜", price_usd:14, price_sell_ars:48000, sales_month:2600, rating:4.5, trend:"📈 SUBIENDO",seller:"Shein",      seller_url:"https://shein.com",      vendor_type:"exterior", desc:"Estética minimal muy buscada, buena rotación en Instagram."},
    {id:8, name:"Lámpara LED RGB smart aro",      category:"Hogar",       emoji:"💡", price_usd:9,  price_sell_ars:32000, sales_month:5600, rating:4.3, trend:"🔥 HOT",    seller:"AliExpress", seller_url:"https://aliexpress.com", vendor_type:"exterior", desc:"Imprescindible para streamers y creadores de contenido, alta rotación."},
    {id:9, name:"Set sábanas microfibra 6 pzs",   category:"Hogar",       emoji:"🛏️", price_usd:14, price_sell_ars:46000, sales_month:3800, rating:4.5, trend:"📈 SUBIENDO",seller:"Alibaba",    seller_url:"https://alibaba.com",    vendor_type:"exterior", desc:"Alta rotación en ferias y ventas domiciliarias, clientes recurrentes."},
    {id:10,name:"Freidora de aire 4L digital",    category:"Hogar",       emoji:"🍟", price_usd:38, price_sell_ars:128000,sales_month:4200, rating:4.6, trend:"🔥 HOT",    seller:"AliExpress", seller_url:"https://aliexpress.com", vendor_type:"exterior", desc:"El electrodoméstico más buscado, escasez en mercado local."},
    {id:11,name:"Kettlebell vinilo 16kg",          category:"Deportes",    emoji:"🏋️", price_usd:21, price_sell_ars:68000, sales_month:2400, rating:4.6, trend:"📈 SUBIENDO",seller:"AliExpress", seller_url:"https://aliexpress.com", vendor_type:"exterior", desc:"Boom fitness enero-febrero, falta stock en gimnasios y dietéticas."},
    {id:12,name:"Colchoneta yoga 6mm antidesliz",  category:"Deportes",    emoji:"🧘", price_usd:12, price_sell_ars:38000, sales_month:3100, rating:4.4, trend:"📈 SUBIENDO",seller:"AliExpress", seller_url:"https://aliexpress.com", vendor_type:"exterior", desc:"Alta demanda post-año nuevo, complemento perfecto del boom yoga."},
    {id:13,name:"Suero vitamina C 30ml coreano",   category:"Belleza",     emoji:"✨", price_usd:7,  price_sell_ars:26000, sales_month:6200, rating:4.5, trend:"🔥 HOT",    seller:"AliExpress", seller_url:"https://aliexpress.com", vendor_type:"exterior", desc:"El skincare más vendido de la plataforma, recompra mensual constante."},
    {id:14,name:"Mascarilla capilar K-beauty",     category:"Belleza",     emoji:"💆", price_usd:6,  price_sell_ars:22000, sales_month:4100, rating:4.4, trend:"📈 SUBIENDO",seller:"AliExpress", seller_url:"https://aliexpress.com", vendor_type:"exterior", desc:"K-beauty viral con millones de views en TikTok, margen excelente."},
    {id:15,name:"Consola retro 10K juegos",        category:"Juguetes",    emoji:"🕹️", price_usd:19, price_sell_ars:64000, sales_month:3300, rating:4.3, trend:"🔥 HOT",    seller:"AliExpress", seller_url:"https://aliexpress.com", vendor_type:"exterior", desc:"10.000 juegos clásicos incluidos, regalo ideal para adultos nostalgia."},
    {id:16,name:"Cama ortopédica mascotas L",      category:"Mascotas",    emoji:"🐕", price_usd:15, price_sell_ars:50000, sales_month:2700, rating:4.7, trend:"📈 SUBIENDO",seller:"AliExpress", seller_url:"https://aliexpress.com", vendor_type:"exterior", desc:"Mercado mascotas en crecimiento acelerado, alta fidelidad de clientes."},
  ];

  async function cargar() {
    try {
      const resp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1400,
          messages: [{ role: 'user', content: PROMPT }]
        })
      });
      const data = await resp.json();
      const txt  = data.content[0].text.trim().replace(/```json|```/g, '');
      const parsed = JSON.parse(txt);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      throw new Error('respuesta invalida');
    } catch (e) {
      console.warn('API falló, usando fallback:', e.message);
      return FALLBACK;
    }
  }

  return { cargar, FALLBACK };
})();

window.Productos = Productos;
