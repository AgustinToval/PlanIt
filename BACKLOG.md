# PlanIt — Backlog

Pedidos del 2026-07-14. Orden de trabajo acordado: **remake visual primero**, después build nativo (push + walkie background), después stores. Estado: ya subido a TestFlight (cuenta Apple Developer paga ✅). Backend deployado en Render (plan 1 GB).

## A. Remake visual (EN CURSO)
- [ ] Theme central (`apps/mobile/lib/theme.ts`): paleta de marca (#F77F00 / #0B3954 / #0892A5 / #E8F1F2), Poppins + Montserrat, espaciado, sombras.
- [ ] Eliminar emojis innecesarios en toda la app → íconos de línea (SVG).
- [ ] Pantalla Plans: cards SIN emojis de módulos. Mostrar solo: tipo (quick/plan), título, fecha/hora, ubicación, descripción (si hay), "X in / Y miembros".
- [ ] Banner de plan: admin/helper puede subir imagen desde config del plan → aparece de fondo en la card (rectángulo redondeado, foto oscurecida para legibilidad). Al elegir la foto: recortar / zoom con preview de cómo queda.
- [ ] Foto de perfil de grupo (circular, sin banner).
- [ ] Splash animado con el logo P-pin al abrir la app (antes del login).
- [ ] Migrar pantalla por pantalla al theme nuevo.

## B. Almacenamiento / Render (1 GB — optimizar)
- [ ] Hoy TODO va como base64 a Postgres (avatares, galería, archivos, audios walkie). Con 1 GB eso se agota rápido.
- [ ] Comprimir imágenes en el cliente antes de subir (resize ~1080px + JPEG ~70%) con expo-image-manipulator.
- [ ] Fotos del módulo Gallery: guardarlas LOCALMENTE en el celular de cada uno (no en el server). El server solo coordina metadata/quién compartió.
- [ ] Límite de tamaño por archivo + limpieza de audios walkie viejos (TTL).
- [ ] Evaluar mover binarios a un storage gratuito (p.ej. Cloudinary free tier) si no alcanza.
- [ ] Se creó `.env` en apps/mobile (URL del API en Render). No commitear.

## C. Social: perfiles, usernames, amigos
- [ ] Username ÚNICO con código `#` (ej: agus#4821) asignado al crear la cuenta.
- [ ] Buscar amigos por username (hoy solo funciona por mail) → mostrar resultados coincidentes con foto y username#código.
- [ ] Privacidad: el mail de cada usuario lo ve SOLO el dueño de la cuenta. Nunca otros.
- [ ] Perfil público tocable: clic en el nombre de alguien en el chat o en la lista de miembros (plan o grupo) → ver su perfil (foto, username#, descripción) + botón "Agregar como amigo".
- [ ] Agregar amigos desde dentro de un plan/grupo (no solo por link).
- [ ] Grupos: poder agregar amigos de la app una vez creado el grupo (como en planes) → le llega notificación preguntando si quiere unirse.

## D. Chat UX (estilo WhatsApp)
- [ ] Teclado: al abrirlo NO se tapan los últimos mensajes (quedan visibles arriba del teclado) y sigue auto-scrolleando si llegan nuevos.
- [ ] Con teclado cerrado: navegación libre por el historial; si estás al final, auto-scroll con mensajes nuevos.
- [ ] Flechita flotante (esquina inferior derecha) para volver al último mensaje.
- [ ] Indicador "escribiendo..." (puntitos) cuando alguien tipea.
- [ ] Cada usuario con un color propio + su foto/avatar al costado del mensaje.
- [ ] Clic en el nombre en el chat → abre su perfil (ver sección C).

## E. Notificaciones + sonidos (requiere build nativo)
- [ ] Push al celular de TODO lo que llega a la campanita: solicitudes de amistad, invitaciones a plan/grupo. Ej: "Tienes una solicitud de amistad de {nombre}", "{nombre} te ha invitado a unirte al plan {título}".
- [ ] Walkie talkie en segundo plano: se escucha sin estar en la app, prende la pantalla y muestra notificación con nombre del plan + quién habla.
- [ ] Tono de mensaje propio de la app + sonidos in-app (enviar/recibir mensaje).

## F. Auth y sesión
- [ ] Login con Google (requiere build nativo).
- [ ] Recordar usuario y contraseña + entrar con biometría (Face ID / huella) para no loguearse cada vez.

## G. Perfil / Configuración
- [ ] Edit profile → "tap to change photo": sacar foto con cámara O elegir de galería.
- [ ] Configuración dentro de Perfil: modo oscuro / modo claro.
- [ ] Configuración: cambiar idioma a Español (i18n ES/EN).

## H. Playlist
- [ ] Conectar el módulo playlist directo al servicio de cada uno (Spotify / YouTube Music). Spotify OAuth requiere build nativo.

## Dependencias del build nativo (EAS)
Push notifications, walkie background, Google login, Spotify OAuth → todo eso se desbloquea junto en la fase 2.
