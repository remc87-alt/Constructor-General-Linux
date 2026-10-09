// This module is intentionally workflow-safe: Temporal bundles workflow code
// without Node built-ins, while path construction and filesystem validation
// remain in oracle-result-contract.ts for Activities only.
export function oracleExecutionIdFromTemporalRun(runId: string, validationOrdinal: number): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(runId)) {
    throw new Error("invalid Temporal run_id for oracle execution");
  }
  if (!Number.isInteger(validationOrdinal) || validationOrdinal < 1 || validationOrdinal > 99) {
    throw new Error("invalid oracle validation ordinal");
  }
  return `${runId.toLowerCase()}-v${validationOrdinal}`;
}
