# Cuaderno de Canciones

App para escribir canciones en español desde el iPhone: secciones, coros que se repiten sin copiar,
contador de sílabas, colores de rima, buscador de rimas sin internet, notas de voz y banco de ideas.
La app ayuda, pero **nunca escribe versos por ti**.

Tus letras, audios e ideas se guardan **solo en el teléfono** (IndexedDB). Este repositorio tiene
únicamente el código de la app: tus canciones nunca se suben a GitHub.

---

## Probar en el computador

```powershell
npm start
```

Abre <http://localhost:5173>. Para verla como iPhone en Edge o Chrome: F12 → ícono de celular → "iPhone 12 Pro".

Tests:

```powershell
npm test
```

## Publicar en GitHub Pages (la primera vez)

1. Guarda tus cambios en git:
   ```powershell
   git add .
   git commit -m "Etapa 6: exportar, respaldo y PWA"
   ```
2. Crea el repositorio en <https://github.com/new>:
   - Nombre: `cuaderno-de-canciones`
   - **Public** (GitHub Pages gratis necesita repositorio público; solo se ve el código, nunca tus letras).
   - No marques "Add a README" ni ".gitignore" (ya los tienes).
3. Conecta tu carpeta con GitHub (cambia `TU-USUARIO` por tu usuario):
   ```powershell
   git remote add origin https://github.com/TU-USUARIO/cuaderno-de-canciones.git
   git branch -M main
   git push -u origin main
   ```
   La primera vez se abre una ventana para iniciar sesión en GitHub.
4. En GitHub: **Settings → Pages → Build and deployment**
   - Source: **Deploy from a branch**
   - Branch: **main** y carpeta **/ (root)** → **Save**
5. En 1 o 2 minutos la app queda en `https://TU-USUARIO.github.io/cuaderno-de-canciones/`

## Instalar en el iPhone

1. Abre la dirección de arriba en **Safari** (tiene que ser Safari).
2. Toca **Compartir** (cuadrado con flecha) → **Agregar a pantalla de inicio** → **Agregar**.
3. Abre la app desde el ícono. La primera vez que grabes, acepta el permiso del micrófono.
4. Desde ahí funciona sin internet.

> Lo que escribas en Safari y en la app instalada se guarda por separado. Usa siempre el ícono.
> Si borras el ícono, se borran tus datos: haz respaldos en **Ajustes → Respaldo**.

## Publicar cambios después

1. Sube la versión en **dos** lugares (los tests revisan que coincidan):
   - `js/version.js` → `APP_VERSION = '1.0.1'`
   - `sw.js` → `VERSION = '1.0.1'`
2. Corre los tests y sube los cambios:
   ```powershell
   npm test
   git add .
   git commit -m "Describe el cambio"
   git push
   ```
3. Al abrir la app en el iPhone aparece **"Hay una versión nueva"** → **Actualizar**.

## Cómo está hecha

| Carpeta | Qué hay |
|---|---|
| `js/views/` | Pantallas: canciones, editor, rimas, ideas, ajustes, imprimir |
| `js/rhyme/` | Motor fonético (sílabas, acento, seseo…) y búsqueda de rimas |
| `js/audio/` | Grabar, reproducir, "Reproducir canción" e instrumentales (`deck.js`: voz + beat sincronizados) |
| `js/metrics.js` | Sílabas métricas y esquema de rima por estrofa |
| `js/backup.js` | Respaldo completo e importación |
| `data/rhyme-index.json` | Índice de rimas (se arma con `npm run build-index`) |
| `sw.js` | Guarda la app para usarla sin internet |
| `tools/` | Scripts: servidor local, índice de rimas, íconos |
| `tests/` | Tests (`npm test`) |

## Créditos

- Frecuencias de palabras: [FrequencyWords](https://github.com/hermitdave/FrequencyWords) de Hermit Dave (CC-BY-SA 4.0).
  El índice `data/rhyme-index.json` deriva de esa lista y se comparte con la misma licencia.
- Filtro de palabras: [an-array-of-spanish-words](https://github.com/words/an-array-of-spanish-words) de Titus Wormer (MIT).

Ideas para una versión 2: ver [ROADMAP.md](ROADMAP.md).
