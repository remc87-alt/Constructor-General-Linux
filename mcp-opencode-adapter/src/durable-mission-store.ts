import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawn, execFileSync } from "node:child_process";
import type { MissionMap, MissionRecord } from "./mission-ops.ts";

// Explicit opt-in for the Temporal deployment. No migration or fallback to a
// second map: corrupt/unreadable state must never look like an unknown mission.
export class DurableMissionStore {
  constructor(readonly file: string) {
    if (!path.isAbsolute(file)) throw new Error("mission map path must be absolute");
  }

  load(): MissionMap {
    try {
      const value = JSON.parse(fs.readFileSync(this.file, "utf8"));
      if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid mission map");
      for (const record of Object.values(value) as any[]) {
        if (!record || typeof record.session_id !== "string" || !record.session_id) throw new Error("invalid mission identity");
      }
      return value;
    } catch (e: any) {
      if (e.code === "ENOENT") return {};
      throw e;
    }
  }

  get(id: string): MissionRecord | undefined { return this.load()[id]; }

  patch(id: string, fields: Partial<MissionRecord>): void {
    // A kernel lock serializes the complete read/merge/atomic-rename across
    // processes. It is released on process exit, without stale PID recovery.
    const lock = `${this.file}.write.lock`;
    fs.closeSync(fs.openSync(lock, "a", 0o600));
    execFileSync("/usr/bin/flock", ["-w", "10", lock, process.execPath, "--input-type=module", "-e", `
      import fs from 'node:fs';
      const {file,id,fields}=JSON.parse(fs.readFileSync(0,'utf8'));
      let map;
      try { map=JSON.parse(fs.readFileSync(file,'utf8')); }
      catch(e) { if(e.code!=='ENOENT') throw e; map={}; }
      if(!map || typeof map!=='object' || Array.isArray(map)) throw Error('invalid mission map');
      const record={...map[id],...fields};
      if(!record.session_id || typeof record.session_id!=='string') throw Error('invalid mission identity');
      if(map[id] && map[id].session_id!==record.session_id) throw Error('mission session cannot change');
      map[id]=record;
      const tmp=file+'.'+process.pid+'.tmp';
      try {
        const fd=fs.openSync(tmp,'wx',0o600);
        try { fs.writeFileSync(fd,JSON.stringify(map,null,2)); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
        fs.renameSync(tmp,file);
      } finally { if(fs.existsSync(tmp)) fs.unlinkSync(tmp); }
    `], { input: JSON.stringify({ file: this.file, id, fields }), stdio: ["pipe", "pipe", "pipe"] });
  }

  async exclusive<T>(id: string, action: () => Promise<T>): Promise<T> {
    const lock = `${this.file}.${crypto.createHash("sha256").update(id).digest("hex")}.lock`;
    fs.closeSync(fs.openSync(lock, "a", 0o600));
    const child = spawn("/usr/bin/flock", ["--no-fork", "--nonblock", lock, process.execPath, "-e",
      'process.stdout.write("locked\\n"); process.stdin.resume(); process.stdin.on("end",()=>process.exit(0));'],
      { stdio: ["pipe", "pipe", "pipe"] });
    // Consume stderr without publishing paths or record contents.
    child.stderr.resume();
    child.stdin.on("error", () => {});
    const exited = new Promise<void>((resolve) => child.once("close", () => resolve()));
    try {
      await new Promise<void>((resolve, reject) => {
        child.once("error", reject);
        child.once("exit", () => reject(new Error("mission operation already in progress or lock unavailable")));
        child.stdout.once("data", () => resolve());
      });
      return await action();
    } finally {
      child.stdin.end();
      await exited;
    }
  }
}
