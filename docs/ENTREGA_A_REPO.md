# Entrega a repositorio · generic-delivery-v1

Cierra el eslabón que faltaba: una misión validada por el oráculo ya no termina en el workspace de prueba, sino como una rama nueva en un repositorio de GitHub.

## Qué hace

1. La misión corre igual que antes hasta `validated`.
2. Si el contrato trae `delivery`, el worker clona el repo destino, copia **solo** los `artifactPaths`, hace commit y sube la rama `cgl/<mission_id>`.
3. El resultado queda en `state.delivery` de `get_temporal_mission`: `status` (`pushed`, `already_delivered` o `failed`), `commit`, `files` y `compare_url` para abrir el pull request.

## Reglas de seguridad

- Solo repos listados en `~/.config/cgl/delivery-repos` (uno por línea). Sin archivo, no se entrega nada.
- La rama siempre es `cgl/<mission_id>`: nunca `main`, nunca `push --force`.
- Si la rama ya existe y no es de esta misión, se detiene sin tocarla.
- Solo archivos regulares del workspace: sin enlaces simbólicos, nada bajo `.git`, máximo 5 MB por archivo.
- Hooks de git desactivados durante la entrega.
- Token en `~/.config/cgl/github-token` (permisos 600) o `CGL_GITHUB_TOKEN`. Viaja solo como cabecera HTTP: nunca en URLs, argumentos, historial de Temporal ni mensajes de error.
- Una entrega fallida no convierte la misión en fallida: queda `validated`, `functional_status = passed`, `delivery.status = failed`, `next_action = review_evidence`.
- Versionado con `patched("generic-delivery-v1")`: los historiales anteriores se reproducen sin cambios.

## Configuración (una sola vez, en el PC)

1. En GitHub, crear el repo `remc87-alt/cgl-sandbox` (privado, con README).
2. Crear un token *fine-grained*: solo el repo `cgl-sandbox`, permiso **Contents: Read and write**, vencimiento 90 días.
3. Guardar el token (pide pegarlo, no se muestra):

```
mkdir -p ~/.config/cgl && read -rsp "Token: " T && printf '%s' "$T" > ~/.config/cgl/github-token && chmod 600 ~/.config/cgl/github-token && echo && echo OK
```

4. Autorizar el repo destino:

```
echo remc87-alt/cgl-sandbox > ~/.config/cgl/delivery-repos && cat ~/.config/cgl/delivery-repos
```

## Cargar el código y reiniciar el worker

```
cd ~/constructor-general-linux-m01-lab && git fetch origin && git checkout cgl-entrega-repo && git pull --ff-only && git log --oneline -1
```

Si el PC se reinició, en vez del reinicio del worker correr `cgl-arranque.sh`. Si no:

```
cd ~/constructor-general-linux-m01-lab/experimental/temporal-poc && ./ctl.sh worker stop && sleep 3 && ./ctl.sh worker start && ./runtime-preflight.sh | tail -1
```

## Misión de prueba

```
~/constructor-general-linux-m01-lab/experimental/temporal-poc/cgl-prep-mission.sh cgl-entrega-20261030-001 expense_cli.py test_expense_cli.py
```

Confirmar `0 failing gate(s)` y pegarle a ChatGPT:

> Lanza la misión `cgl-entrega-20261030-001` con `start_temporal_mission`. Usa exactamente el mismo contrato de la misión `cgl-mvp-expense-20261017-003` (mismas instrucciones con la especificación de interfaz, oráculo `expense-oracle-001`, artifactPaths `expense_cli.py` y `test_expense_cli.py`, presupuesto 900000 ms y 1 reparación), cambiando solo `missionId` y `workspace` (`/home/rodrigo_mella/.local/state/constructor-temporal-poc/workspaces/cgl-entrega-20261030-001`) y agregando `"delivery": {"repo": "remc87-alt/cgl-sandbox", "baseBranch": "main", "targetDir": ""}`. Aplica la regla de permisos delegada de la plantilla (no rechazar nada). Consulta `get_temporal_mission` hasta `temporal_status = completed` y repórtame `phase`, `functional_status` y todo `state.delivery`.

## Verificación

- `phase = validated`, `functional_status = passed`, `delivery.status = pushed`.
- En GitHub, `remc87-alt/cgl-sandbox` tiene la rama `cgl/cgl-entrega-20261030-001` con `expense_cli.py` y `test_expense_cli.py`, y `main` sigue intacto.
- Abrir `delivery.compare_url` para crear el pull request.

Si `delivery.status = failed`, `delivery.error` dice la causa (credenciales, repo no autorizado, rama ajena, push rechazado). El veredicto del oráculo no se pierde.

## Pruebas

`npx tsx --test test/delivery.test.ts`: 7 casos con un repo remoto local (sin red). Con un servidor Temporal efímero (`CGL_TEMPORAL_TEST_ADDRESS`), `test/generic-workflow.integration.test.ts` agrega 3 casos del workflow real: entrega exitosa, entrega fallida y misión sin entrega.
