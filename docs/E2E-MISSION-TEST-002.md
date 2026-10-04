# E2E · Misión estructurada TEST-002

## Objetivo

Validar que Constructor General Linux pueda recibir una misión estructurada,
leer su contrato, ejecutar el trabajo mediante OpenCode + FreeLLMAPI + modelo,
modificar únicamente los archivos autorizados y verificar el resultado.

## Misión

`missions/test-002.yaml`

## Modelo

Nemotron 3 Super 120B.

## Resultado

PASS.

## Ejecución

OpenCode:

- leyó `docs/MISSION-CONTRACT.md`
- leyó `missions/test-002.yaml`
- leyó el código y las pruebas existentes
- implementó `multiply(a, b)`
- agregó pruebas para `multiply`
- ejecutó `PYTHONPATH=. pytest -q`

## Verificación

Resultado:

`4 passed`

Archivos modificados:

- `src/calculator.py`
- `tests/test_calculator.py`

No se realizó commit durante la misión.

## Conclusión

Constructor General Linux demostró que puede ejecutar una misión estructurada
de principio a fin sobre un workspace autorizado y entregar un resultado
verificable con pruebas y diff.
