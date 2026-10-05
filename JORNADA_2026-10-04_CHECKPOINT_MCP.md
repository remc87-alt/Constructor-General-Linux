# CHECKPOINT RÁPIDO · 2026-10-04

## HITO PRINCIPAL · PASS

Quedó probado E2E real:

ChatGPT Director
→ complemento MCP privado "Empresa-IA Constructor Linux"
→ OpenAI Secure MCP Tunnel
→ tunnel-client en WSL
→ MCP local
→ retorno automático a ChatGPT.

Pruebas ejecutadas directamente desde ChatGPT:
- server_info → PASS
- echo → CHATGPT_DIRECTOR_WSL_E2E_PASS
- uppercase → EMPRESA IA CONSTRUCTOR LINUX

Conclusión:
ChatGPT ya puede ejecutar herramientas en el MCP de WSL y recibir el resultado automáticamente.
Rodrigo ya no necesita copiar manualmente el resultado de Ubuntu a ChatGPT para este tramo.

## COMPONENTES VERIFICADOS

- OpenCode: 1.18.34
- OpenCode Server: healthy
- API local: 127.0.0.1:4096
- Workspace: ~/opencode-constructor-e2e
- Node: v22.23.2
- Secure MCP Tunnel: PASS
- ChatGPT → WSL MCP: PASS
- OpenCode → FreeLLMAPI/Nemotron: previamente PASS
- Modelo configurado: freellmapi/nemotron-3-super-120b

## DECISIÓN REUSE FIRST

Se inspeccionó el Mission Runner existente.

Se conserva y NO se reemplaza ni elimina.

No será el núcleo del nuevo puente porque run_mission():
- ejecuta `opencode run` mediante subprocess;
- no soporta continuación de una misión existente;
- devuelve FAIL si ya existe el mismo mission_id.

La API HTTP nativa de OpenCode sí soporta sesiones persistentes y ya fue probada.

## ARQUITECTURA OBJETIVO

ChatGPT Director
→ MCP privado
→ adaptador fino
→ OpenCode HTTP API
→ OpenCode session_id persistente
→ FreeLLMAPI / Nemotron
→ resultado
→ MCP
→ ChatGPT Director

## PENDIENTES

P0. Construir adaptador MCP fino sobre OpenCode HTTP API.

Herramientas objetivo:
- start_mission
- continue_mission
- get_mission
- reply_permission

Persistir:
mission_id → OpenCode session_id

P1. E2E definitivo desde ChatGPT:
1. ChatGPT crea misión.
2. OpenCode ejecuta.
3. Resultado/FAIL/BLOCKED vuelve automáticamente a ChatGPT.
4. ChatGPT envía corrección.
5. Se reutilizan mission_id y session_id.
6. OpenCode continúa.
7. Resultado final PASS vuelve automáticamente.

P2. Seguridad:
- OpenCode permanece localhost.
- No exponer API OpenCode directamente al túnel.
- MCP estrecho.
- Sin --auto irrestricto.
- Permisos mediante reply_permission.
- No guardar API keys ni secretos en Git.

P3. Solo después del E2E anterior:
integrar Hermes/Telegram reutilizando el transporte ya existente.
NO reconstruir Hermes/Telegram.
NO repetir POC históricos ya PASS.

## PUNTO EXACTO DE REANUDACIÓN

Construir el adaptador MCP mínimo.
No repetir:
- canary server_info/echo/uppercase;
- prueba ChatGPT → Secure Tunnel → WSL;
- health OpenCode;
- prueba OpenCode → FreeLLMAPI;
- inventario REUSE FIRST.
