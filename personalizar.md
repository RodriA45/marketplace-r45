# Guía de Personalización 🎨 (Marketplace R45)

Este documento te explica cómo cambiar el aspecto visual (Frontend) del Marketplace R45 sin necesidad de saber programar cosas complejas. Es ideal tanto para ti (personal) como para alguien que haga un fork del proyecto (público).

## 1. Cambiar los Colores Principales

Todo el esquema de colores del sitio web está definido usando **Variables CSS**. Esto significa que cambiando un color en un solo lugar, toda la página web se actualizará.

1. Abre el archivo `styles.css`.
2. Ve a las primeras líneas (al bloque `:root { ... }`).
3. Verás algo como esto:
   ```css
   :root {
     --bg: #050505;
     --surface: #111;
     --accent: #ff5c2b; /* Color naranja principal */
     --accent2: #8a2be2;
     --text: #ffffff;
   }
   ```
4. Cambia el código hexadecimal (ej. `#ff5c2b`). 
   - Si quieres que tu marca sea azul brillante, cambia `--accent` por `#007bff`.
   - Guarda el archivo y refresca la página. ¡Listo!

## 2. Cambiar Tipografías (Fuentes)

La web usa "Syne" y "DM Sans" de Google Fonts.
1. En `index.html` (Línea 7-8), encontrarás el link a Google Fonts:
   ```html
   <link href="https://fonts.googleapis.com/css2?family=Syne...&family=DM+Sans..." rel="stylesheet">
   ```
2. Puedes buscar otra fuente en [Google Fonts](https://fonts.google.com/), copiar su link y pegarlo ahí.
3. Luego, en `styles.css` busca `--font-body` y `--font-heading` y escribe el nombre de tu nueva fuente:
   ```css
   --font-heading: 'Roboto', sans-serif;
   --font-body: 'Inter', sans-serif;
   ```

## 3. Cambiar el Logo y Nombre

El logo actualmente es solo texto estilizado en la esquina superior izquierda.
1. Abre `index.html`.
2. Busca la línea que dice:
   ```html
   <div class="logo">Marketplace <span>R45</span></div>
   ```
3. Puedes cambiar "Marketplace" por "TuMarca" y "R45" por "Store".
4. Si quieres usar una imagen real en vez de texto, bórralo y pon un tag de imagen:
   ```html
   <div class="logo"><img src="mi-logo.png" alt="Mi Logo" style="height: 40px;"></div>
   ```

## 4. Modificar las Categorías de Filtro

Si tu e-commerce vende cosas diferentes (por ejemplo, Autos y Repuestos), debes cambiarlo en dos lugares:

**Paso 1: En el HTML (Los botones visuales)**
En `index.html`, busca `<div class="filters" id="filters">` y cambia los nombres y emojis:
```html
  <button class="filter-btn active" data-cat="all">Todos</button>
  <button class="filter-btn" data-cat="Mecánica">🔧 Mecánica</button>
  <button class="filter-btn" data-cat="Accesorios">🏎️ Accesorios</button>
```

**Paso 2: En la IA (El Cerebro)**
Abre `backend/api/api.py`. Busca el endpoint `/ai-products` y actualiza el prompt de Gemini para que sepa qué categorías de productos inventar:
```python
# Cambiar esto:
cat_prompt = f"enfocándote en la categoría {category}" if category else "de categorías variadas (Electrónica, Moda, Hogar...)"
# Por esto:
cat_prompt = f"enfocándote en la categoría {category}" if category else "de categorías variadas (Mecánica, Accesorios de Autos)"
```

## 5. Cambiar los Impuestos Locales

Si el gobierno sube o baja los impuestos (o si usas el proyecto en otro país), cambia esto:
1. Abre `app.js` y busca `const TAX = { ... }`. Ajusta los porcentajes (0.21 = 21%).
2. Abre el backend `api/api.py` y busca `TAX = { ... }`. Asegúrate de que los valores coincidan con los de `app.js`.
3. El frontend y backend calcularán automáticamente la ganancia usando tus nuevos impuestos.
