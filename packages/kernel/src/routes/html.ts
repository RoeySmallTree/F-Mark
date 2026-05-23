import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { FastifyInstance, FastifyReply } from "fastify";
import type { EventKind, HtmlManifest } from "@f-mark/shared";
import {
  composeFilename,
  isoTimestamp,
  toIsoTimestamp,
} from "@f-mark/shared";
import type { Paths } from "../paths.js";
import { sessionExists } from "../sessions.js";
import { listParticipants } from "../participants.js";
import { validateNonProseAppendTo } from "../events/proseValidate.js";
import type { Bus, BusMessage } from "../ws/bus.js";

interface HtmlBody {
  participant_id: string;
  html: string;
  css?: string;
  js?: string;
  title?: string;
  dependencies?: string[];
  supersedes?: string;
  append_to?: string;
}

async function ensureSession(
  p: Paths,
  sessionId: string,
  reply: FastifyReply,
): Promise<boolean> {
  if (!(await sessionExists(p, sessionId))) {
    reply.code(404).send({ error: `session not found: ${sessionId}` });
    return false;
  }
  return true;
}

function assertWithinSession(
  p: Paths,
  sessionId: string,
  target: string,
): void {
  const sessionRoot = resolve(p.sessionDir(sessionId));
  const targetResolved = resolve(target);
  if (
    !targetResolved.startsWith(`${sessionRoot}/`) &&
    targetResolved !== sessionRoot
  ) {
    throw new Error("path escapes session root");
  }
}

function parseCompactTs(ts: string): Date {
  return new Date(
    `${ts.slice(0, 4)}-${ts.slice(4, 6)}-${ts.slice(6, 8)}T${ts.slice(9, 11)}:${ts.slice(11, 13)}:${ts.slice(13, 15)}Z`,
  );
}

function bumpSecond(ts: string): string {
  const d = parseCompactTs(ts);
  d.setUTCSeconds(d.getUTCSeconds() + 1);
  return toIsoTimestamp(d);
}

async function tryMkdir(target: string): Promise<boolean> {
  try {
    await mkdir(target, { recursive: false });
    return true;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "EEXIST") return false;
    throw err;
  }
}

export function registerHtmlRoutes(
  app: FastifyInstance,
  p: Paths,
  getBus: () => Bus,
): void {
  function publish(
    sessionId: string,
    filename: string,
    kind: EventKind,
    participantId: string,
    supersedes?: string,
  ): void {
    const bus = getBus();
    const added: BusMessage = {
      type: "event_added",
      session_id: sessionId,
      filename,
      kind,
      participant_id: participantId,
    };
    bus.publish(added);
    if (typeof supersedes === "string") {
      bus.publish({
        type: "event_superseded",
        session_id: sessionId,
        filename: supersedes,
        supersedes: filename,
      });
    }
  }

  app.post<{ Params: { id: string }; Body: HtmlBody }>(
    "/sessions/:id/events/html",
    {
      schema: {
        params: {
          type: "object",
          required: ["id"],
          properties: { id: { type: "string" } },
        },
        body: {
          type: "object",
          required: ["participant_id", "html"],
          additionalProperties: false,
          properties: {
            participant_id: { type: "string", minLength: 1 },
            html: { type: "string" },
            css: { type: "string" },
            js: { type: "string" },
            title: { type: "string" },
            dependencies: {
              type: "array",
              items: { type: "string" },
            },
            supersedes: { type: "string" },
            append_to: { type: "string", minLength: 1 },
          },
        },
      },
    },
    async (req, reply) => {
      if (!(await ensureSession(p, req.params.id, reply))) return;
      try {
        const apCheck = validateNonProseAppendTo(req.body.append_to);
        if (!apCheck.ok) {
          reply.code(400);
          return { error: apCheck.error };
        }
        const {
          participant_id,
          html,
          css,
          js,
          title,
          dependencies,
          supersedes,
          append_to,
        } = req.body;

        const participants = await listParticipants(p);
        if (!(participant_id in participants)) {
          throw new Error(`unknown participant: ${participant_id}`);
        }

        await mkdir(p.sessionDir(req.params.id), { recursive: true });

        let stamped = isoTimestamp();
        let folderName = "";
        let folderPath = "";
        let allocated = false;
        for (let attempt = 0; attempt < 256; attempt++) {
          folderName = composeFilename({
            timestamp: stamped,
            participant_id,
            kind: "html",
          });
          folderPath = join(p.sessionDir(req.params.id), folderName);
          assertWithinSession(p, req.params.id, folderPath);
          if (await tryMkdir(folderPath)) {
            allocated = true;
            break;
          }
          stamped = bumpSecond(stamped);
        }
        if (!allocated) {
          throw new Error("could not allocate unique html bundle folder");
        }

        const manifestId = folderName.replace(/\.html$/, "");
        const manifest: HtmlManifest = { id: manifestId };
        if (typeof title === "string" && title.length > 0) {
          manifest.title = title;
        }
        if (Array.isArray(dependencies)) {
          manifest.dependencies = dependencies;
        }
        if (typeof append_to === "string" && append_to.length > 0) {
          manifest.append_to = append_to;
        }

        const manifestPath = join(folderPath, "manifest.json");
        const indexPath = join(folderPath, "index.html");
        assertWithinSession(p, req.params.id, manifestPath);
        assertWithinSession(p, req.params.id, indexPath);
        await writeFile(manifestPath, JSON.stringify(manifest, null, 2), {
          flag: "wx",
        });
        await writeFile(indexPath, html, { flag: "wx" });

        if (typeof css === "string" && css.length > 0) {
          const cssPath = join(folderPath, "style.css");
          assertWithinSession(p, req.params.id, cssPath);
          await writeFile(cssPath, css, { flag: "wx" });
        }
        if (typeof js === "string" && js.length > 0) {
          const jsPath = join(folderPath, "script.js");
          assertWithinSession(p, req.params.id, jsPath);
          await writeFile(jsPath, js, { flag: "wx" });
        }

        publish(
          req.params.id,
          folderName,
          "html",
          participant_id,
          supersedes,
        );
        return {
          filename: folderName,
          timestamp: folderName.split("_")[0]!,
          participant_id,
          kind: "html" as const,
        };
      } catch (err) {
        reply.code(400);
        return { error: err instanceof Error ? err.message : String(err) };
      }
    },
  );
}
