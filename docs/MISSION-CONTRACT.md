# Constructor General Linux · Contrato de Misión

## Propósito

Constructor General Linux recibe una misión y la ejecuta directamente sobre
un repositorio mediante OpenCode.

Flujo:

Rodrigo
→ misión
→ OpenCode
→ FreeLLMAPI
→ modelo
→ archivos/comandos/tests
→ resultado

## Entrada mínima

Cada misión debe definir:

- objetivo
- repositorio de trabajo
- resultado esperado
- restricciones relevantes

## Reglas de ejecución

1. Trabajar únicamente dentro del repositorio autorizado.
2. Leer antes de modificar.
3. No modificar archivos fuera del alcance de la misión.
4. No instalar dependencias sin autorización explícita.
5. Ejecutar las pruebas relevantes después de modificar código.
6. Mostrar los cambios realizados.
7. No hacer commit automáticamente, salvo que la misión lo autorice.
8. Informar claramente PASS, FAIL o BLOCKED.

## Salida mínima

Al terminar una misión debe informar:

- STATUS
- resumen de lo realizado
- archivos modificados
- pruebas ejecutadas
- resultado de las pruebas
- siguiente acción, si corresponde

## Separación

Constructor General Linux es independiente de Empresa-IA.

No debe modificar el repositorio Empresa-IA salvo que una misión futura
lo autorice explícitamente.
