# PlanIt — Documento de contexto del proyecto

> **Propósito**: que cualquier persona (o una nueva sesión de Claude Code sin contexto) pueda entender el proyecto completo y continuar el desarrollo exactamente como se venía haciendo. Leélo entero antes de tocar código.

---

## 1. Qué es PlanIt

App móvil (iOS + Android) para que **grupos de amigos organicen planes juntos**: desde un partido de fútbol hoy a la tarde hasta un camping de una semana. Reemplaza el combo caótico de "grupo de WhatsApp + Splitwise + planilla + playlist" con una sola app donde **el plan es el centro** y le enchufás módulos según lo que necesites.

**Dueño del proyecto**: Agustín Toval (`agntoval@gmail.com`, GitHub: `AgustinToval`). Es su primera experiencia en Windows (venía de macOS); el entorno de desarrollo se montó desde cero en esta colaboración. Habla español — **responderle en español**. Está aprendiendo: explicar decisiones técnicas en lenguaje claro y avisarle los pasos manuales que le tocan (comandos con `sudo`, reiniciar Expo, etc.).

**Repo**: `github.com/AgustinToval/PlanIt` (push por SSH ya configurado).
**Ubicación local**: `/home/agust/projects/PlanIt` **dentro de WSL Ubuntu** (Windows 11). Desde Windows: `\\wsl.localhost\Ubuntu\home\agust\projects\PlanIt`.

### Conceptos del producto

- **Plan** = evento independiente (NO pertenece a un grupo). Tiene título, fecha (formato DD/MM), lugar, tipo (`full` o `quick` = mismo día), miembros invitados y **módulos**.
- **Grupo** = solo gente + chat grupal. Sirve para invitar "en bloque" a un plan.
- **Módulos** = pestañas que se agregan a cada plan a demanda (el plan nace solo con Chat). Son 11, todos implementados (ver §5).
- **Roles por plan**: creador = 👑 admin; puede nombrar 🛠️ helpers (gestionan módulos, editan el plan); resto = members (participan pero no administran). En grupos: admin/member.
- **Invitaciones = solicitudes**: invitar a alguien a un plan/grupo NO lo une automáticamente; le llega a su pantalla 🔔 Notifications y debe aceptar (miembros con `status: "invited"` no ven nada del plan hasta aceptar). El **código/link de invitación** sí une directo (se comparte a propósito). Deep links: `planit://join/plan/<code>` y `planit://join/group/<code>` (ruta `app/join/[kind]/[code].tsx`, helper en `lib/invite.ts`).
- **Amistades**: por solicitud (agregás por email o username → el otro acepta). Los amigos pueden ver el perfil del otro (email, bio, ubicación, stats).

---

## 2. Stack y arquitectura

```
Monorepo (npm workspaces)
PlanIt/
├── apps/
│   ├── api/        Express + TypeScript + Prisma + PostgreSQL + Socket.io
│   │   ├── prisma/schema.prisma      (16+ migraciones aplicadas)
│   │   └── src/
│   │       ├── server.ts             (registra todas las rutas; exporta `io`)
│   │       ├── lib/prisma.ts · lib/touch.ts (tracking de actividad)
│   │       ├── middleware/auth.ts    (JWT Bearer)
│   │       └── routes/  auth, users, groups, plans, messages, expenses,
│   │                    friends, checklist, activities, votes, gallery,
│   │                    playlist, files, availability, ai (Gemini), voice
│   └── mobile/     Expo SDK 54 + React Native + expo-router + Zustand
│       ├── app/    (tabs)/index=Plans · groups · calendar · profile
│       │           plan/[id] · group/[id] · create-plan · create-group ·
│       │           friends · notifications · edit-profile · join/[kind]/[code]
│       ├── components/plan/  Expenses, Checklist, Activities, Votes,
│       │                     Gallery, Playlist, Meetup (+MeetupMap.native),
│       │                     Files, WalkieTalkie, AvailabilityHeatmap
│       ├── hooks/useAuthStore.ts     (Zustand; token en SecureStore / localStorage web)
│       └── lib/api.ts (axios + JWT) · socket.ts · invite.ts
└── package.json
```

**Decisiones clave y por qué:**

- **Expo SDK 54 exactamente** — es lo que soporta el Expo Go del iPhone del usuario. NO subir de SDK sin verificar su Expo Go. `"main": "expo-router/entry"` en package.json es obligatorio (sin eso la app no carga).
- **Backend local en WSL** con **mirrored networking** (`C:\Users\agust\.wslconfig` → `networkingMode=mirrored`): el teléfono llega a la API por la IP LAN de la PC. `lib/api.ts` deriva la URL base del host del bundler de Expo (`Constants.expoConfig.hostUri` → `http://<ip>:4000/api`); en web usa `localhost:4000`.
- **Auth**: email + contraseña con bcrypt, JWT 30 días. **Google Sign-In NO funciona en Expo Go** (verificado en docs oficiales de Expo) — queda para el build nativo. Ya existe un Client ID web de Google creado por el usuario (proyecto "PlanIt" en Google Cloud Console).
- **IA = Google Gemini (GRATIS)**, NO Anthropic (el usuario no quiere pagar nada). Modelo: **`gemini-flash-latest`** — ojo: `gemini-2.0-flash` devuelve 429 `limit: 0` con su clave. NO usar `responseSchema` (cuelga al modelo) — se pide JSON por prompt y se parsea con `extractJson()`. `thinkingConfig: { thinkingBudget: 0 }` para velocidad; retry ante 429/503; timeout 30s backend / 40s app. Clave en `apps/api/.env` → `GEMINI_API_KEY` (no está en git).
- **Archivos/fotos/audio como data-URLs base64 en Postgres** (límite ~7-8MB; `express.json({ limit: "8mb" })`). Suficiente para desarrollo; migrar a Cloudinary/S3 al escalar.
- **Tiempo real**: Socket.io con rooms `plan:<id>` y `group:<id>`. Eventos: `message:new`, `expense:added/removed`, `checklist:changed`, `activities:changed`, `votes:changed`, `gallery:changed`, `playlist:changed`, `files:changed`, `notes:changed`, `meetup:changed`, `location:changed`, `voice:new`. Las rutas importan `io` desde `../server` (import circular que funciona bien con CommonJS).
- **Actividad/no-leídos**: `Plan.lastActivityAt` + `Plan.moduleActivity` (JSON por módulo) actualizados por `lib/touch.ts`; `PlanMember.moduleSeen` (JSON) y `GroupMember.lastSeenAt` marcan lo visto → listas ordenadas por actividad + puntitos rojos por tarjeta y por pestaña de módulo. Endpoints `POST /plans/:id/seen` y `POST /groups/:id/seen`.

### Modelos Prisma (resumen)

`User` (password bcrypt nullable, avatar base64, bio, location) · `Friendship` (status pending/accepted) · `Group` + `GroupMember` (role, muted, status invited/member, lastSeenAt) · `Plan` (groupId opcional/legacy, inviteCode, notes, lastActivityAt, moduleActivity) + `PlanMember` (rsvp, role admin/helper/member, status invited/member, meetupStatus, lat/lng/locationAt, moduleSeen) · `PlanModule` (type, unique por plan) · `Message` (de plan o de grupo) · `Expense` + `ExpenseSplit` (settled por persona) · `CheckItem` · `Activity` · `Vote` (options/results JSON) · `Photo` · `Song` (source spotify/youtube, votes JSON) · `PlanFile` · `VoiceClip` (máx 30 por plan, el backend poda) · `PlanTemplate` (snapshot JSON) · `Availability` (date string "YYYY-MM-DD", status free/maybe/busy, unique userId+date) · `Reminder` (modelo existe, SIN endpoints aún).

---

## 3. Cómo se corre (entorno del usuario)

```bash
# Terminal Ubuntu 1 — API (pide contraseña sudo para PostgreSQL)
bash /mnt/c/Users/agust/start-api.sh
# = sudo service postgresql start + npm run dev (nodemon) en apps/api

# Terminal Ubuntu 2 — app
cd ~/projects/PlanIt/apps/mobile && npx expo start        # (--clear si hay caché rara)
# iPhone: escanear QR con Expo Go (mismo WiFi). Web: http://localhost:8081

# Respaldo a GitHub (recordárselo seguido — se olvida)
bash /mnt/c/Users/agust/commit-planit.sh
```

- PostgreSQL local: db/usuario/contraseña = `planit`/`planit`/`planit`. Se cae con cada reinicio de WSL → siempre `sudo service postgresql start` primero.
- **Cuentas de prueba** (contraseña `testpass123` en todas): `agntoval@gmail.com` (la principal — sugerirle cambiar la contraseña), `friend@test.com` ("Amigo Test"), `amigo2@test.com` ("Segundo Amigo"). Datos de prueba: planes "Asado de prueba" y "Pesca", plantilla "Asado clásico".
- `.env` de la API: `DATABASE_URL`, `JWT_SECRET`, `WEB_URL`, `PORT=4000`, `GEMINI_API_KEY`.

### Convenciones de trabajo de esta colaboración (IMPORTANTE para Claude)

1. **Los archivos del repo se editan por la ruta UNC** `\\wsl.localhost\Ubuntu\home\agust\projects\PlanIt\...` con Read/Edit/Write.
2. **Comandos en WSL**: escribir un script `.sh` en `C:\Users\agust\<nombre>.sh` (con `export NVM_DIR="$HOME/.nvm"` + source de nvm si usa node/npm/npx) y ejecutarlo con PowerShell: `wsl.exe -d Ubuntu bash /mnt/c/Users/agust/<nombre>.sh`. **NO** pasar comandos inline complejos por `wsl.exe bash -c` — el quoting con paréntesis/comillas se rompe.
3. **Nada de `sudo` desde Claude** — requiere contraseña interactiva; pedirle al usuario que lo corra él.
4. **Verificar todo contra la API real** tras cada feature: login (curl desde WSL o Invoke-RestMethod) → probar endpoints (casos felices Y de permisos) → limpiar datos de prueba creados. Si PowerShell no llega a `localhost:4000`, probar con curl dentro de WSL antes de asumir que la API está caída (el bridge a veces falla).
5. **Migraciones**: editar `schema.prisma` → script con `npx prisma migrate dev --name <nombre>` + `npx prisma generate`. Tras un `npm install` grande puede hacer falta regenerar el cliente Prisma (error "did not initialize yet").
6. **UI**: dark theme fijo — fondo `#0f172a`, tarjetas `#1e293b`, acento índigo `#6366f1`, violeta IA `#7c3aed`, verde `#22c55e`, rojo `#ef4444`. Modales tipo bottom-sheet. Emojis como íconos. UI en inglés (nunca pidió cambiarla), conversación en español.
7. **Patrones móviles ya establecidos**: updates optimistas + `load()` de respaldo; `useFocusEffect` para recargar al volver a una pantalla; `keyboardDismissMode="on-drag"` + `keyboardShouldPersistTaps="handled"` en todo scroll con inputs; modales con inputs envueltos en `KeyboardAvoidingView` + `TouchableWithoutFeedback (Keyboard.dismiss)` — **al usuario le molestó mucho el teclado que tapaba forms o no se podía cerrar; cuidar esto en cada form nuevo**; timeouts largos (30-40s) para llamadas de IA; código nativo-only en archivos `.native.tsx` (ej. `MeetupMap`) para no romper el bundle web.

---

## 4. Pestañas de la app

- **🗓️ Plans** (home): mis planes ordenados por última actividad, puntito rojo si hay algo sin ver, 🔔 con badge (solicitudes de amistad + invitaciones a grupos + invitaciones a planes), botón + New.
- **👥 Groups**: mis grupos (orden por actividad, puntito de chat no leído). Dentro: chat en vivo, lista de miembros, ⚙️ (mute / leave / delete si admin), invitar.
- **📅 Calendar**: vista mensual propia (sin librerías) con dos modos — "My plans" (puntos por día; tocar día = lista de planes) y "My availability" (tocar día cicla 🟢 libre → 🟡 quizás → 🔴 ocupado → nada).
- **👤 Profile**: avatar (foto base64 con recorte cuadrado), nombre/@username/bio/ubicación, Friends, Edit Profile (+ cambio de contraseña con verificación de la actual), Notifications, Spotify/GCal (placeholders "coming with native build"), Sign Out.

### Pantalla de plan (`app/plan/[id].tsx` — el archivo más grande)

Header: ‹ Back · 🤖 (asistente IA) · 📅 (heatmap de disponibilidad grupal con 🥇🥈🥉 mejores fechas del mes) · 👥 N (miembros: RSVP, roles, "Make helper" si admin, invitar amigos —con solicitud—, 🔗 share invite link) · ⚙️ (guardar como plantilla / borrar plan si admin). Fila RSVP (✅ I'm in / 🤔 Maybe / ❌ Can't). Pestañas de módulos scrolleables con puntito rojo de no-visto (se marca visto al abrir — estado local `seenLocal` + POST seen; los sockets "bumpean" `moduleActivity` local para que el puntito aparezca en vivo). ＋ para agregar módulos solo visible para admin/helper; long-press en una pestaña la quita.

---

## 5. Los 11 módulos (todos funcionan)

| Módulo | Esencia | Detalles no obvios |
|---|---|---|
| 💬 Chat | Siempre presente, tiempo real | burbujas propias índigo |
| 💸 Expenses | Gastos divididos | división exacta al centavo (reparte el resto de a centavo); cada uno tilda su parte como pagada (fila expandible; el resumen excluye lo saldado); "Settle up" = transferencias mínimas (greedy); modo "Everything ÷ everyone"; borrar = pagador o admin |
| 🛒 Packing List | Checklist compartida | "I got it" para reclamar ítems; barra de progreso; toggle "Hide packed"; **✨ AI** genera ítems con Gemini (modal de selección); orden estable por createdAt (al usuario le molestaba que saltaran); borrar = admin/helper |
| 📋 Activities | Cronograma ordenado | hora opcional HH:MM; reordenar ▲▼ = admin/helper; marcar hecho = todos |
| 🗳️ Quick Vote | Votaciones | 2-6 opciones, barras de % en vivo, se puede cambiar el voto, cerrar (long-press, admin/helper) marca 🏆 |
| 📸 Gallery | Álbum del plan | grid 3 columnas, visor fullscreen, **⬇️ Save** al carrete (expo-media-library), borrar = autor/admin, límite ~7MB |
| 🎵 Playlist | Links Spotify + YouTube Music | detecta fuente por URL (acepta tracks/álbums/playlists), ranking colaborativo con votos ▲▼ (agregar = +1 propio), tocar abre la app externa |
| 📍 Meetup | Estados + **mapa en vivo** | 🏠🚗✅ + "Share my live location" (expo-location watch cada 8s/25m, opt-in, se borra al parar); mapa Apple Maps con pins (`MeetupMap.native.tsx`; web muestra aviso); ubicaciones >10 min se consideran viejas |
| 📎 Files & Notes | Archivos + notas | notas compartidas con auto-guardado (debounce 800ms) y sync en vivo; archivos vía document picker, abrir = share sheet de iOS; el listado no trae el payload (data solo al abrir) |
| 🤖 IA (botón de header, no pestaña) | Asistente del plan | Gemini con contexto completo del plan + **manual de uso de la app** en el system prompt (responde "¿cómo divido gastos?" además de dar sugerencias) |
| 🎙️ Walkie Talkie | Push-to-talk estilo Zello | mantener = grabar (expo-av HIGH_QUALITY), soltar = enviar (m4a base64); **auto-reproducción** de entrantes (suena aun en modo silencio); toggle auto-play; **🔕 Mute** individual o "Mute everyone" (estado local, con refs para que el handler del socket lea valores actuales); historial 30 clips; <1s no se envía. **NO suena con pantalla bloqueada** — límite de Expo Go, necesita push/build nativo; `UIBackgroundModes: ["audio"]` ya quedó en app.json |

**Extras transversales**: plantillas de plan (⚙️ → guardar; "Start from a template" al crear, vía `POST /plans/templates/:id/use` que crea plan + módulos + checklist + actividades); al crear un plan se eligen grupos y/o amigos con pickers buscables (escalan a muchas entradas); alert post-creación ofrece el link **solo si no se invitó a nadie**; fecha DD/MM (asume el año siguiente si ya pasó).

---

## 6. Problemas ya resueltos (para NO repetirlos)

- **Expo Go "project is incompatible"** → el proyecto estaba en SDK 56; se bajó a 54 con `expo install --fix` + clean install con `--legacy-peer-deps`. Mantener 54.
- **La app no cargaba nunca** → faltaba `"main": "expo-router/entry"` y sobraban `App.tsx`/`index.ts` del template; conflicto de rutas `(auth)/index` vs `(tabs)/index` → el login es `(auth)/sign-in` + `Stack.Protected` con guard por token en `_layout.tsx`.
- **QR no conectaba** → ngrok caído + WSL en NAT → solución definitiva: mirrored networking + teléfono en el mismo WiFi.
- **`expo-status-bar` en `plugins` de app.json** rompe el arranque (no es config plugin) — no volver a agregarlo.
- **react-native-maps rompe el bundle web** → separar en `.tsx` (fallback web) y `.native.tsx`.
- **"Unauthorized" en la app** tras cambiar el sistema de auth → token viejo guardado; solución: Sign Out + login de nuevo.
- **"AI request failed"** → era el timeout default de 10s de axios, no la IA; las llamadas de IA usan `{ timeout: 40000 }`.
- **PowerShell→localhost:4000 a veces no responde** aunque la API esté viva — verificar con curl dentro de WSL antes de asumir API caída.
- `/users/me` devolvía el hash de contraseña al agregar el campo → usar siempre `select` explícito en rutas de users.
- El teclado numérico de iOS no tiene Enter → botón "OK" al lado de inputs numéricos + tap-fuera + drag para cerrar.

---

## 7. Roadmap pendiente (en orden acordado)

1. **Build nativo con EAS** ← *siguiente paso acordado con el usuario*. Necesita cuenta gratis en expo.dev. Desbloquea: **push notifications** (muy pedidas: mensajes, invitaciones, gastos — la infraestructura de "qué cambió y quién no lo vio" ya existe), **walkie talkie con pantalla bloqueada** (push + background audio), **Google Sign-In real** (Client ID web ya creado; falta el flujo nativo), **Spotify OAuth** (reproducción real en playlist), y links de invitación universales (hoy `planit://` solo funciona con la app instalada; para gente sin la app hace falta publicar + página web de aterrizaje).
2. **Deploy del backend** (Railway/Render + Postgres gestionado) — hoy todo corre en la PC del usuario; sin esto la app solo funciona en su WiFi.
3. **IA fase 2** (la base ya está): sugerencia inteligente de fechas (el endpoint de disponibilidad grupal ya calcula todo), recap de plan al terminar, categorizador automático de gastos.
4. Mencionado y no hecho: recordatorios (`Reminder` existe en el schema sin endpoints), stats de grupo, Google Calendar sync, migrar media a Cloudinary.

## 8. Estado actual

App **completa y funcional en desarrollo local**: 11 módulos, auth segura, roles, invitaciones con aceptación, notificaciones in-app con badge, calendario + disponibilidad con heatmap grupal, IA gratis con Gemini, deep links, plantillas, no-leídos en tiempo real. Todo se verificó endpoint por endpoint durante el desarrollo. Lo que falta es exclusivamente lo que Expo Go no permite (push, OAuth nativo, audio en background) y salir de la PC local (deploy + tiendas).
