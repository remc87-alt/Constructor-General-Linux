import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('./', import.meta.url));
const moduleRoot = path.join(root, 'snapshot/experimental/temporal-poc');
const { Worker, NativeConnection, bundleWorkflowCode } = await import(path.join(moduleRoot, 'node_modules/@temporalio/worker/lib/index.js'));
const { Client, Connection } = await import(path.join(moduleRoot, 'node_modules/@temporalio/client/lib/index.js'));
const { DurableMissionStore } = await import(path.join(root, 'snapshot/mcp-opencode-adapter/src/durable-mission-store.ts'));
const address = process.env.CGL_TEMPORAL_TEST_ADDRESS;
assert.match(address ?? '', /^127\.0\.0\.1:\d+$/);
assert.notEqual(address.split(':')[1], '7243');
const proposed = '/home/rodrigo_mella/constructor-general-linux-m01-lab/experimental/temporal-poc/src/workflows.ts';
const fallback = path.join(moduleRoot, 'src/workflows.ts');
assert.deepEqual(fs.readFileSync(proposed), fs.readFileSync(fallback), 'approved workflow core remains identical');
const newBundle = await bundleWorkflowCode({ workflowsPath: proposed });
const fallbackBundle = await bundleWorkflowCode({ workflowsPath: fallback });

for (const decision of ['once', 'reject', 'timeout']) {
  test(`compatible rollback preserves ${decision} and one durable session across worker replacement`, { timeout: 90_000 }, async (t) => {
    const native = await NativeConnection.connect({ address });
    const connection = await Connection.connect({ address });
    const client = new Client({ connection, namespace: 'default' });
    const queue = `rollback-test-${decision}-${Date.now()}`;
    const id = queue, session = `ses_${decision}`, permission = `per_${decision}`;
    const ledgerDir = fs.mkdtempSync(path.join(root, `evidence-${decision}-`));
    const ledger = new DurableMissionStore(path.join(ledgerDir, 'mission-map.json'));
    const calls = { start: 0, wait: 0, reply: [], abort: 0, validate: 0 };
    let active;
    t.after(async () => {
      if (active && active.getState() === 'RUNNING') { active.shutdown(); await running; }
      await connection.close(); await native.close();
    });
    const activities = {
      async prepareGenericMission({contract}) { return contract; },
      async verifyOpenCodeWorkspace() { return {pid:'fake',cwd:'fake'}; },
      async startMission() {
        calls.start++;
        assert.equal(ledger.get(id), undefined, 'never create a second session');
        ledger.patch(id, { session_id: session, title: 'isolated rollback test' });
        return { sessionId: session, alreadyExisted: false };
      },
      async waitMission(input) {
        assert.equal(input.expectedSessionId, ledger.get(id).session_id);
        if (++calls.wait === 1) return {kind:'permission',sessionId:session,polls:1,permission:{permission_id:permission,permission:'bash',patterns:['python3 a.py']}};
        return {kind:'idle',sessionId:session,polls:1,text:'simulated'};
      },
      async replyPermission(input) {
        assert.equal(input.missionId,id); assert.equal(input.permissionId,permission);
        calls.reply.push(input.decision);
        ledger.patch(id,{permission_decisions:[...calls.reply]});
        return {replied:true};
      },
      async abortMission(input) {
        assert.equal(input.missionId,id); calls.abort++;
        ledger.patch(id,{aborted_at:new Date().toISOString()}); return {aborted:true};
      },
      async validateGenericMission() {
        calls.validate++; return {ok:true,status:'passed',diagnostics:[],artifactPaths:[]};
      },
    };
    active = await Worker.create({connection:native,namespace:'default',taskQueue:queue,workflowBundle:newBundle,activities});
    let running = active.run();
    const handle = await client.workflow.start('genericConstructorMissionWorkflow', {
      taskQueue:queue,workflowId:id,args:[{title:'isolated rollback test',contract:{missionId:id,workspace:ledgerDir,
        instructions:'fake activities only',artifactPaths:['a.py'],validation:{kind:'external-oracle',oracleId:'expense-oracle-001',requiredArtifacts:['a.py']},
        budget:{maxDurationMs:decision==='timeout'?30_000:60_000,maxRepairAttempts:0,maxTokens:null}}}],
    });
    const end=Date.now()+15_000;let pending;
    while(Date.now()<end) {
      try { pending=await handle.query('generic-mission'); if(pending.phase==='permission_pending') break; } catch {}
      await new Promise(r=>setTimeout(r,50));
    }
    assert.equal(pending?.phase,'permission_pending');
    assert.equal(ledger.get(id).session_id,session);
    active.shutdown(); await running;
    // Submit the exact human decision while there is no polling Worker.
    if(decision!=='timeout') await handle.signal('generic-permission',{mission_id:id,session_id:session,permission_id:permission,patterns:['python3 a.py'],decision,by:'isolated-director'});
    active = await Worker.create({connection:native,namespace:'default',taskQueue:queue,workflowBundle:fallbackBundle,activities});
    running = active.runUntil(handle.result());
    const result = await running;
    assert.equal(calls.start,1); assert.equal(result.session_id,session);
    assert.equal(result.pending_permission,null); assert.equal(result.permission_status,'none');
    assert.equal(ledger.get(id).session_id,session);
    if(decision==='once') {
      assert.equal(result.functional_status,'passed'); assert.deepEqual(calls.reply,['once']);
      assert.equal(calls.validate,1); assert.equal(calls.abort,0);
    } else {
      assert.equal(result.functional_status,'blocked'); assert.equal(calls.validate,0); assert.equal(calls.abort,1);
      assert.deepEqual(calls.reply,decision==='reject'?['reject']:[]);
    }
    if(decision!=='timeout') assert.deepEqual(ledger.get(id).permission_decisions,[decision]);
    const history=await handle.fetchHistory();
    assert.equal(history.events.filter(e=>e.activityTaskScheduledEventAttributes?.activityType?.name==='startMission').length,1);
    if(decision!=='timeout') assert.equal(history.events.filter(e=>e.workflowExecutionSignaledEventAttributes?.signalName==='generic-permission').length,1);
    fs.writeFileSync(path.join(ledgerDir,'result.json'),JSON.stringify({decision,calls,result,history_events:history.events.length},null,2),{mode:0o600});
  });
}
