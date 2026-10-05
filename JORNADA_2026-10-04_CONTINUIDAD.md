# CONTINUIDAD · 2026-10-04 · CONSTRUCTOR LINUX

## 1. ARQUITECTURA OPERATIVA

ChatGPT = DIRECTOR / CEREBRO

ChatGPT
→ misión estructurada
→ Constructor Linux
→ Mission Runner
→ OpenCode
→ modelo vía FreeLLMAPI
→ ejecución / pruebas / cambios
→ resultado estructurado
→ Director / ChatGPT

OpenCode es un componente interno del Constructor Linux.

NO confundir:
- Director = ChatGPT
- Constructor = Constructor Linux
- Motor interno = OpenCode
- Modelo = vía FreeLLMAPI

## 2. CONVENCIÓN OPERATIVA DEFINITIVA

Cuando Rodrigo diga:

"Constructor Linux: [misión]"

significa que ChatGPT debe actuar como Director y preparar una misión para que Constructor Linux la ejecute.

El comando Ubuntu que inicia una misión del Constructor Linux es:

python3 bin/mission_runner_structured.py missions/<misión>.yaml

Rodrigo NO debe recibir un prompt conceptual destinado a pegar directamente en OpenCode cuando solicita una misión al Constructor Linux.

## 3. CONTINUIDAD DE MISIONES

Se implementó continuidad mediante:

bin/mission_runner_structured.py

La continuidad conserva:
- mission_id
- goal
- workspace
- deliverable
- constraints
- historial de iteraciones

Se demostró E2E:

PASS → FAIL → PASS

con la misma misión.

El resultado estructurado contiene:
- mission_id
- state
- summary
- modified_files
- tests
- errors
- next_action

Estados:
- PASS
- FAIL
- BLOCKED

Una instrucción posterior puede corregir un FAIL sin crear una misión nueva.

## 4. OBSERVABILIDAD Y TIMEOUT

Problema detectado:

El Mission Runner ejecuta OpenCode capturando su salida y dispone de un timeout de 300 segundos.

Consecuencia:

Una misión puede estar trabajando sin mostrar progreso visible en la terminal y posteriormente terminar como BLOCKED por timeout.

Por tanto:

SILENCIO DE TERMINAL ≠ PROCESO DETENIDO.

Antes de cancelar una misión hay que comprobar el proceso.

Este problema debe quedar pendiente para una futura mejora de observabilidad del Constructor.

## 5. HERMES / TELEGRAM — OBJETIVO

Flujo objetivo:

ChatGPT / Director
→ Telegram
→ Hermes
→ mecanismo REAL de despacho de misión
→ Constructor Linux
→ OpenCode
→ modelo
→ ejecución
→ resultado estructurado
→ Director / ChatGPT

Hermes es el canal/gatillador de entrada.

No debe convertirse innecesariamente en un puente permanente de las iteraciones internas del Constructor.

Telegram y Hermes ya tienen pruebas históricas PASS y NO deben reconstruirse.

Symphony NO forma parte de este flujo.

## 6. INTENTO DE INTEGRACIÓN HERMES DEL 2026-10-04

Se creó:

missions/hermes-constructor-due-diligence.yaml

y posteriormente:

missions/hermes-constructor-telegram.yaml

La misión inspeccionó el repositorio local.

Encontró:
- test_hermes_telegram.py
- pmo/urls.py
- pmo/views.py
- receive-mission/

No encontró dentro del repositorio:
- mision_directa
- despachar-directo

El Constructor llegó a modificar temporalmente:
- pmo/urls.py
- pmo/views.py

para crear un endpoint local receive-mission.

ESOS CAMBIOS FUERON REVERTIDOS.

Conclusión:

receive-mission NO constituye evidencia de Hermes real.

No debe conservarse como integración Hermes.

## 7. ERROR CRÍTICO A NO REPETIR

No confundir un test local del repositorio con la instalación real de Hermes.

No crear como sustitutos:
- Hermes nuevo
- bot Telegram nuevo
- endpoint Django alternativo
- dispatcher paralelo
- mision_directa inventado
- despachar-directo inventado

Primero debe localizarse la implementación REAL de Hermes existente en el host.

Si no existe evidencia suficiente:

BLOCKED.

No construir una integración ficticia.

## 8. EVIDENCIA DEL CONSTRUCTOR

Se verificó que OpenCode existe:

which opencode
/home/rodrigo_mella/.opencode/bin/opencode

Durante las misiones OpenCode ejecutó:
- find
- grep
- lectura de archivos
- inspección del repositorio
- comandos del sistema
- ejecución de pruebas

Por tanto OpenCode sí está operativo dentro del Constructor.

## 9. PRUEBA DE CONTINUIDAD YA COMPLETADA

La misión de continuidad demostró:

1. ejecución inicial → PASS
2. continuación que rompe implementación → FAIL
3. continuación que corrige implementación → PASS

Con:
- mismo mission_id
- contexto conservado
- historial conservado
- resultado estructurado

Esto NO debe repetirse.

## 10. ESTADO ACTUAL

### OK
- Constructor Linux
- Mission Runner
- OpenCode
- FreeLLMAPI
- contrato de misión
- resultado estructurado
- continuidad de misión
- ciclo PASS → FAIL → PASS

### OK HISTÓRICO / NO REPETIR
- Telegram ↔ Hermes
- Hermes existente
- flujo Hermes ↔ Symphony de Empresa-IA

### PENDIENTE
- localizar Hermes REAL desde el entorno donde opera
- identificar interfaz real de despacho
- identificar cómo Hermes puede entregar una misión al Constructor
- conectar mediante el mecanismo existente
- realizar canary físico Telegram → Hermes → Constructor
- verificar retorno estructurado
- cerrar integración con evidencia real

## 11. EMPRESA-IA

Este repositorio NO debe modificar Empresa-IA.

No modificar:
- flujo Hermes → Symphony
- Symphony
- Telegram existente
- Hermes existente

La integración nueva debe ser mínima y aislada.

## 12. REGLA DEL DIRECTOR

Cuando Rodrigo solicite:

"Constructor Linux: [misión]"

ChatGPT debe:
1. entender la misión;
2. diseñar la misión estructurada;
3. crear/preparar el YAML;
4. entregar el comando Ubuntu que dispara Constructor Linux;
5. revisar el resultado;
6. continuar la misma misión cuando corresponda.

ChatGPT es el cerebro/director.

Constructor Linux es el ejecutor.

OpenCode es un componente interno del ejecutor.

## 13. SIGUIENTE SESIÓN

La próxima conversación debe comenzar leyendo este archivo y verificando Git.

Luego:

1. recuperar evidencia real de Hermes;
2. localizar su instalación/configuración/mecanismo de despacho;
3. no inventar interfaces;
4. diseñar la integración mínima;
5. entregar la misión al Constructor Linux;
6. ejecutar;
7. realizar canary físico Telegram → Hermes → Constructor;
8. declarar PASS solamente con evidencia física.

## 14. PRINCIPIO DE CONTINUIDAD

Este archivo existe para que el proyecto pueda continuar aunque se pierda el contexto de una conversación.

Git es la fuente de continuidad del trabajo del Constructor.

