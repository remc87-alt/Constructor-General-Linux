// G01: creates a generic mission workspace before OpenCode starts on it.
//   tsx src/workspace-setup.ts <mission-id> <artifact-path>...
// Root: CGL_WORKSPACE_ROOT (legacy per-user root when unset). Exclusive
// creation: an existing workspace is never reused or modified.
import { createMissionWorkspace } from "./workspace.ts";

const [missionId, ...artifactPaths] = process.argv.slice(2);
if (!missionId || artifactPaths.length === 0) throw new Error("usage: workspace-setup.ts <mission-id> <artifact-path>...");
console.log(createMissionWorkspace(missionId, artifactPaths));
