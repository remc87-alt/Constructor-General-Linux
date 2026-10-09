import path from "node:path";
export { oracleExecutionIdFromTemporalRun } from "./oracle-execution-id.ts";

export const ORACLE_PUBLIC_RESULTS_ROOT = "/var/lib/cgl-oracle-public-results";
const MISSION_ID = /^[a-z0-9][a-z0-9-]{2,119}$/;
const EXECUTION_ID = /^[a-z0-9][a-z0-9-]{2,119}$/;

export type OracleExecutionIdentity = {
  missionId: string;
  oracleExecutionId: string;
};

export type PublicOracleResult = {
  schema: "cgl-oracle-result-v1";
  mission_id: string;
  oracle_execution_id: string;
  ok: boolean;
  status: "passed" | "failed" | "oracle_error";
  diagnostics: Array<{ code: "FUNCTIONAL_FAILURE" | "ORACLE_ERROR"; summary: string }>;
};

export function validateOracleExecutionIdentity(identity: OracleExecutionIdentity): OracleExecutionIdentity {
  const { missionId, oracleExecutionId } = identity;
  if (!MISSION_ID.test(missionId)) throw new Error("invalid oracle mission_id");
  if (!EXECUTION_ID.test(oracleExecutionId)) throw new Error("invalid oracle execution_id");
  return identity;
}

export function publicOracleResultPath(identity: OracleExecutionIdentity): string {
  const { missionId, oracleExecutionId } = validateOracleExecutionIdentity(identity);
  return path.join(ORACLE_PUBLIC_RESULTS_ROOT, `${missionId}--${oracleExecutionId}.json`);
}

export function parsePublicOracleResult(raw: unknown, identity: OracleExecutionIdentity): PublicOracleResult {
  const { missionId, oracleExecutionId } = validateOracleExecutionIdentity(identity);
  const value = raw as Partial<PublicOracleResult>;
  if (!value || typeof value !== "object" || value.schema !== "cgl-oracle-result-v1" || value.mission_id !== missionId || value.oracle_execution_id !== oracleExecutionId) {
    throw new Error("oracle result identity mismatch");
  }
  if (typeof value.ok !== "boolean" || !["passed", "failed", "oracle_error"].includes(String(value.status)) || !Array.isArray(value.diagnostics)) {
    throw new Error("oracle result schema invalid");
  }
  const diagnostics = value.diagnostics.map((diagnostic) => {
    if (!diagnostic || (diagnostic.code !== "FUNCTIONAL_FAILURE" && diagnostic.code !== "ORACLE_ERROR") || typeof diagnostic.summary !== "string" || diagnostic.summary.length > 300) {
      throw new Error("oracle result diagnostics invalid");
    }
    return { code: diagnostic.code, summary: diagnostic.summary };
  });
  if (value.ok !== (value.status === "passed") || (value.ok && diagnostics.length !== 0)) throw new Error("oracle result verdict inconsistent");
  return { schema: "cgl-oracle-result-v1", mission_id: missionId, oracle_execution_id: oracleExecutionId, ok: value.ok, status: value.status as PublicOracleResult["status"], diagnostics };
}
