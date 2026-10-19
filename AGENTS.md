# AGENTS.md

Guía para agentes de IA (y personas) que trabajan en este repositorio.
Léela antes de tocar código. Si algo aquí contradice al código, gana el código:
actualiza este archivo cuando cambies una convención.

## Qué es este proyecto

**contlana** es una app móvil-first de finanzas personales para México. Permite
registrar ingresos/gastos, escanear tickets con IA (OCR + clasificación), ver
hábitos de consumo por categoría, exportar datos y **planear un presupuesto
mensual** (gastos planeados) comparándolo con los gastos reales.

Interfaz y copy en **español (es-MX)**. Las rutas también están en español.

## Stack

| Área          | Tecnología                                                                  |
| ------------- | --------------------------------------------------------------------------- |
| Framework     | SvelteKit 2 + Svelte 5 (**runes forzados**, sin `export let`/stores legacy) |
| Build         | Vite 8, adaptador `@sveltejs/adapter-vercel`                                |
| Estilos       | Tailwind CSS v4 (vía `@theme` + variables CSS propias)                      |
| Base de datos | MongoDB (driver oficial, **sin ORM**)                                       |
| Auth          | `better-auth` (email/password + Google), adaptador MongoDB                  |
| Validación    | Zod (en `src/lib/validation/schemas.js` y en cada API route)                |
| IA de tickets | OpenRouter (`src/lib/server/ai/openrouter.js`) con fallbacks free           |
| Lenguaje      | JavaScript + JSDoc (`checkJs: false`, **no hay TypeScript**)                |
| Tests         | `node:test` (`node --test`)                                                 |
| Paquete       | pnpm (`pnpm-lock.yaml`, `engine-strict=true`); npm también funciona         |

No hay paso de type-check (`checkJs` está apagado y no hay `svelte-check`).
La verificación de que compila es `pnpm build` (Vite compila Svelte y luego corre
el adaptador).

## Comandos

```sh
pnpm dev        # servidor de desarrollo
pnpm build      # build de producción (compila Svelte + adaptador Vercel)
pnpm preview    # previsualizar el build
pnpm test       # node --test (lista explícita de archivos en package.json)
pnpm lint       # prettier --check . && eslint .
pnpm format     # prettier --write .
pnpm prepare    # svelte-kit sync (se corre solo en install)
```

> **Importante — agregar tests:** el script `test` de `package.json` lista los
> archivos de prueba **explícitamente**. Si creas `tests/foo.test.js`, agrégalo
> a mano a ese script o nunca se ejecutará en CI.

> **Nota Windows:** `pnpm build` puede fallar al final con `EPERM ... symlink`
> dentro de `.vercel/`. Eso es del adaptador de Vercel creando symlinks en
> Windows, no de tu código: si Vite terminó con `✓ built`, la app compiló bien.

## Variables de entorno

Copia `.env.example` a `.env` y rellena los valores (`.env` está en `.gitignore`).

- `ORIGIN`, `PROD_ORIGIN`, `BETTER_AUTH_SECRET`
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
- `MONGODB_URI`, `MONGODB_DATABASE`
- IA: `OPENROUTER_API_KEY`, `OPENROUTER_MODEL`, `OPENROUTER_FALLBACK_MODEL`,
  `OPENROUTER_REASONING_EFFORT`, `OPENROUTER_APP_URL`, `OPENROUTER_APP_TITLE`,
  `OPENROUTER_TIMEOUT_MS`, y opcional `ANTHROPIC_API_KEY`.

## Estructura

```
src/
  app.d.ts                     # tipos de App.Locals (user/session)
  hooks.server.js              # auth por request -> event.locals.user
  routes/
    +layout.svelte             # layout raíz (importa layout.css)
    layout.css                 # tokens de diseño (@theme) + utilidades (card, btn-*)
    login/, better-auth/       # pantallas de auth
    bienvenida/                # onboarding: crea settings + siembra categorías
    (app)/                     # TODO lo autenticado (layout con TabBar)
      +layout.server.js        # guard de sesión, ensureIndexes, ensureFixedCategories
      +page.*                  # Inicio (dashboard)
      registrar/               # alta manual de ingreso/gasto
      escanear/                # escaneo de ticket con IA + revisión
      movimientos/             # historial, detalle [id]
      habitos/                 # analítica por categoría [categoriaId]
      presupuesto/             # presupuesto mensual (planeado vs real)
      ajustes/                 # ajustes, categorias/, exportar/
    api/
      ai-status/+server.js     # GET estado de la IA
      item-corrections/+server.js # POST aprendizaje de ítems ambiguos
  lib/
    index.js
    components/layout/         # TabBar.svelte, PlusSheet.svelte
    utils/                     # lógica PURA (testeable): money, periods, *-math, display
    validation/schemas.js      # Zod schemas de formularios
    server/
      db.js                    # conexión MongoDB (singleton globalThis)
      auth.js                  # better-auth (server-only, top-level await)
      indexes.js               # índices de todas las colecciones
      defaults/                # catálogo fijo: categories.js, subcategories.js
      repos/                   # acceso a datos: movements, categories, settings, budgets, item-corrections
      analytics/               # agregaciones: spending-by-category, period-comparison, category-detail
      ai/openrouter.js         # cliente OpenRouter con fallbacks
      tickets/                 # parse-ticket, classify-items, correction-decision, prompts
scripts/                       # migraciones/backfill manuales (node, no SvelteKit)
tests/                         # node:test sobre lógica pura
```

## Convenciones de código

### Svelte 5 (runes)

- Los runes están **forzados** para todo el código del proyecto (`vite.config.js`).
- Usa `$props()`, `$state()`, `$derived()`, `$bindable()`, `{@render children()}`.
- Navegación reactiva: `import { page } from '$app/state'` (no `$app/stores`).
- Formularios: `import { enhance } from '$app/forms'` con `<form method="post" action="?/accion">`.
- `<svelte:head><title>Sección — contlana</title></svelte:head>` en cada página.

### Server (`+page.server.js`, `+server.js`)

- `load` lee con `event.locals.user.id`; **nunca** confíes en IDs del cliente sin validar pertenencia al usuario.
- Acciones: devuelve `fail(400, { error })` para errores de validación,
  `{ success: true }` para éxito silencioso (`enhance` re-ejecuta `load`),
  o `redirect(303, '/ruta')` tras crear/borrar.
- Serializa antes de devolver: `_id.toString()`, fechas `.toISOString()`.
  Los objetos de Mongo (`ObjectId`, `Date`) no cruzan al cliente.
- El acceso a datos vive en `src/lib/server/repos/*`. No metas queries del driver
  directamente en rutas nuevas si existe un repo; amplía el repo.
- Todo lo de `$lib/server/**` es server-only; nunca lo importes desde `.svelte`.
- Los módulos `.js` documentan con **JSDoc** (`@param`, `@returns`, `@typedef`).

### UI y estilos

- Mobile-first, contenido centrado a `max-width: 32rem`, navegación en `TabBar`
  superior. No hay barra inferior.
- Tokens de diseño en `src/routes/layout.css`: usa variables (`--app-bg`,
  `--card-bg`, `--color-primary-*`, `--color-danger-*`, `--radius-*`) en vez de
  colores hardcodeados. Soporta modo oscuro vía `prefers-color-scheme`.
- Utilidades Tailwind propias ya definidas: `card`, `btn-primary`,
  `btn-secondary`, `btn-danger`, `input-field`, `chip`, `chip-active`,
  `text-money`. Prefiérelas antes de reinventar estilos.
- Estilos de componente con `<style>` scoped. Prettier **ordena las clases
  Tailwind automáticamente** (`prettier-plugin-tailwindcss`).

### Dinero

- **Todos los montos se guardan en centavos enteros** (`amountCents`,
  `monthlyIncomeCents`, `plannedCents`). Nunca guardes floats de pesos.
- Convierte con `pesosToCents` / `centsToPesos`, parsea input de usuario con
  `parseAmountToCents` (acepta `"$1,234.56"`), muestra con `formatMoney`
  (`src/lib/utils/money.js`).

### Fechas y periodos

- Zona de referencia `America/Mexico_City`. Usa `todayInMX()` y las funciones de
  `src/lib/utils/periods.js` (`getPeriodRange`, `getMonthRange`, ...) en vez de
  `new Date()` directo.
- Las fechas se guardan como `Date` UTC representando el día local (mediodía UTC
  para movimientos). El "mes contable" empieza el día configurable
  `settings.monthStartDay` (1–28).

## Modelo de datos (MongoDB)

Colecciones propias (además de las de better-auth: `user`, `session`, `account`, `verification`):

- **`movements`**: `{ userId, type: 'expense'|'income', amountCents, date, merchant, categoryId, subcategoryKey, categoryKey, note, source: 'manual'|'ticket', items: [{ originalDescription, amountCents, categoryId, subcategoryKey }] }`.
  Los tickets con desglose dejan `categoryId = null` y reparten el gasto en `items`.
- **`categories`**: catálogo del usuario. `{ userId, name, categoryKey, parentId, isFavorite, isHidden, isSystem }`.
- **`settings`**: uno por usuario (índice único). `{ userId, monthlyIncomeCents, currency, monthStartDay }`.
- **`item_corrections`**: aprendizaje de ítems ambiguos de tickets.
- **`budgets`**: uno por usuario (índice único). `{ userId, lines: [{ categoryId, plannedCents }] }` = gastos **planeados**.

`ensureIndexes()` (`src/lib/server/indexes.js`) crea los índices; corre una vez
por proceso desde `(app)/+layout.server.js`.

## Dominio: categorías y subcategorías (regla dura)

- El catálogo es **fijo**: 17 categorías + "Sin clasificar" (sistema) en
  `src/lib/server/defaults/categories.js`. Las subcategorías, con `key` estable,
  están en `src/lib/server/defaults/subcategories.js`.
- **La IA nunca crea, renombra ni borra categorías.** Solo puede elegir `key`s
  existentes del catálogo; de la subcategoría se deriva la categoría principal
  (`getCategoryKeyOfSubcategory`).
- Usa `categoryKey` (string estable) para lógica; los nombres visibles pueden
  cambiar. Nunca hagas `if` sobre el nombre de la categoría.
- `ensureFixedCategories(userId)` se ejecuta en cada request a `(app)` y
  auto-migra categorías legacy de forma idempotente. No borres categorías con
  movimientos ni la de sistema.
- `ajustes/categorias` **no** permite crear/renombrar/borrar (el catálogo es
  fijo); solo favoritos y ocultar. No reactives esas acciones.
- Cuando agregues una categoría o subcategoría al catálogo, corre/actualiza
  `tests/subcategories.test.js` (valida coherencia key ↔ categoría).

## IA de tickets

Flujo: subir imagen → `parseTicketImage` (OpenRouter, Zod sobre la respuesta) →
`classifyItems` (por subcategoría, conservador: ante duda marca `pending`
/`ambiguous`, **no inventa**) → revisión del usuario → `createMovement` +
`upsertItemCorrection`.

Regla de aprendizaje (`correction-decision.js`): **solo se memoriza lo que el
usuario cambió** (aclaró ambiguo, editó descripción, cambió categoría/subcategoría).
Lo que la IA resolvió sola no se guarda en `item_corrections`.

## Presupuesto (planeado vs real)

- Los gastos del presupuesto son **planeados** y viven en `budgets`; los gastos
  reales en `movements`. No los mezcles.
- La pantalla `/presupuesto` lista por defecto **todas** las categorías de gasto
  (cuando el usuario aún no guarda un presupuesto). Cada categoría es expandible a
  sus **subcategorías** (con un chevron). El usuario asigna monto a la categoría
  ("General") o a subcategorías, borra categorías o re-agrega. Una vez guardado,
  `budget.lines` es la fuente de verdad de qué categorías están en la lista.
- Forma de cada línea: `{ categoryId, subcategoryKey: string|null, plannedCents }`.
  `subcategoryKey: null` = monto general de la categoría; una subcategoría es una
  línea aparte. El formulario usa nombres `general|<categoryId>` y
  `sub|<categoryId>|<subcategoryKey>` y se parsea con `buildBudgetLinesFromForm`.
  Los borrados y añadidos son estado de cliente; se persisten al guardar (el
  formulario reemplaza todas las líneas, y siempre incluye un `general|` por
  categoría incluida aunque sea 0).
- Lógica pura en `src/lib/utils/budget-math.js` (`sumPlannedCents`,
  `plannedCentsByCategory`, `plannedCategoryCount`, `buildBudgetLinesFromForm`,
  `remainingFromIncome`, `budgetUsedPct`, ...).
- Gasto real por subcategoría: `getSpendingByCategorySubcategory` en
  `src/lib/server/analytics/spending-by-subcategory.js`. La comparación contra lo
  real se arma en `presupuesto/+page.server.js` (por categoría con
  `getSpendingByCategory` y por subcategoría con la anterior).

## Tests

- Solo se prueban **funciones puras** de `src/lib/utils/**` y catálogos
  (`tests/*.test.js`); no hay tests de integración con Mongo.
- Framework: `node:test` + `node:assert/strict`. Estructura: un `test()` padre
  con `await t.test(...)` por caso.
- Al agregar un archivo de test, **actualiza el script `test`** en `package.json`.
  Ejecuta `pnpm test` antes de dar por terminado un cambio.

## Lint y formato

- Prettier: tabs, comillas simples, sin trailing commas, ancho 100.
- **`pnpm lint` ya falla en `main`** por deuda preexistente (formato en varios
  archivos y reglas `svelte/no-navigation-without-resolve` /
  `svelte/require-each-key`). No reformatees ni arregles archivos que no tocaste:
  limita el lint a tus cambios.
- Archivos protegidos por `.clineignore` (hooks PreToolUse) no se pueden leer,
  editar ni acceder por shell. `node_modules`, `.env`, `.svelte-kit`, `.vercel`,
  lockfiles y binarios están bloqueados: no intentes "arreglarlos".

## Checklist antes de terminar un cambio

1. `pnpm test` en verde (y script `test` actualizado si añadiste pruebas).
2. `pnpm build` compila (ignora el `EPERM symlink` final del adaptador en Windows).
3. Prettier/ESLint limpios **en los archivos que tocaste**.
4. Montos en centavos; fechas con helpers de `periods.js`; nada de `ObjectId`/
   `Date` crudos cruzando al cliente.
5. Copy de UI en español y consistente con el tono existente.
