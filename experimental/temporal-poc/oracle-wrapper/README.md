# Controlled oracle interface

The caller has exactly one sudo command and cannot choose a workspace, suite,
command, or output path. A root-owned `active-job.json` selects a workspace
under the POC root and an opaque suite name. The trusted private validator
uses `cgl-oracle-target` to execute generated code with a read-only workspace,
no network, and no oracle mount. It writes a sanitized JSON diagnostic only to
`/var/lib/cgl-oracle/results/current.json`.
