# PlanIt — Documentación técnica completa

> Cómo funciona la app por dentro: arquitectura, tecnologías, APIs, y cada módulo explicado.
> Actualizado: julio 2026.

---

## 1. Visión general

PlanIt es una app móvil para que grupos de amigos organicen planes (asados, viajes, cumpleaños). Cada **plan** es un espacio con chat propio y **módulos** activables (gastos, checklist, walkie talkie, galería, etc.). Además hay **grupos** (chats permanentes de gente) y un sistema social de **amigos** con usernames únicos.

### Arquitectura en una frase

**App móvil (React Native/Expo)** ⟷ **API REST + WebSockets (Express)** ⟷ **PostgreSQL (Prisma)**

```
┌─────────────────────┐         HTTPS (axios)          ┌──────────────────────┐
│   apps/mobile        │ ─────────────────────────────▶ │   apps/api            │
│   Expo SDK 54        │                                │   Express + TS        │
│   React Native       │ ◀───────────────────────────── │   Socket.io           │
│   expo-router        │      WebSocket (socket.io)     │   Prisma ORM          │
└─────────────────────┘                                └──────────┬───────────┘
        │                                                          │
        │ Expo Push API (notificaciones)                           │ SQL
        ▼                                                          ▼
   Celular del usuario                                    PostgreSQL (Render)
```

### Monorepo

Es un **monorepo con npm workspaces**: un solo repositorio con dos aplicaciones que comparten el `package-lock.json` raíz.

```
PlanIt/
├── apps/
│   ├── api/          ← backend (Express + Prisma)
│   └── mobile/       ← app (Expo / React Native)
├── package.json      ← define los workspaces
├── BACKLOG.md        ← lista de features pendientes/hechas
├── CLAUDE.md         ← contexto del proyecto para el asistente
└── ARQUITECTURA.md   ← este documento
```

---

## 2. Tecnologías y para qué se usa cada una

### Backend (`apps/api`)

| Tecnología | Rol |
|---|---|
| **Express 4** | Framework HTTP: define las rutas REST (`/api/plans`, `/api/friends`…) |
| **TypeScript** | Tipado estático en todo el código |
| **Prisma 6** | ORM: define el schema de la base (`schema.prisma`), genera el cliente tipado y maneja migraciones |
| **PostgreSQL** | Base de datos (local en desarrollo, Render en producción) |
| **Socket.io** | Tiempo real: chat, walkie, indicador "escribiendo…", actualizaciones de módulos |
| **bcryptjs** | Hash de contraseñas (nunca se guardan en texto plano) |
| **jsonwebtoken (JWT)** | Sesiones: al loguearte se emite un token firmado válido 30 días |
| **helmet / cors / morgan** | Seguridad de headers, CORS y logging de requests |

### Mobile (`apps/mobile`)

| Tecnología | Rol |
|---|---|
| **Expo SDK 54** | Plataforma sobre React Native: simplifica acceso a cámara, audio, notificaciones, etc. |
| **expo-router 6** | Navegación basada en archivos: cada archivo en `app/` es una pantalla |
| **Zustand** | Estado global mínimo: sesión (`useAuthStore`) y preferencias (`useSettings`) |
| **axios** | Cliente HTTP hacia el API |
| **socket.io-client** | Conexión WebSocket persistente |
| **@expo-google-fonts** | Poppins (títulos) + Montserrat (textos) — la tipografía de marca |
| **@expo/vector-icons (Ionicons)** | Todos los íconos de la UI (cero emojis) |

### Paquetes Expo específicos

| Paquete | Se usa en |
|---|---|
| `expo-av` | Grabar y reproducir audio (walkie talkie) |
| `expo-image-picker` | Elegir fotos de galería / sacar con cámara (avatar, banner, galería) |
| `expo-image-manipulator` | **Comprimir** imágenes antes de subir (resize + JPEG) |
| `expo-file-system/legacy` | Escribir archivos temporales (audio base64 → archivo reproducible en iOS) |
| `expo-media-library` | Guardar fotos de la galería del plan en el carrete del celular |
| `expo-document-picker` + `expo-sharing` | Subir/abrir archivos en el módulo Files |
| `expo-location` | Ubicación en vivo del Meetup Tracker |
| `react-native-maps` | El mapa del Meetup (solo nativo; en web muestra un aviso) |
| `expo-secure-store` | Guardar el JWT y las preferencias de forma segura en el dispositivo |
| `expo-notifications` + `expo-device` | Push notifications (activas en build nativo) |
| `expo-local-authentication` | Bloqueo con Face ID / huella |
| `expo-linear-gradient` | El degradado oscuro (scrim) sobre las fotos de portada de planes |

### Servicios externos

| Servicio | Uso |
|---|---|
| **Render** | Hosting del API + PostgreSQL de producción (plan free, 1 GB) |
| **Google Gemini** (`gemini-flash-latest`, tier gratuito) | Asistente de IA del plan + sugerencias de checklist |
| **Expo Push API** | Envío de notificaciones push a los celulares |
| **EAS (Expo Application Services)** | Builds nativos para TestFlight/App Store |

---

## 3. Base de datos (Prisma schema)

Modelos principales en `apps/api/prisma/schema.prisma`:

- **User** — email (único), password (hash bcrypt, nullable), **username + tag** (par único estilo Discord: `agus#4821`), name, avatar (data-URL), bio, location, **pushToken** (Expo).
- **Friendship** — relación entre dos usuarios con `status: pending | accepted`. Una sola fila por par (quién la inició importa para saber quién acepta).
- **Group** — nombre, foto, descripción, `inviteCode` (único, para links de invitación), `lastActivityAt` (ordena la lista y marca no-leídos).
- **GroupMember** — rol (`admin|member`), `status` (`invited|member` — las invitaciones son membresías pendientes), `muted`, `lastSeenAt`.
- **Plan** — título, descripción, **bannerImage** (foto de portada comprimida), tipo (`full|quick`), fechas, ubicación, `inviteCode`, `moduleActivity` (JSON: última actividad por módulo, alimenta los puntos naranjas de "no visto").
- **PlanMember** — rol (`admin|helper|member`), `rsvp` (`yes|maybe|no|pending`), `status` (`invited|member`), `moduleSeen` (JSON: cuándo vi cada módulo), **walkieOptIn** (`pending|accepted|declined` — consentimiento del walkie), lat/lng/locationAt (ubicación en vivo).
- **PlanModule** — qué módulos tiene activados cada plan (tipo + orden).
- **Message** — chat: contenido + autor + planId o groupId.
- **Expense / ExpenseSplit** — gasto con pagador y divisiones por persona (`settled` marca quién ya pagó su parte).
- **CheckItem** — ítem de checklist con `assignedTo` (quién lo lleva).
- **Activity** — actividad con orden y hora opcional.
- **Vote** — votación: pregunta, opciones (JSON), resultados (JSON: userId → índice de opción), `closed`.
- **Photo** — foto de galería (data-URL comprimida).
- **PlanFile** — archivo adjunto (nombre, mime, tamaño, data base64) + `notes` compartidas en el Plan.
- **VoiceClip** — audio del walkie (data-URL m4a, duración). Auto-limpieza: máx 30 por plan y TTL de 48 h.
- **PlanTemplate** — snapshot JSON de un plan (módulos + checklist + actividades) para reutilizar.
- **Availability** — disponibilidad por día (`free|maybe|busy`) por usuario, para el heatmap grupal.

### Estrategia de almacenamiento

Todo lo binario (fotos, audios, archivos) se guarda como **data-URL base64 dentro de Postgres** — sin S3 ni servicios de archivos. Para que entre en 1 GB:
- Las imágenes se **comprimen en el celular** antes de subir (`lib/images.ts`: resize a 512-1280px + JPEG ~55-60% → ~10x más chicas).
- El API acepta bodies de hasta 8 MB (`express.json({ limit: "8mb" })`) y rechaza banners > 1.5 MB.
- Los audios del walkie expiran (30 clips máx / 48 h).

---

## 4. Backend: API REST

Servidor en `apps/api/src/server.ts` — monta Express + Socket.io en el puerto 4000. Todas las rutas van bajo `/api/*` y (salvo auth) requieren el header `Authorization: Bearer <jwt>`, validado por `middleware/auth.ts` que deja `req.userId` disponible.

### Rutas por archivo (`src/routes/`)

- **auth.ts** — `POST /register` (username OBLIGATORIO; genera el tag de 4 dígitos evitando colisiones), `POST /login`, `POST /google` (stub: llega con OAuth).
- **users.ts** — `GET/PATCH /me` (al cambiar username se regenera el tag si colisiona), `POST /me/password`, `POST /me/push-token`, `GET /search?q=` (por username/nombre/email exacto — **nunca** expone emails), `GET /profile/:id` (perfil público con control de acceso: solo si compartís plan/grupo/amistad; incluye estado de amistad para el botón correcto), `GET /:username`.
- **friends.ts** — listar amigos, solicitudes, enviar (por `userId` desde la búsqueda, o `query` email/username#tag), aceptar/rechazar, perfil de amigo (sin email), eliminar. Envía **push** al recibir solicitud.
- **groups.ts** — CRUD de grupos, `POST /:id/invite` (amigos de la app → push), invitaciones aceptar/rechazar, join por código, `PATCH` (nombre/desc/**foto**), seen/leave/mute/delete.
- **plans.ts** — el archivo más grande: crear plan (con grupos/amigos invitados → push), detalle con todos los módulos incluidos, `PATCH` (editar título/fecha/ubicación/descr/**banner**), invitar (→ push), join por código, RSVP, roles (admin promueve helpers), leave (si sale el admin se promueve al miembro más antiguo; si sale el último se borra el plan), delete, módulos add/remove, seen por módulo, ubicación en vivo, meetup status, templates (guardar/usar/renombrar/borrar).
- **messages.ts** — chat de plan y de grupo: GET últimos 100 + POST (persiste, emite por socket, bumpea actividad). Incluye `username` del autor para mostrarlo en el chat.
- **expenses.ts** — gastos con splits; `GET /plan/:id/summary?mode=expense|equal` calcula balances netos y el **plan de pagos mínimo** (quién le paga a quién).
- **checklist.ts / activities.ts / votes.ts** — CRUD de sus módulos (reorder de actividades, cerrar votaciones, etc.).
- **gallery.ts / files.ts** — fotos y archivos base64 + notas compartidas del plan.
- **availability.ts** — mi disponibilidad por rango de fechas + la del plan (para el heatmap).
- **voice.ts** — walkie: enviar clip (valida opt-in, limpia viejos, emite socket `voice:new` con metadata, y **push** "X está hablando" a los opt-in), listar, fetch de audio individual, borrar (autor o admin), opt-in/status.
- **ai.ts** — integración Gemini (ver §7).

### Tiempo real (`lib/socket.ts`)

Rooms por entidad: `plan:<id>` y `group:<id>`. El cliente hace `join:plan`/`join:group` al entrar a la pantalla. Eventos que emite el servidor:
- `message:new` — mensaje de chat
- `typing` — relay del indicador "escribiendo…" (no se persiste)
- `voice:new` / `voice:deleted` — walkie
- `expense:added/removed`, `checklist:changed`, `activities:changed`, `votes:changed`, `gallery:changed`, `playlist:changed`, `files:changed`, `notes:changed`, `meetup:changed`, `location:changed` — cada módulo avisa cambios para refrescar en vivo y encender los puntos de "no visto".

### Push notifications (`lib/push.ts`)

`sendPushToUsers(userIds, title, body, data)`: busca los `pushToken` de esos usuarios y hace POST a `https://exp.host/--/api/v2/push/send` (en lotes de 100). Es *fire-and-forget*: nunca bloquea la respuesta HTTP. Se dispara en: solicitud de amistad, invitación a plan (crear/invitar), invitación a grupo, y clip de walkie (con el nombre del plan y quién habla). **Solo funciona con el build nativo** (Expo Go no soporta push remoto desde SDK 53).

---

## 5. Mobile: estructura de la app

### Navegación (expo-router)

```
app/
├── _layout.tsx            ← raíz: carga fuentes/settings, splash animado,
│                             candado biométrico, registro de push, Stack protegido por sesión
├── (auth)/sign-in.tsx     ← login/registro (username obligatorio al registrarse)
├── (tabs)/
│   ├── _layout.tsx        ← barra de 4 pestañas (Ionicons, naranja activo)
│   ├── index.tsx          ← PLANS: lista de planes (cards con banner opcional)
│   ├── groups.tsx         ← GROUPS: lista de grupos (foto circular)
│   ├── calendar.tsx       ← CALENDAR: mis planes + mi disponibilidad
│   └── profile.tsx        ← PROFILE: perfil + Configuración (tema/idioma/biometría)
├── plan/[id].tsx          ← detalle del plan: grid de módulos, chat, modales
├── group/[id].tsx         ← chat del grupo + miembros + invitar
├── create-plan.tsx        ← crear plan (plantillas, grupos/amigos, fecha)
├── create-group.tsx       ← crear/unirse a grupo
├── friends.tsx            ← búsqueda en vivo por username + solicitudes
├── notifications.tsx      ← campanita: solicitudes e invitaciones
├── edit-profile.tsx       ← editar perfil (foto por cámara/galería) + contraseña
├── templates.tsx          ← gestionar plantillas guardadas
└── join/[kind]/[code].tsx ← deep links planit://join/plan/<código>
```

### Librerías propias (`lib/`)

- **api.ts** — instancia de axios. Resuelve la URL base: usa `EXPO_PUBLIC_API_URL` (el `.env` con la URL de Render) o deriva la IP de tu PC desde el bundler de Expo (desarrollo local). Inyecta el JWT en cada request. `tokenStorage` con SecureStore.
- **socket.ts** — singleton del cliente Socket.io.
- **theme.ts** — el **sistema de diseño**: paletas `lightColors`/`darkColors` (naranja #F77F00, petróleo #0B3954, teal #0892A5, hielo #E8F1F2), fuentes, radios, sombras, `userColor(id)` (color estable por usuario para el chat) y `themedStyles()` (cachea los StyleSheets por paleta).
- **i18n.ts** — ~370 claves EN/ES. `useT()` devuelve el traductor; TypeScript valida cada clave.
- **images.ts** — `compressToDataUrl(uri, maxWidth, quality)` con expo-image-manipulator.
- **notifications.ts** — registro del push token (permiso → `getExpoPushTokenAsync` con el projectId de EAS → POST al backend) y handler para mostrar notificaciones en foreground.
- **invite.ts** — comparte links de invitación (`planit://join/...`) con el share sheet nativo.

### Estado global (`hooks/`)

- **useAuthStore** (zustand) — token + user; `signIn/signUp/signOut/loadToken`. El token persiste en SecureStore → la sesión dura 30 días sin reloguear.
- **useSettings** (zustand) — `theme` (light/dark), `lang` (en/es), `biometric` (candado). Persisten en SecureStore. Exporta `useTheme()` (paleta actual) y `useT()` (traductor).
- **useChatUx** — toda la lógica de chat estilo WhatsApp reutilizada por plan y grupo: auto-scroll solo si estás al final, mensajes visibles sobre el teclado, flecha flotante "ir al último", indicador "escribiendo…" (emite/escucha el evento `typing` con debounce).

### Theming dinámico

Cada pantalla define `const getStyles = themedStyles((c: Palette) => StyleSheet.create({...}))` y dentro del componente hace `const c = useTheme(); const styles = getStyles(c);`. Al togglear el modo oscuro, todos los componentes re-renderizan con la otra paleta al instante; los estilos se memoizan por paleta así no se recrean en cada render.

---

## 6. Los módulos del plan, uno por uno

Cada plan muestra un **grid** (una columna) con Chat + los módulos activados. El admin/helper agrega o quita módulos. Cada card muestra un punto naranja si hay actividad sin ver (comparando `plan.moduleActivity` contra `member.moduleSeen`).

### 💬 Chat (siempre presente)
Mensajes persistidos + socket para tiempo real. Burbujas: las tuyas naranjas a la derecha; las ajenas blancas con **avatar e inicial del color del usuario** y su **username** (sin #tag). Tocás el nombre → se abre el **perfil emergente** (UserProfileSheet) con botón de agregar amigo. UX WhatsApp completa vía `useChatUx`.

### 💸 Dividir gastos (ExpensesModule)
Cargás un gasto (título + monto + entre quiénes se divide). El backend calcula dos vistas: **por gasto** (cada gasto con sus splits, tocás tu fila cuando pagaste) o **todo ÷ todos**. La sección "Saldar cuentas" muestra el **plan de transferencias mínimo** (algoritmo greedy sobre los balances netos: los que deben le pagan a los que pusieron de más).

### 🛒 Lista de cosas (ChecklistModule)
Checklist compartido con **asignación**: "Lo llevo" reclama el ítem (se ve "Martu lo lleva"). Barra de progreso X/Y listos, filtro "ocultar listos". Botón **✨ IA**: Gemini sugiere ítems según el plan (título, lugar, fecha, cantidad de gente) y elegís cuáles agregar.

### 📋 Actividades (ActivitiesModule)
Itinerario ordenado: actividades con hora opcional, se reordenan con flechas (optimistic update + `reorder` al backend), se tildan como hechas.

### 🗳️ Votación rápida (VotesModule)
Pregunta + 2-6 opciones. Los resultados se guardan como JSON `{userId: opciónIndex}`; las barras muestran porcentajes en vivo. El admin/helper cierra la votación (se corona 🏆 la ganadora) o la borra.

### 🎙️ Walkie Talkie (WalkieTalkieModule)
El módulo más complejo:
1. **Consentimiento**: al entrar por primera vez te pregunta si querés unirte al canal (`walkieOptIn`). Sin unirte no escuchás ni enviás.
2. **Grabar**: mantenés apretado → `expo-av` graba (el arranque del mic tarda ~0.5s; se trackea la promesa para que un toque rápido espere). Duración medida por reloj de pared (iOS devuelve 0 tras unload). Al soltar: base64 → POST.
3. **Recibir**: socket `voice:new` → si tenés auto-play y no silenciaste al emisor, se reproduce solo. iOS no reproduce data-URLs → se escribe a archivo temporal y se toca desde ahí, con `playsInSilentModeIOS` (suena aunque el celu esté en silencio).
4. **Controles**: silenciar personas individuales o a todos, borrar tus clips (mantener apretado).
5. **Push**: a los miembros del canal les llega notificación con el nombre del plan + quién habla (build nativo).

### 📸 Galería (GalleryModule)
Grilla 3 columnas. Las fotos se comprimen en el celular (1280px) antes de subir. Visor a pantalla completa con **Guardar** (escribe el base64 a archivo temporal → `expo-media-library` lo mete en tu carrete) y borrar (autor o admin).

### 🎵 Playlist (PlaylistModule)
Canciones como **links de Spotify/YouTube Music** (pegás el link compartido). Sistema de votos ▲▼ que reordena el ranking (optimistic). Tocar abre la canción en la app correspondiente. *La conexión OAuth directa con Spotify llega en la fase 2 nativa.*

### 📍 ¿Quién llegó? (MeetupModule)
Estados personales (No salí / En camino / Ya llegué) + **ubicación en vivo opcional**: `expo-location` manda tu posición cada 8s/25m, el resto la ve como pin en un mapa (`react-native-maps`; pin naranja = vos, teal = los demás). Las ubicaciones caducan a los 10 min (stale) y se borran al salir de la pantalla.

### 📎 Archivos y notas (FilesModule)
**Notas compartidas** con auto-guardado (debounce 800ms) sincronizadas por socket entre todos. **Archivos**: PDFs, mapas, entradas (hasta ~5 MB), se abren con el share sheet nativo.

### 📅 Disponibilidad grupal (AvailabilityHeatmap — modal del plan)
Cada uno marca sus días en Calendario → Mi disponibilidad. El plan muestra un **heatmap**: más teal = más gente libre ese día, con el podio de las 3 mejores fechas del mes.

---

## 7. Integración de IA (Google Gemini)

`apps/api/src/routes/ai.ts` — usa el tier **gratuito** de Gemini vía REST directo (sin SDK):

- Modelo: **`gemini-flash-latest`** (el alias con cuota free; `gemini-2.0-flash` devolvía 429 con límite 0).
- `thinkingBudget: 0` para respuestas rápidas.
- **Sin** `responseSchema` (colgaba las requests): cuando se necesita JSON (sugerencias de checklist) se pide por prompt y se extrae con `extractJson()` tolerante a texto alrededor.
- Endpoints: `POST /ai/assistant/:planId` (pregunta libre con contexto del plan: título, fecha, lugar, miembros, módulos, checklist actual) y `POST /ai/packing-list/:planId` (sugerencias de ítems que no estén ya en la lista).
- Requiere `GEMINI_API_KEY` en el entorno (en Render: pestaña Environment).

---

## 8. Identidad visual y i18n

- **Marca**: logo P-pin (una P que es pin de ubicación), extraído del PDF de identidad a `assets/brand/` (ícono de app, splash, adaptive icon Android, logo blanco). Paleta oficial: naranja/petróleo/teal/hielo. Tipos: Poppins + Montserrat.
- **Splash**: pantalla petróleo con el logo pulsando (Animated) antes del login.
- **Banners de plan**: foto 16:9 (crop nativo con zoom) + LinearGradient oscuro para que el texto blanco se lea sobre cualquier imagen.
- **Modo oscuro**: paleta petróleo profundo; toggle en Configuración; persiste.
- **Idiomas**: EN/ES completo (todas las pantallas, módulos, alerts y permisos). El calendario cambia meses y días (L M X J V S D).

---

## 9. Autenticación y seguridad

1. **Registro**: email + contraseña (bcrypt, 10 rounds) + nombre + **username obligatorio** → se asigna tag `#0000-9999` único para ese username.
2. **Login**: valida hash → emite JWT (30 días) → se guarda en SecureStore → auto-login en cada apertura.
3. **Biometría**: si activás el candado, al abrir la app aparece una pantalla de bloqueo que pide Face ID/huella (`expo-local-authentication`) antes de mostrar nada.
4. **Privacidad**: el email solo lo ve su dueño (nunca aparece en búsquedas ni perfiles ajenos). Los perfiles solo son visibles si compartís plan, grupo o amistad.
5. **Autorización**: cada endpoint verifica membresía/rol (p. ej. solo admin borra el plan, solo autor o admin borra una foto).

---

## 10. Deploy y builds

### Backend en Render
- Servicio Node conectado al repo de GitHub → **auto-deploy con cada push a main**.
- Build command: instala workspace del api + `npm run build`, que ejecuta `prisma generate && prisma migrate deploy && tsc` → **las migraciones corren solas en cada deploy**.
- Variables de entorno necesarias: `DATABASE_URL`, `JWT_SECRET`, `GEMINI_API_KEY`.
- Plan free: el server **duerme tras ~15 min** sin tráfico (primer request tarda 30-60s) y la base tiene 1 GB.

### App: Expo Go vs build nativo
- **Desarrollo**: Expo Go apuntando a Render (vía `EXPO_PUBLIC_API_URL` en `apps/mobile/.env`) o al API local.
- **Producción**: builds con **EAS** (`eas.json`: canales development/preview/production, autoIncrement de versión). `eas build -p ios --profile production` + `eas submit` → TestFlight. Bundle ID: `com.agustintoval.planit`.
- Cosas que SOLO existen en el build nativo: push notifications, ícono de la app, splash nativo, Face ID real, y (futuro) Google/Spotify OAuth.

---

## 11. Qué queda pendiente (resumen del BACKLOG)

- **OAuth**: login con Google, Google Calendar y conexión Spotify (necesitan credenciales en Google Cloud / Spotify Developers + segundo build).
- **Walkie en background**: hoy llega push con sonido; la reproducción automática con la app cerrada requiere notificaciones de audio nativas (iteración futura).
- **Sonidos in-app** propios (enviar/recibir mensaje) y tono personalizado.
- **EAS Update** (OTA): los canales ya están configurados; tras el primer build, los cambios de JS se pushean sin rebuild.
