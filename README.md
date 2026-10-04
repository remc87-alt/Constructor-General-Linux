# OpenCode Constructor General

Brazo ejecutor local para recibir misiones y trabajar directamente sobre un repositorio mediante OpenCode.

## Arquitectura validada

Rodrigo
→ OpenCode 1.18.34
→ FreeLLMAPI (127.0.0.1:3001/v1)
→ modelo de IA
→ archivos / comandos / tests
→ resultado y diff

## Modelos validados

- Nemotron 3 Super 120B — E2E de construcción PASS
- Nemotron 3 Ultra 550B — conexión PASS
- Muse Glimmer 30B — conexión PASS

## Prueba E2E

OpenCode recibió una misión para corregir `src/calculator.py`.

Resultado:
- leyó código y tests
- modificó únicamente `src/calculator.py`
- ejecutó pytest
- resultado: 2 passed
- mostró git diff
- no realizó commit

## Separación de proyectos

Este proyecto es independiente de Empresa-IA.

Empresa-IA no es modificada por este proyecto.

FreeLLMAPI puede ser utilizado como capacidad compartida, pero cada proyecto mantiene su propia configuración y propósito.

## Estado

POC local E2E: PASS.

Siguiente etapa:
- consolidación del proyecto
- repositorio GitHub
- endurecimiento
- integración opcional con Hermes/Telegram
