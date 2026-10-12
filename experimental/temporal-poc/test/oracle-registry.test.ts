import assert from "node:assert/strict";
import test from "node:test";
import { authorizedOracleSuite } from "../src/oracle-registry.ts";

test("closed oracle registry selects only an authorized suite", () => {
  assert.equal(authorizedOracleSuite("expense-oracle-001").prepareProfile, "csv-expense-v1");
  assert.throws(() => authorizedOracleSuite("unknown-suite"), /unknown oracle suite/);
});

test("the registry profile matches the only installed isolated executor", () => {
  const suite = authorizedOracleSuite("expense-oracle-001");
  assert.equal(suite.prepareProfile, "csv-expense-v1");
  assert.notEqual(suite.prepareProfile, "arbitrary-command");
});
