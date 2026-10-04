# Constructor General Linux

## Identidad

Constructor General Linux es un brazo ejecutor local independiente.

Su propósito es recibir una misión y ejecutar directamente sobre un repositorio:

misión → OpenCode → FreeLLMAPI → modelo → código → pruebas → resultado

## Entorno

- Ubuntu sobre WSL2
- OpenCode 1.18.34
- FreeLLMAPI: 127.0.0.1:3001/v1

## Modelos validados

- Nemotron 3 Super 120B — E2E construcción PASS
- Nemotron 3 Ultra 550B — conexión PASS
- Muse Glimmer 30B — conexión PASS

## Estado

POC E2E local: PASS
Commit base: 80eec42

## Separación de Empresa-IA

Constructor General Linux es un proyecto independiente.

No modifica Empresa-IA.

Puede reutilizar capacidades compartidas como FreeLLMAPI, pero mantiene su propia configuración, repositorio y propósito.

## Próximas etapas

1. Repositorio GitHub.
2. Configuración estable.
3. Contrato de ejecución de misiones.
4. Endurecimiento.
5. Integración opcional con Hermes/Telegram.
