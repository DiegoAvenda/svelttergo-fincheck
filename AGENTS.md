# AGENTS.md

Guía para agentes de IA (y personas) que trabajan en este repositorio.
Léela antes de tocar código. Si algo aquí contradice al código, gana el código:
actualiza este archivo cuando cambies una convención.

## Qué es este proyecto

**NAVEDDY** es una app móvil-first de finanzas personales para México. Permite
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
- IA: `GROQ_API_KEY` (principal), `GROQ_MODEL`, `OPENROUTER_API_KEY` (fallback),
  `OPENROUTER_MODEL`, `OPENROUTER_REASONING_EFFORT`, `OPENROUTER_APP_URL`,
  `OPENROUTER_APP_TITLE`, `OPENROUTER_TIMEOUT_MS`, y opcional `ANTHROPIC_API_KEY`.

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
    components/layout/         # TabBar.svelte, PlusSheet.svelte, Brand.svelte
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
- `<svelte:head><title>Sección — NAVEDDY</title></svelte:head>` en cada página.

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

- Mobile-first, contenido centrado con `max-width: var(--app-max-width)` (`56rem`)
  y margen lateral `var(--app-gutter)` (`1rem`, `1.5rem` desde 48rem y `2rem`
  desde 80rem). No hardcodees anchos ni padding lateral: usa esos tokens en el
  layout y en la `TabBar`. Navegación en `TabBar` superior; no hay barra inferior.
- Tokens de diseño en `src/routes/layout.css`: usa variables (`--app-bg`,
  `--card-bg`, `--color-primary-*`, `--color-danger-*`, `--radius-*`) en vez de
  colores hardcodeados. Soporta modo oscuro vía `prefers-color-scheme`.
- Utilidades Tailwind propias ya definidas: `card`, `btn-primary`,
  `btn-secondary`, `btn-danger`, `input-field`, `chip`, `chip-active`,
  `text-money`. Prefiérelas antes de reinventar estilos.
- Marca de la app: usa `<Brand />` de `src/lib/components/layout/Brand.svelte`
  (`size`: `sm` | `md` | `lg`) para mostrar el símbolo + "NAVEDDY". En la app
  autenticada aparece en la `TabBar` desde 56rem (espacio a los costados) y en el
  encabezado de Inicio en móvil; no la dupliques en otras pantallas.
- El favicon (`src/lib/assets/favicon.jpg`) es el símbolo de la marca: si cambias
  el logo, actualiza ambos.
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
  para movimientos).
- **El ciclo siempre es el mes calendario**: empieza el día 1 y termina el último
  día natural del mes. No hay día de inicio configurable; `settings.monthStartDay`
  se eliminó del modelo, la validación y la UI. El fin se guarda **exclusivo**
  (día 1 del mes siguiente) y la UI muestra el último día inclusivo.
- Las claves canónicas `YYYY-MM` de `periods.js` (`currentMonthKey`,
  `monthKeyOfDate`, `getMonthRangeByKey`, `shiftMonthKey`, `previousMonthKey`,
  `nextMonthKey`, `isValidMonthKey`, `monthKeyLabel`) sirven para navegar y
  comparar (orden lexicográfico).
- Para presupuestos usa los límites explícitos
  `periodStart`/`periodEndExclusive` (fin exclusivo) y `resolveCurrentPeriod`; los
  documentos guardados conservan sus fechas y no se reinterpretan. Para etiquetas
  de rango usa `formatPeriodLabel`.

## Modelo de datos (MongoDB)

Colecciones propias (además de las de better-auth: `user`, `session`, `account`, `verification`):

- **`movements`**: `{ userId, type: 'expense'|'income', amountCents, date, merchant, categoryId, subcategoryKey, categoryKey, note, source: 'manual'|'ticket', items: [{ originalDescription, amountCents, categoryId, subcategoryKey }] }`.
  Los tickets con desglose dejan `categoryId = null` y reparten el gasto en `items`.
- **`categories`**: catálogo del usuario. `{ userId, name, categoryKey, parentId, isFavorite, isHidden, isSystem, isCustom }`.
- **`user_subcategories`**: subcategorías personalizadas. `{ userId, categoryId, key, name, isCustom, createdAt }`.
- **`settings`**: uno por usuario (índice único). `{ userId, monthlyIncomeCents, currency, incomeType }`. `incomeType` es `'fixed' | 'variable' | null` y solo sirve para decidir si la propuesta de un ciclo nuevo precarga el ingreso esperado. Documentos viejos pueden conservar `monthStartDay`; se ignora.
- **`item_corrections`**: aprendizaje de ítems ambiguos de tickets.
- **`budgets`**: uno por usuario **y mes**. `{ userId, monthKey: 'YYYY-MM', periodStart: Date, periodEndExclusive: Date, periodInferred: boolean, plannedIncomeCents: number|null, status: 'draft'|'confirmed', replacedConfirmed: boolean, lines: [{ categoryId, subcategoryKey, plannedCents, categoryName, subcategoryName }] }`.
  - `monthKey` es el mes calendario (`YYYY-MM`) y se conserva para la navegación
    (`?month=YYYY-MM`). Los límites reales son
    `periodStart`/`periodEndExclusive` (fin exclusivo); en los ciclos nuevos
    siempre son el día 1 y el día 1 del mes siguiente.
  - Documentos anteriores al modelo de mes calendario pueden tener periodos no
    naturales y un `periodStartDay` legado: sus fechas se respetan y el campo se
    ignora.
  - `plannedIncomeCents` es el ingreso **esperado** del ciclo. No es un movimiento real y no se suma a los ingresos de `movements`.
  - `status: 'draft'` es una propuesta pendiente de confirmar; solo `'confirmed'` cuenta como presupuesto.
  - `categoryName`/`subcategoryName` son _snapshots_ de respaldo (la UI prefiere el nombre vigente del catálogo).

`ensureIndexes()` (`src/lib/server/indexes.js`) crea los índices; corre una vez
por proceso desde `(app)/+layout.server.js`.

## Dominio: categorías y subcategorías (regla dura)

- El catálogo **fijo** son 17 categorías + "Sin clasificar" (sistema) en
  `src/lib/server/defaults/categories.js`. Las subcategorías fijas, con `key`
  estable, están en `src/lib/server/defaults/subcategories.js`.
- **Categorías/subcategorías personalizadas**: además del catálogo fijo, el
  usuario puede crear las suyas. Una categoría personalizada es un doc real de
  `categories` con `isCustom: true` y `categoryKey: 'custom-<uuid>'`. Una
  subcategoría personalizada vive en `user_subcategories`, cuelga de un
  `categoryId` (fijo o personalizado) y su `subcategoryKey` en movimientos es
  `custom-<uuid>`. Su lógica está en `src/lib/server/repos/custom-catalog.js`
  (`createCustomCategory`, `createCustomSubcategory`, `deleteCustomCategory`,
  `deleteCustomSubcategory`, `buildCatalogForUser`).
- Para resolver subcategorías (fijas + personalizadas) usa
  `buildCatalogForUser(userId, categories)` o la util pura
  `groupSubcategories` (`src/lib/utils/subcategory-catalog.js`). **No combines a
  mano** el catálogo fijo con el del usuario.
- **La IA nunca crea, renombra ni borra categorías.** Solo puede elegir `key`s
  fijas existentes; de la subcategoría se deriva la categoría principal
  (`getCategoryKeyOfSubcategory`). Las subcategorías personalizadas las elige el
  usuario en la revisión, no la IA.
- Usa `categoryKey` (string estable) para lógica; los nombres visibles pueden
  cambiar. Nunca hagas `if` sobre el nombre de la categoría.
- `ensureFixedCategories(userId)` se ejecuta en cada request a `(app)` y
  auto-migra categorías legacy de forma idempotente. **Ignora `isCustom`** (no
  borra lo del usuario). No borres categorías con movimientos ni la de sistema.
- Borrar una categoría/subcategoría personalizada **solo se permite si no tiene
  ninguna referencia**: movimientos, `items` de tickets **o líneas de presupuesto
  de cualquier mes**. Si tiene referencias se bloquea y se ofrece **Ocultar**: el
  servidor vuelve a comprobar las referencias al momento de borrar (los flags que
  manda el cliente son solo informativos). Al borrar (sin referencias) se limpian
  correcciones, subcategorías hijas y líneas de presupuesto. Las del catálogo fijo
  **no** se pueden borrar ni renombrar.
- `getCatalogUsage(userId)` (`custom-catalog.js`) devuelve `categoryIds`/
  `subcategoryKeys` (movimientos) y `budgetCategoryIds`/`budgetSubcategoryKeys`
  (todos los meses), más la unión `referenced*`, que es la que decide borrar.
  La lógica pura vive en `src/lib/utils/catalog-usage.js`
  (`buildCatalogUsageSets`, `categoryHasReferences`, `subcategoryHasReferences`).
- **Ocultar nunca borra datos**: solo cambia la visibilidad del catálogo. Las
  líneas de presupuesto (históricas y del mes activo) y los movimientos se
  conservan con sus importes; el historial sigue mostrando los nombres de las
  categorías ocultas.
- El historial (Inicio, Movimientos —incluido su filtro—, detalle, Hábitos,
  presupuesto y exportación) resuelve nombres con **todas** las
  categorías/subcategorías, incluidas las ocultas; los selectores de captura
  (Registrar/Escanear) y las **nuevas** asignaciones del presupuesto usan solo las
  visibles/no ocultas.
- `ajustes/categorias` permite crear (categoría o subcategoría bajo un padre),
  renombrar, ocultar/mostrar y borrar **solo** lo personalizado; favoritos/ocultar
  aplican a las categorías y las subcategorías personalizadas también se pueden
  ocultar. Las subcategorías del catálogo fijo se muestran sin acciones.
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
  reales en `movements`. No los mezcles. El ingreso esperado del ciclo vive en
  `budgets.plannedIncomeCents` y tampoco es un movimiento real.
- **Un presupuesto por usuario y mes**. El identificador de negocio son los
  límites `periodStart`/`periodEndExclusive` (fin exclusivo).
  `monthKey: 'YYYY-MM'` es el mes calendario, es único por construcción y se usa
  para la navegación `?month=YYYY-MM`.
- **Resolución del ciclo actual**: `resolveCurrentPeriod(userId)` calcula el mes
  calendario de hoy (`getMonthRange`) y busca el presupuesto guardado de ese mes.
  No existe día de inicio configurable ni periodos de transición.
  - Los presupuestos ya guardados conservan sus fechas y no se reinterpretan.
  - `migrateBudgetPeriods` solo rellena límites faltantes de presupuestos
    anteriores al modelo de ciclos explícitos con el mes calendario y marca
    `periodInferred: true`. No inventa presupuestos ni ingresos.
- **Índices**: único parcial `{ userId, periodStart }` (solo documentos con
  `periodStart` date) para impedir dos presupuestos en el mismo periodo, y no
  único `{ userId, monthKey }` para navegación/compatibilidad. El índice único
  anterior `{ userId, monthKey }` se retira. `ensureIndexes()` deduplica periodos
  de forma conservadora (no borra líneas) y aparta duplicados legacy con una
  clave `legacy-<id>`.
- El **ciclo actual es editable**; los anteriores son de **solo lectura** (se
  navega con flechas y un selector de meses; nunca al futuro). Un ciclo sin
  presupuesto guardado muestra el estado explícito _"Sin presupuesto guardado
  para este ciclo"_ (no un presupuesto en cero inventado) y, si hay gasto real,
  se lista aparte.
- **Propuesta explícita** (`?/propose`, alias `?/copyPrevious`): solo aplica al
  ciclo actual, toma el **último presupuesto confirmado** anterior (aunque se
  hayan saltado meses) y crea un documento `status: 'draft'`. Excluye por
  defecto las categorías/subcategorías **ocultas** del ciclo nuevo y nunca
  modifica el ciclo origen ni crea movimientos reales. Las líneas ocultas de un
  presupuesto ya existente se conservan.
  - Si el destino ya tiene líneas o es un borrador, se pide confirmación y el
    servidor falla con `409` (`needsCopyConfirm`) si no llega `confirm=true`.
  - `?/save` confirma y guarda (`status: 'confirmed'`). `?/discardDraft` solo
    elimina un borrador; si el borrador reemplazó un presupuesto confirmado
    (`replacedConfirmed: true`) se bloquea para no perder importes.
  - Una propuesta pendiente **no cuenta** como presupuesto confirmado en Inicio:
    solo muestra un aviso con enlace a Presupuesto.
- **Ingreso esperado vs real**:
  - `plannedIncomeCents` es propio de cada ciclo y se edita junto al
    presupuesto. Confirmarlo **no crea** un movimiento de ingreso.
  - `settings.incomeType` decide el prellenado de la propuesta: `'fixed'` copia
    el esperado del ciclo anterior; `'variable'` no precarga (el ingreso real
    anterior se muestra solo como referencia); `null` no precarga.
  - `settings.monthlyIncomeCents` es una referencia general y solo se usa como
    _fallback_ de prellenado en el ciclo actual cuando no hay ingreso esperado
    guardado. Nunca se usa para el historial, ni con ingresos variables, ni para
    una propuesta pendiente.
  - En la UI conviven el ingreso esperado, el ingreso real del periodo y el
    balance real; no se suman entre sí.
- La pantalla lista por defecto **todas** las categorías visibles de gasto cuando
  aún no hay presupuesto guardado. Cada categoría es expandible a sus
  **subcategorías** (con un chevron). El usuario asigna monto a la categoría
  ("General") o a subcategorías, borra categorías, re-agrega del catálogo o
  **crea categorías personalizadas**. Una vez guardado, `budget.lines` es la
  fuente de verdad de qué categorías están en la lista.
- **Categorías/subcategorías ocultas con línea guardada**: se conservan y se
  muestran en una sección secundaria ("Categorías ocultas con presupuesto"), cuentan
  en los totales y se pueden ajustar o quitar explícitamente. No se ofrecen para
  **nuevas** asignaciones (el servidor rechaza agregar una oculta sin línea previa).
  El gasto real de cualquier categoría —oculta o sin línea— **siempre cuenta**; lo
  que no tiene línea aparece en "Gastos reales sin presupuesto" y no se le asigna
  un límite ficticio.
- Forma de cada línea:
  `{ categoryId, subcategoryKey: string|null, plannedCents, categoryName, subcategoryName }`.
  `subcategoryKey: null` = monto general de la categoría; una subcategoría es una
  línea aparte. El formulario usa nombres `general|<categoryId>` y
  `sub|<categoryId>|<subcategoryKey>` y se parsea con `buildBudgetLinesFromForm`.
  Los borrados y añadidos son estado de cliente; se persisten al guardar (el
  formulario reemplaza todas las líneas, y siempre incluye un `general|` por
  categoría incluida aunque sea 0).
- **Migración legacy**: el modelo anterior tenía un único presupuesto por usuario
  (`{ userId }`). `migrateLegacyBudgets(userId, currentMonthKey)` lo asigna de
  forma idempotente al mes actual **solo si no existe ya** un presupuesto de ese
  mes; no inventa meses históricos. Si hubiera documentos legacy duplicados, se
  conservan con una clave no canónica (`legacy-<id>`) para no perder información.
- **Categorías personalizadas**: son **categorías reales** (ver sección
  siguiente), no etiquetas solo de presupuesto. Se crean desde el presupuesto o
  desde Ajustes → Categorías y se comportan como cualquier otra: aparecen en
  Registrar, Escanear y Movimientos, y reciben gasto real.
- Lógica pura en `src/lib/utils/budget-math.js` (`sumPlannedCents`,
  `budgetHasPlanned`, `cloneBudgetLines`, `filterVisibleBudgetLines`,
  `plannedCentsByCategory`, `plannedCategoryCount`, `buildBudgetLinesFromForm`,
  `remainingFromIncome`, `budgetUsedPct`, ...).
- Utilidades de periodos en `src/lib/utils/periods.js`: `getMonthRange`,
  `getMonthRangeByKey`, `getPeriodRange`, `monthKeyOfDate`, `currentMonthKey`,
  `formatPeriodLabel` y las claves `YYYY-MM` (`shiftMonthKey`,
  `previousMonthKey`, `nextMonthKey`, `isValidMonthKey`, `monthKeyLabel`). No hay
  día de inicio configurable ni periodos de transición.
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
- Cobertura relevante del presupuesto: `tests/budget.test.js` (matemática pura),
  `tests/budget-periods.test.js` (claves de mes, ciclo del día 1 al último día
  natural, etiquetas, `incomeType`, `cloneBudgetLines`,
  `filterVisibleBudgetLines`, `budgetHasPlanned`) y
  `tests/catalog-usage.test.js` (referencias de movimiento/ítem/presupuesto y
  borrado del padre con subcategorías hijas).
- Los casos de unicidad/idempotencia/multiusuario de Mongo (índices de periodo,
  migraciones, propuesta y descarte) son **verificación manual**: no hay harness
  de Mongo en los tests.

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
