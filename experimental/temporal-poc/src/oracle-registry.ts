export type OracleSuite = { oracleId: string; prepareProfile: string };

// Closed registry: mission input selects an opaque ID, never a command/path.
export const ORACLE_SUITES: Readonly<Record<string, OracleSuite>> = Object.freeze({
  "expense-oracle-001": Object.freeze({ oracleId: "expense-oracle-001", prepareProfile: "csv-expense-v1" })
});

export function authorizedOracleSuite(oracleId: string): OracleSuite {
  const suite = ORACLE_SUITES[oracleId];
  if (!suite) throw new Error("unknown oracle suite");
  return suite;
}
