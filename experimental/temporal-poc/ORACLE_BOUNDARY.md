# Oracle boundary (required before generic execution)

The current OpenCode POC and its workspace run as the same Unix identity. A hidden-test directory owned by that identity is not an independent oracle: the agent could modify it through a shell tool. The generic workflow therefore fails closed with `validation_blocked` until an external oracle runner exists.

Minimum authorised design: run the validator under a different unprivileged Unix identity (or an equivalent rootless container) with the generated workspace mounted read-only, hidden tests mounted read-only, no write access to either source directory, and a dedicated writable results directory. The runner returns a recorded verdict through Temporal; only that evidence may make `functional_status=passed`. This POC does not create that identity, container, or runner.

`oracle-target.sh` provides a rootless Bubblewrap target boundary: it mounts
only the generated workspace read-only, has no network, and does not mount an
oracle directory. `oracle-preflight.sh` proves those properties without
running generated code. This is necessary target containment, not a complete
oracle: an authorised separate runner must still keep hidden tests outside
OpenCode's host view and submit structured diagnostics to Temporal.
