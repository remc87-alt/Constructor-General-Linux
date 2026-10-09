import { fileURLToPath } from "node:url";
import { NativeConnection, Worker } from "@temporalio/worker";
import * as baseActivities from "./activities.ts";
import * as missionActivities from "./mission-activities.ts";
import * as bridgeActivities from "./bridge-activities.ts";

const activities = { ...baseActivities, ...missionActivities, ...bridgeActivities };

const address = process.env.POC_TEMPORAL_ADDRESS;
const taskQueue = process.env.POC_TASK_QUEUE;
if (!address || !taskQueue || !process.env.POC_EFFECTS_DIR) {
  throw new Error("POC_TEMPORAL_ADDRESS, POC_TASK_QUEUE and POC_EFFECTS_DIR are required");
}

const connection = await NativeConnection.connect({ address });
const worker = await Worker.create({
  connection,
  namespace: "default",
  taskQueue,
  workflowsPath: fileURLToPath(new URL("./workflows.ts", import.meta.url)),
  activities
});
console.log(`WORKER RUNNING pid=${process.pid} address=${address} taskQueue=${taskQueue}`);
await worker.run();
