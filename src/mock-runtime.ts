import type { PcmClient } from "./runtime.js";
import { Outcome } from "@buf/bitgn_api.bufbuild_es/bitgn/vm/pcm_pb.js";

export interface MockFileSystem {
  [filePath: string]: string;
}

/**
 * Creates an in-memory mock PCM client for testing the agent loop
 * locally without connecting to the paid remote BitGN server.
 */
export function createMockRuntime(initialFiles: MockFileSystem = {}): PcmClient {
  const files = new Map<string, string>();
  for (const [p, content] of Object.entries(initialFiles)) {
    const norm = p.startsWith("/") ? p : `/${p}`;
    files.set(norm, content);
  }

  // Ensure /AGENTS.md is always present by default
  if (!files.has("/AGENTS.md") && !files.has("/agents.md")) {
    files.set("/AGENTS.md", "Be pragmatic. Prefer small diffs. If you cannot answer, ask for clarification.");
  }

  const mock = {
    async context() {
      return {
        time: new Date().toISOString(),
        unix: BigInt(Math.floor(Date.now() / 1000)),
      } as any;
    },

    async tree(req: { root?: string; level?: number }) {
      const root = req.root || "/";
      const lines = [root];
      for (const path of Array.from(files.keys()).sort()) {
        if (path.startsWith(root)) {
          lines.push(`├── ${path.slice(root.length).replace(/^\//, "")}`);
        }
      }
      return { tree: lines.join("\n") } as any;
    },

    async list(req: { path?: string }) {
      const targetDir = req.path || "/";
      const entries: Array<{ name: string; isDir: boolean }> = [];
      const seen = new Set<string>();

      for (const p of files.keys()) {
        if (p.startsWith(targetDir)) {
          const rel = p.slice(targetDir.length).replace(/^\//, "");
          const seg = rel.split("/")[0];
          if (seg && !seen.has(seg)) {
            seen.add(seg);
            entries.push({ name: seg, isDir: rel.includes("/") });
          }
        }
      }
      return { entries } as any;
    },

    async find(req: { root?: string; name?: string; limit?: number }) {
      const root = req.root || "/";
      const name = req.name || "";
      const matches: string[] = [];

      for (const p of files.keys()) {
        if (p.startsWith(root) && p.includes(name)) {
          matches.push(p);
          if (matches.length >= (req.limit ?? 10)) break;
        }
      }
      return { paths: matches } as any;
    },

    async search(req: { root?: string; pattern?: string; limit?: number }) {
      const pattern = new RegExp(req.pattern || "", "i");
      const results: Array<{ path: string; line: number; content: string }> = [];

      for (const [p, text] of files.entries()) {
        if (req.root && !p.startsWith(req.root)) continue;
        const lines = text.split("\n");
        for (let i = 0; i < lines.length; i++) {
          if (pattern.test(lines[i])) {
            results.push({ path: p, line: i + 1, content: lines[i] });
            if (results.length >= (req.limit ?? 10)) break;
          }
        }
      }
      return { matches: results } as any;
    },

    async read(req: { path: string; startLine?: number; endLine?: number }) {
      const norm = req.path.startsWith("/") ? req.path : `/${req.path}`;
      const content = files.get(norm);
      if (content === undefined) {
        throw new Error(`File not found: ${req.path}`);
      }
      const lines = content.split("\n");
      const start = Math.max(0, (req.startLine ?? 1) - 1);
      const end = req.endLine && req.endLine > 0 ? req.endLine : lines.length;
      return {
        content: lines.slice(start, end).join("\n"),
        totalLines: lines.length,
      } as any;
    },

    async write(req: { path: string; content: string }) {
      const norm = req.path.startsWith("/") ? req.path : `/${req.path}`;
      files.set(norm, req.content);
      return { ok: true } as any;
    },

    async delete(req: { path: string }) {
      const norm = req.path.startsWith("/") ? req.path : `/${req.path}`;
      files.delete(norm);
      return { ok: true } as any;
    },

    async mkdir(req: { path: string }) {
      return { ok: true } as any;
    },

    async move(req: { from: string; to: string }) {
      const fromNorm = req.from.startsWith("/") ? req.from : `/${req.from}`;
      const toNorm = req.to.startsWith("/") ? req.to : `/${req.to}`;
      const content = files.get(fromNorm);
      if (content === undefined) {
        throw new Error(`Source not found: ${req.from}`);
      }
      files.delete(fromNorm);
      files.set(toNorm, content);
      return { ok: true } as any;
    },

    async answer(req: { outcome?: Outcome; message?: string; groundingRefs?: string[] }) {
      return {
        ok: true,
        recordedOutcome: req.outcome ?? Outcome.OK,
        recordedMessage: req.message,
        recordedRefs: req.groundingRefs,
      } as any;
    },
  };

  return mock as unknown as PcmClient;
}
