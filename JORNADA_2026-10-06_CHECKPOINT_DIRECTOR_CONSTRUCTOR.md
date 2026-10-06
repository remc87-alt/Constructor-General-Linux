# Constructor General Linux · Checkpoint Director ↔ Constructor · 2026-10-06

## 0. PROPÓSITO DE ESTE CHECKPOINT

Este documento consolida el estado operativo REAL alcanzado hasta el 2026-10-06 en el frente:

ChatGPT Director
→ Secure MCP Tunnel
→ Constructor General Linux / adaptador MCP
→ OpenCode
→ ejecución
→ recuperación / retorno hacia ChatGPT Director

Su objetivo principal es permitir un reenganche determinista desde GitHub sin depender de memoria de chat y, especialmente, evitar repetir pruebas ya cerradas.

REGLA DE PRECEDENCIA:

EVIDENCIA MÁS RECIENTE
+
EVIDENCIA HISTÓRICA NO CONTRADICHA
=
CANON OPERATIVO ACTUAL

Los documentos históricos anteriores NO se eliminan. Este checkpoint los complementa y, cuando existe nueva evidencia, corrige su interpretación.

IMPORTANTE:

- "implementado" NO significa "demostrado E2E";
- "running" NO significa progreso semántico;
- misión recuperable NO demuestra ejecución continua durante ausencia del Director;
- get_mission NO equivale a retorno automático espontáneo;
- events/list NO equivale a events/subscribe;
- una capacidad declarada NO equivale a una capacidad registrada por el producto;
- memoria de ChatGPT NO sustituye evidencia física del repositorio/runtime.

---

# 1. IDENTIDAD Y ALCANCE

Repositorio canónico:

remc87-alt/Constructor-General-Linux

Checkout físico utilizado:

/home/rodrigo_mella/opencode-constructor-e2e

Adaptador MCP:

/home/rodrigo_mella/opencode-constructor-e2e/mcp-opencode-adapter

Branch:

main

Último commit canónico previo a los cambios locales actuales:

da69ea7
Update KIT_USAGE.md with validation evidence from canary test

Constructor General Linux es un proyecto independiente.

RESTRICCIÓN HISTÓRICA DE ESTE FRENTE:

- no modificar Empresa-IA;
- no mezclar decisiones arquitectónicas de Empresa-IA con este cierre;
- este checkpoint trata exclusivamente del frente Director ↔ Constructor Linux y su retorno/continuidad.

---

# 2. ARQUITECTURA FÍSICA DEMOSTRADA

Flujo base:

Rodrigo
→ ChatGPT Director
→ Secure MCP Tunnel
→ WSL
→ adaptador MCP
→ OpenCode Server
→ FreeLLMAPI / modelo
→ adaptador MCP
→ ChatGPT Director

Herramientas MCP demostradas:

- start_mission
- continue_mission
- get_mission
- reply_permission

Entorno conocido:

- Ubuntu sobre WSL2
- OpenCode 1.18.34
- Node 22.23.2
- npm 10.9.8
- @modelcontextprotocol/server 2.3.1
- tsx 4.23.15
- zod 4.6.5

Dependencias incorporadas localmente para MCP Events / webhook:

- ipaddr.js 2.5.0
- standardwebhooks 1.1.1

Secure MCP Tunnel conocido:

tunnel_id:
tunnel_6ac2f4a0837c8191b3bdcaf04f49a5ed

nombre:
Empresa-IA Constructor Linux

tunnel-client observado:
0.0.15+a390c168ff1b2d14e73a95991c186c6aba3ff5a0

Perfil STDIO estable:

/home/rodrigo_mella/.config/tunnel-client/opencode-adapter.yaml

Perfil HTTP experimental:

/home/rodrigo_mella/.config/tunnel-client/opencode-adapter-http-test.yaml

---

# 3. SEMÁFORO ACTUAL

## 🟢 DEMOSTRADO / APROBADO

### 3.1 Director → Secure MCP Tunnel → Constructor/OpenCode

PASS.

El puente funcional Director → Constructor fue demostrado físicamente.

No repetir como POC básico salvo regresión real.

### 3.2 Creación y recuperación de misión

PASS.

ChatGPT puede trabajar con una misión del Constructor mediante las herramientas MCP disponibles.

### 3.3 Persistencia de mission_id

PASS.

Una misión existente puede ser recuperada posteriormente.

### 3.4 Persistencia de session_id OpenCode al continuar misión

PASS.

Canary conocido:

mission_id:
director-constructor-e2e-canary-20261005

session_id:
ses_ef289cc1cffe3hAJA71nOLGKKb

continue_mission reutilizó exactamente la misma sesión.

### 3.5 continue_mission sobre misión existente

PASS.

No es necesario crear una nueva misión para continuar trabajo compatible con la misión existente.

### 3.6 Recuperación después de fallo del turno del Director

PASS para recuperación de identidad/estado.

Durante una experiencia posterior, el turno de ChatGPT terminó con:

"Error en la transmisión de mensajes"

Después del fallo fue posible recuperar:

- mismo mission_id;
- mismo session_id;
- último resultado disponible;
- estado de misión;
- permisos pendientes cuando existían.

ESTO NO DEMUESTRA que OpenCode haya seguido trabajando durante todo el período en que ChatGPT estuvo desconectado.

### 3.7 Supervisión multi-iteración mientras el Director permanece activo

PASS.

Se observó que ChatGPT Director pudo permanecer activo durante una ejecución prolongada, aproximadamente 18–22 minutos, realizando múltiples interacciones con el Constructor.

Durante ese período pudo:

- consultar estado;
- evaluar resultados;
- detectar evidencia insuficiente;
- corregir curso;
- continuar la misma misión;
- evaluar permisos;
- aprobar acciones de lectura de bajo riesgo;
- contrastar resultados.

Esto demuestra que el Director puede ejercer supervisión activa durante un turno sin necesitar obligatoriamente otro planificador externo para cada iteración.

### 3.8 Due diligence del Director sobre resultado del Constructor

PASS.

En una auditoría posterior, el Constructor inicialmente mezcló evidencia de un checkout/repositorio incorrecto.

El Director NO aceptó ese resultado como verdad.

Solicitó continuar la misma misión hacia el checkout canónico correspondiente y contrastó evidencia antes de aceptar conclusiones.

Conclusión:

Constructor/OpenCode ejecuta e informa.

ChatGPT Director conserva la responsabilidad de razonar, validar evidencia y decidir.

### 3.9 Gestión selectiva de permisos de bajo riesgo

PASS parcial-operativo suficiente para demostrar la capacidad del Director mientras está activo.

El Director pudo revisar comandos de lectura antes de autorizarlos y aprobar permisos puntuales sin intervención humana para cada lectura.

Esto NO autoriza permisos globales ni elimina controles.

### 3.10 MCP Events capability + events/list en servidor

PASS físico del servidor/adaptador.

El servidor declara protocolo:

2026-07-28

y:

capabilities.events = {}

events/list fue físicamente invocado.

El adaptador devolvió cuatro eventos:

- mission.completed
- mission.failed
- mission.blocked
- permission.required

### 3.11 Subscription store local

PASS de pruebas locales realizadas anteriormente.

Existe implementación local:

mcp-opencode-adapter/src/subscription-store.ts

El estado runtime `.subscriptions.json` no debe versionarse.

### 3.12 Seguridad webhook local

PASS de pruebas locales realizadas anteriormente.

Existe implementación local:

mcp-opencode-adapter/src/webhook-security.ts

Se utiliza Standard Webhooks y controles SSRF.

No reemplazar por HMAC artesanal sin nueva justificación.

### 3.13 HTTP local server/discover + events/list

PASS local.

El transporte HTTP experimental llegó a responder localmente:

- server/discover;
- events/list;
- catálogo de cuatro eventos.

### 3.14 Regresión STDIO después de cambios HTTP

PASS.

Los cambios experimentales HTTP no invalidaron el funcionamiento STDIO comprobado.

### 3.15 Recuperación posterior del bridge STDIO estable

PASS.

Después de cerrar el laboratorio HTTP se levantó nuevamente el perfil STDIO estable.

Se observó una nueva instancia del tunnel-client y:

GET 127.0.0.1:8080/readyz

→ HTTP 200 OK

Por lo tanto, el bridge STDIO volvió a estado operativo.

---

# 4. 🟡 PARCIALMENTE DEMOSTRADO / HIPÓTESIS ABIERTAS

## 4.1 Persistencia de ejecución durante ausencia del Director

PARCIAL / NO CONCLUIR DE MÁS.

Está demostrado que mission_id/session_id y estado recuperable sobrevivieron al fallo del turno de ChatGPT.

NO está demostrado que OpenCode haya seguido ejecutando trabajo útil durante todo el intervalo de desconexión.

No confundir:

persistencia de registro/estado

con:

ejecución autónoma continua.

## 4.2 Estado `retry`

Existe evidencia física de que get_mission devolvió literalmente:

status: retry

No fue una interpretación verbal de ChatGPT.

Secuencia observada:

get_mission
→ retry

continue_mission
→ running

get_mission posterior
→ retry

El contenido semántico retornado permaneció esencialmente igual.

Por tanto:

- `retry` existe en la interfaz observada;
- `running` no garantiza progreso semántico;
- la causa/origen exacto de `retry` NO está demostrada.

No sabemos todavía si `retry` representa:

- estado nativo de OpenCode;
- estado del adaptador;
- recuperación de transporte;
- reintento interno;
- estado stale retenido;
- otra causa.

## 4.3 Detección de falta de progreso por el Director

PARCIALMENTE DEMOSTRADA.

Mientras está activo, el Director fue capaz de observar repetición de resultado y detener un bucle de continuaciones.

No existe todavía evidencia de un mecanismo automático y determinista de stall detection cuando el Director no está activo.

## 4.4 HTTP post-fix a través de Secure MCP Tunnel

PARCIAL / ABIERTO.

Se encontró un defecto real:

el bridge Node HTTP → Fetch devolvía JSON sin Content-Type.

Esto explicaba el error histórico:

unsupported content type ""

El código local fue corregido para propagar headers y utilizar fallback:

application/json

La corrección fue demostrada localmente.

Sin embargo, NO quedó demostrada una nueva inicialización completa del tunnel HTTP desde cero posterior al fix.

Por tanto:

- bug Content-Type: identificado;
- fix local: demostrado;
- HTTP completo Tunnel → adapter post-fix: NO demostrado.

## 4.5 Rol final de MCP Events

HIPÓTESIS ABIERTA.

La evidencia actual permite considerar MCP Events como posible mecanismo de:

- notificación;
- reactivación;
- wake-up/fallback cuando el Director deja de estar activo.

NO existe evidencia suficiente para declararlo todavía el mecanismo final.

Tampoco existe evidencia que justifique usar MCP Events como loop principal de supervisión mientras ChatGPT Director ya está activo.

---

# 5. 🔴 FAIL / FALLOS OBSERVADOS

## 5.1 Retorno automático Constructor → Director

P0 ABIERTO.

Todavía NO existe una prueba E2E satisfactoria donde:

Constructor cambia de estado
→ evento real
→ webhook
→ ChatGPT Director es reactivado/notificado
→ Director recibe resultado

sin polling manual.

Por tanto:

RETORNO AUTOMÁTICO = NO CERRADO.

## 5.2 Intentos anteriores de canary de retorno

NO demostraron fallo del webhook.

Razón:

`.subscriptions.json` mostró:

CANTIDAD=0

Nunca existió una suscripción real.

Por tanto, aquellos canaries no probaron delivery.

Interpretación correcta:

NO HUBO SUSCRIPCIÓN
≠
WEBHOOK FALLÓ.

## 5.3 Registro de eventos custom en producto/Work

El servidor declaró events y events/list devolvió correctamente los cuatro eventos.

Sin embargo, el producto/Work no mostró/registró los eventos custom de Empresa-IA Constructor Linux de la forma esperada.

Estado:

NO RESUELTO.

No confundir con fallo del tunnel o del events/list del servidor.

## 5.4 Update Tools sobre transporte HTTP experimental

FAIL histórico.

El intento produjo en UI:

"No se pudo actualizar la aplicación..."

y el tunnel mostró un fallo de initialize antes de events/list.

Posteriormente se encontró el defecto Content-Type descrito en este documento.

El experimento HTTP fue cerrado operacionalmente antes de demostrar un fresh tunnel post-fix.

## 5.5 Turno prolongado del Director

Durante la auditoría posterior, después de aproximadamente 18–22 minutos, ChatGPT mostró:

"Error en la transmisión de mensajes"

La misión pudo recuperarse después.

Esto demuestra recuperación del registro/estado, pero también evidencia que no debemos depender exclusivamente de un turno indefinidamente vivo para continuidad robusta.

## 5.6 Recuperación semántica desde `retry`

FAIL / NO CERRADA.

Después de continuaciones sobre la misma misión:

- apareció `running`;
- posteriormente volvió `retry`;
- el resultado semántico continuó repitiéndose;
- no apareció el informe final esperado;
- no había permiso pendiente al final.

El Director detuvo el ciclo en lugar de continuar indefinidamente.

---

# 6. ⚪ NO DEMOSTRADO

A fecha de este checkpoint NO está demostrado:

1. events/subscribe real desde ChatGPT/producto hacia este complemento.
2. Persistencia real de al menos una suscripción MCP Events.
3. `.subscriptions.json` con una suscripción real generada por el flujo E2E.
4. Entrega webhook E2E real.
5. ChatGPT wake-up/reactivación mediante mission.completed.
6. Reactivación mediante mission.failed.
7. Reactivación mediante mission.blocked.
8. Reactivación mediante permission.required.
9. Retorno automático sin polling.
10. Que OpenCode continúe trabajo útil durante toda una desconexión del Director.
11. Origen exacto del estado `retry`.
12. Recuperación automática e idempotente desde `retry`.
13. Distinción automática robusta entre running/retry/stalled/awaiting_permission/failed.
14. HTTP completo post-Content-Type-fix a través de un tunnel arrancado desde cero.
15. Necesidad real de un supervisor externo adicional.
16. Que MCP Events deba ser el loop principal de supervisión.

No declarar ninguno de estos puntos PASS sin nueva evidencia física.

---

# 7. CORRECCIONES DE INTERPRETACIÓN HISTÓRICA

## 7.1 Documento E2E del 2026-10-05

`E2E_DIRECTOR_CONSTRUCTOR_2026-10-05.md` es evidencia histórica válida del puente y same-session.

Sin embargo, contiene frases como:

"El resultado volvió automáticamente mediante get_mission."

Interpretación actual correcta:

get_mission demuestra recuperación/consulta del resultado mediante herramienta.

NO demuestra retorno espontáneo ni reactivación automática de ChatGPT.

Por tanto:

E2E Director → Constructor = PASS.

same-session = PASS.

retorno automático Constructor → Director = NO demostrado.

No modificar el documento histórico; usar este checkpoint como interpretación posterior.

## 7.2 Canary sin suscripción

La ausencia de retorno de canaries anteriores NO debe utilizarse como evidencia de webhook roto porque nunca existió una suscripción real.

## 7.3 readyz 503 histórico

Un readyz histórico posterior al cambio de código seguía reflejando el resultado de un probe de startup anterior.

Consultar readyz no dispara por sí mismo una nueva negociación MCP.

Por tanto, ese 503 NO demuestra que el fix Content-Type haya fallado.

## 7.4 `retry`

`retry` fue devuelto literalmente por la herramienta.

No reducirlo a una interpretación del Director.

Lo desconocido es su origen y semántica interna.

---

# 8. DO_NOT_REPEAT

Las siguientes pruebas quedan cerradas y NO deben repetirse salvo regresión concreta o modificación relevante de la pieza probada:

1. instalación básica de OpenCode;
2. validación básica FreeLLMAPI;
3. POC calculator;
4. contrato básico de misión;
5. E2E test-002;
6. creación del repositorio GitHub;
7. Director → Constructor connectivity;
8. start_mission como prueba básica de conectividad;
9. same-session E2E;
10. continue_mission para volver a demostrar preservación de session_id;
11. events/list POC;
12. comprobación de que events/list devuelve los cuatro eventos;
13. subscription-store local tests ya realizados;
14. webhook-security local tests ya realizados;
15. local HTTP server/discover;
16. local HTTP events/list;
17. regresión STDIO posterior a cambios HTTP;
18. investigación original del bug Content-Type;
19. prueba local de fallback/propagación application/json;
20. consultar readyz esperando que provoque un probe MCP nuevo;
21. `npx tsc --noEmit` que intenta instalar `tsc@2.0.4`;
22. repetir indefinidamente continue_mission cuando `retry` devuelve el mismo resultado;
23. crear una misión nueva sólo para sustituir una misión existente recuperable;
24. reutilizar PIDs históricos sin reidentificar el runtime actual.

Antes de ejecutar una prueba nueva preguntar:

"¿Esto ya se hizo después del checkpoint?"

Si la respuesta es sí:

NO REPETIR.

---

# 9. REGLA DE PROCESOS / RUNTIME

Nunca confiar en PID, puerto o proceso histórico como si siguiera vigente.

Antes de matar, reiniciar o intervenir un proceso:

PID
→ comando completo
→ CWD/proyecto
→ función
→ decisión

Nunca matar por nombre a ciegas.

Los PIDs y terminales observados en jornadas anteriores son evidencia histórica, no estado runtime actual.

---

# 10. RESPONSABILIDADES QUE LA EVIDENCIA ACTUAL SÍ SOPORTA

## ChatGPT Director

Responsabilidad demostrada:

- definir objetivo;
- mantener alcance;
- razonar;
- revisar evidencia;
- detectar contradicciones;
- corregir curso;
- decidir si una conclusión es válida;
- evaluar permisos mientras está activo;
- detener loops sin progreso;
- decidir Definition of Done.

El Constructor NO sustituye esta función.

## Constructor / OpenCode

Responsabilidad demostrada:

- ejecutar;
- mantener mission_id;
- mantener/reutilizar session_id;
- conservar estado recuperable;
- exponer resultados;
- exponer permisos;
- aceptar continuaciones sobre una misión existente.

El hecho de que Constructor diga PASS no convierte automáticamente el resultado en verdad.

## Secure MCP Tunnel

Demostrado como puente funcional para el flujo STDIO Director ↔ Constructor.

## MCP Events

Implementación/capability/list parcialmente construida y demostrada.

Rol de reactivación todavía pendiente de prueba.

No asignarle responsabilidad arquitectónica definitiva antes del E2E real.

---

# 11. CONTRATO OPERATIVO OBJETIVO

Este contrato representa el comportamiento que se busca consolidar. No significa que todos sus puntos estén ya implementados.

## A. Cuando el Director está ACTIVO

Director:

- razona;
- supervisa;
- valida evidencia;
- decide permisos dentro del mandato;
- corrige rumbo;
- determina cierre.

Constructor:

- ejecuta;
- mantiene identidad de misión/sesión;
- informa estado real;
- entrega resultados y permisos.

No agregar otro cerebro que duplique al Director sin evidencia de necesidad.

## B. Cuando el Director DESAPARECE / TERMINA TURNO

El Constructor debe preservar como mínimo:

- mission_id;
- session_id;
- estado;
- último resultado;
- permisos;
- progreso recuperable.

Debe existir un mecanismo capaz de notificar/reactivar al Director ante cambios relevantes.

MCP Events es candidato.

Aún no demostrado.

## C. Cuando NO HAY PROGRESO

El sistema debe poder diferenciar conceptualmente:

- ejecución activa;
- espera de permiso;
- retry;
- stalled;
- completed;
- failed.

Debe evitar:

continue
→ mismo resultado
→ continue
→ mismo resultado
→ loop infinito.

La implementación exacta todavía debe decidirse con evidencia.

---

# 12. DUE DILIGENCE OBLIGATORIO

Para decisiones relevantes del Constructor:

Constructor
→ evidencia física
→ documentación oficial OpenAI
→ estándar / SDK oficial
→ investigación Internet/GitHub/comunidad cuando corresponda
→ análisis del Director
→ decisión con Rodrigo cuando sea material

No usar memoria de chat como sustituto de evidencia.

No aceptar automáticamente como verdad una conclusión del Constructor.

---

# 13. PERMISOS POR RIESGO

Objetivo operativo:

- prompts/misiones preparados por el Director;
- acciones de bajo riesgo y dentro del mandato pueden ser autorizadas por el Director;
- cambios materiales de riesgo, alcance o seguridad deben detenerse;
- acciones sensibles o irreversibles requieren decisión de Rodrigo.

No implementar:

- permiso global "always";
- eliminación indiscriminada de controles.

La experiencia observada demuestra que el Director puede evaluar permisos puntuales mientras permanece activo.

---

# 14. CAMBIOS LOCALES ACTUALES AÚN NO CANONIZADOS

En el momento de crear este checkpoint, HEAD/origin main permanecían en:

da69ea7

y existían cambios locales en:

mcp-opencode-adapter/.gitignore
mcp-opencode-adapter/package.json
mcp-opencode-adapter/package-lock.json
mcp-opencode-adapter/src/index.ts

además de nuevos archivos:

mcp-opencode-adapter/src/subscription-store.ts
mcp-opencode-adapter/src/webhook-security.ts

Estos cambios contienen trabajo de:

- MCP Events;
- events/list;
- events/subscribe;
- events/unsubscribe;
- subscription store;
- webhook security;
- transporte HTTP experimental;
- fix Content-Type;
- instrumentación asociada.

IMPORTANTE:

La existencia del código NO convierte las capacidades no probadas en PASS.

Antes de canonizar código debe revisarse el diff selectivamente.

No usar `git add .`.

---

# 15. ARTEFACTOS LOCALES / NO CANONIZAR A CIEGAS

Se observaron artefactos untracked tales como:

- logs HTTP;
- backups múltiples de index.ts;
- archivos de pruebas históricas;
- `.mission_state/`;
- documentos generados durante misiones anteriores;
- scripts/canaries antiguos.

No incorporarlos automáticamente.

Especialmente:

NO usar `git add .`

hasta separar:

A. código vigente;
B. evidencia/documentación que debe persistir;
C. artefactos temporales.

`.subscriptions.json` es estado runtime y debe permanecer fuera de Git.

---

# 16. FRONTERA ACTUAL

El puente básico Director → Constructor está cerrado.

La continuidad same-session está cerrada.

La recuperación manual de una misión después de interrupción del Director está demostrada.

La frontera actual tiene DOS problemas distintos:

## A. REACTIVACIÓN

Cuando ChatGPT Director ya no está activo:

¿cómo vuelve a ser notificado/reactivado automáticamente ante un cambio relevante del Constructor?

MCP Events es candidato.

Falta prueba E2E real.

## B. CONTINUIDAD ÚTIL

Cuando la misión se recupera:

¿cómo garantizamos que existe progreso semántico y no solamente persistencia de mission_id/session_id o repetición de un estado `retry`?

Falta diagnosticar y cerrar.

Ambos problemas son necesarios para declarar retorno/continuidad robusta.

No mezclarlos.

---

# 17. PENDIENTES REALES

## P0 — Retorno automático

Pendiente:

events/subscribe real
→ suscripción almacenada
→ evento real
→ webhook
→ recepción/reactivación ChatGPT
→ resultado disponible

No lanzar un nuevo canary de delivery antes de tener evidencia de una suscripción real.

Gate mínimo:

CANTIDAD=1

antes de evaluar delivery.

## P0 — Retry / progreso semántico

Pendiente determinar:

- origen de `retry`;
- relación con OpenCode;
- relación con adaptador;
- timestamps;
- último progreso semántico;
- motivo de retry;
- recuperación idempotente;
- condición de stalled.

No resolver mediante continuaciones infinitas.

## P1 — HTTP experimental

El laboratorio está operacionalmente cerrado.

Técnicamente queda pendiente, sólo si sigue siendo necesario para el mecanismo final:

fresh adapter post-fix
→ fresh tunnel
→ observar startup probe real
→ readyz
→ sólo entonces decidir si el wrapper HTTP actual sirve.

No asumir automáticamente que éste sea el próximo gate.

## P1 — Canonización GitHub

Pendiente:

- revisar código local;
- separar instrumentación/artefactos;
- commit selectivo;
- push explícitamente autorizado;
- dejar este checkpoint accesible desde el mecanismo de reenganche.

---

# 18. HIPÓTESIS ARQUITECTÓNICA ACTUAL — NO CONFUNDIR CON HECHO

La experiencia reciente sugiere como diseño mínimo posible:

ChatGPT Director activo
→ Constructor persistente
→ MCP Events como reactivación/fallback
→ mecanismo mínimo stall/retry recovery

Razones a favor:

- Director ya demostró supervisión multi-iteración;
- Director ya demostró due diligence;
- Constructor ya conserva misión/sesión;
- duplicar otro cerebro supervisor podría ser innecesario.

Pero esta arquitectura NO está validada todavía.

Para intentar refutarla faltan al menos:

1. prueba real de wake-up/reactivación;
2. diagnóstico de retry;
3. prueba de recuperación semántica;
4. evidencia de si hace falta o no un watchdog externo mínimo.

No eliminar componentes basándose sólo en esta hipótesis.

---

# 19. INICIA / GUARDA / ENGANCHE — REQUISITO DE CIERRE FUTURO

Cuando este frente funcional quede cerrado, GitHub debe contener un contrato recuperable que permita:

## INICIA / ENGANCHE

Leer desde GitHub:

- objetivo;
- arquitectura;
- decisiones;
- evidencia;
- estado;
- DO_NOT_REPEAT;
- misión/sesión relevante;
- pendientes;
- siguiente acción.

Memoria de chat ≠ evidencia.

## GUARDA

Persistir:

- problema;
- por qué se eligió una solución;
- alternativas descartadas y por qué;
- evidencia de pruebas;
- decisiones;
- arquitectura resultante;
- commits;
- pendientes;
- punto exacto de reenganche;
- DO_NOT_REPEAT.

## REENGANCHE DETERMINISTA

Una conversación nueva debe poder reconstruir:

objetivo
→ contexto
→ reglas
→ decisiones
→ estado
→ evidencia
→ pendientes
→ siguiente acción

sin reconstrucción manual de días de conversación.

Este requisito todavía debe quedar integrado explícitamente al mecanismo canónico de inicio/cierre del proyecto.

---

# 20. SIGUIENTE DECISIÓN — NO EJECUTAR AUTOMÁTICAMENTE

NO volver automáticamente al gate HTTP histórico.

NO lanzar un nuevo canary.

NO crear una nueva misión sólo para probar conectividad.

NO hacer continuaciones infinitas sobre `retry`.

Primero decidir, usando este checkpoint, cuál es el contrato funcional mínimo que debe satisfacer Constructor Linux para:

1. Director activo;
2. Director ausente;
3. misión sin progreso.

A partir de ese contrato deben derivarse las pruebas físicas mínimas restantes:

A. wake-up / retorno automático;
B. retry/stall / recuperación semántica.

Sólo ejecutar pruebas que reduzcan una incertidumbre actualmente abierta.

---

# 21. REGLA FINAL DE REENGANCHE

Al iniciar una nueva conversación sobre este frente:

1. leer este checkpoint;
2. leer los documentos históricos referenciados sólo cuando haga falta evidencia adicional;
3. inspeccionar HEAD/status/runtime actual;
4. NO asumir que PIDs o procesos históricos siguen vivos;
5. aplicar DO_NOT_REPEAT;
6. distinguir siempre DEMOSTRADO / PARCIAL / FAIL / NO DEMOSTRADO;
7. identificar exactamente qué incertidumbre nueva resolverá el próximo paso;
8. ejecutar sólo después.

FIN DEL CHECKPOINT.
