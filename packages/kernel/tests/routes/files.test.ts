import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createServer } from "../../src/server.js";
import { initProject } from "../../src/project.js";
import { paths } from "../../src/paths.js";
import { createSession } from "../../src/sessions.js";
import { listParticipants } from "../../src/participants.js";
import { withTempProject } from "../helpers/tempdir.js";

async function setup(root: string) {
  const p = paths(root);
  await initProject(p);
  const session = await createSession(p, { slug: "x" });
  const [pid] = Object.keys(await listParticipants(p));
  const { app } = createServer({ token: null, paths: p });
  return { p, app, sessionId: session.id, pid: pid! };
}

function multipartPayload(parts: Array<
  | { name: string; value: string }
  | { name: string; filename: string; contentType: string; value: Buffer }
>): { payload: Buffer; headers: Record<string, string> } {
  const boundary = "----fmark-route-test";
  const chunks: Buffer[] = [];
  for (const part of parts) {
    chunks.push(Buffer.from(`--${boundary}\r\n`));
    if ("filename" in part) {
      chunks.push(
        Buffer.from(
          `Content-Disposition: form-data; name="${part.name}"; filename="${part.filename}"\r\n`,
        ),
      );
      chunks.push(Buffer.from(`Content-Type: ${part.contentType}\r\n\r\n`));
      chunks.push(part.value);
      chunks.push(Buffer.from("\r\n"));
    } else {
      chunks.push(
        Buffer.from(
          `Content-Disposition: form-data; name="${part.name}"\r\n\r\n${part.value}\r\n`,
        ),
      );
    }
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`));
  return {
    payload: Buffer.concat(chunks),
    headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
  };
}

describe("POST /sessions/:id/events/file", () => {
  it("writes a file event referencing the asset", async () => {
    await withTempProject(async (root) => {
      const { p, app, sessionId, pid } = await setup(root);
      const res = await app.inject({
        method: "POST",
        url: `/sessions/${sessionId}/events/file`,
        payload: {
          participant_id: pid,
          id: "f1",
          path: "assets/diagram.png",
          mime_type: "image/png",
          description: "diagram",
        },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.filename).toMatch(/\.file\.json$/);
      expect(body.kind).toBe("file");
      const fileOnDisk = await readFile(
        join(p.sessionDir(sessionId), body.filename),
        "utf8",
      );
      const payload = JSON.parse(fileOnDisk);
      expect(payload.id).toBe("f1");
      expect(payload.mime_type).toBe("image/png");
      expect(payload.description).toBe("diagram");
      await app.close();
    });
  });

  it("returns 400 on missing required fields", async () => {
    await withTempProject(async (root) => {
      const { app, sessionId, pid } = await setup(root);
      const res = await app.inject({
        method: "POST",
        url: `/sessions/${sessionId}/events/file`,
        payload: {
          participant_id: pid,
          id: "f1",
          // missing path and mime_type
        },
      });
      expect(res.statusCode).toBe(400);
      await app.close();
    });
  });

  it("returns 404 on unknown session", async () => {
    await withTempProject(async (root) => {
      const { app, pid } = await setup(root);
      const res = await app.inject({
        method: "POST",
        url: `/sessions/no-such/events/file`,
        payload: {
          participant_id: pid,
          id: "f1",
          path: "assets/x.png",
          mime_type: "image/png",
        },
      });
      expect(res.statusCode).toBe(404);
      await app.close();
    });
  });
});

describe("session attachments", () => {
  it("uploads a multipart file, records a file event, and serves the content", async () => {
    await withTempProject(async (root) => {
      const { p, app, sessionId, pid } = await setup(root);
      const upload = multipartPayload([
        { name: "participant_id", value: pid },
        { name: "display_name", value: "note.txt" },
        {
          name: "file",
          filename: "note.txt",
          contentType: "text/plain",
          value: Buffer.from("hello attachment"),
        },
      ]);

      const res = await app.inject({
        method: "POST",
        url: `/sessions/${sessionId}/attachments`,
        headers: upload.headers,
        payload: upload.payload,
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.kind).toBe("file");
      expect(body.payload.schema).toBe("fmark.file.v1");
      expect(body.payload.display_name).toBe("note.txt");
      expect(body.payload.mime_type).toBe("text/plain");
      expect(body.payload.size_bytes).toBe("hello attachment".length);
      expect(body.payload.preview_kind).toBe("text");
      expect(body.payload.path).toMatch(/^attachments\/att_[a-f0-9]{12}\/note\.txt$/);

      const eventOnDisk = JSON.parse(
        await readFile(join(p.sessionDir(sessionId), body.filename), "utf8"),
      );
      expect(eventOnDisk).toEqual(body.payload);
      await expect(
        readFile(join(p.sessionDir(sessionId), body.payload.path), "utf8"),
      ).resolves.toBe("hello attachment");

      const content = await app.inject({
        method: "GET",
        url: `/sessions/${sessionId}/attachments/${body.payload.id}/content`,
      });
      expect(content.statusCode).toBe(200);
      expect(content.headers["content-type"]).toContain("text/plain");
      expect(content.body).toBe("hello attachment");
      await app.close();
    });
  });

  it("returns 400 when multipart upload has no file", async () => {
    await withTempProject(async (root) => {
      const { app, sessionId, pid } = await setup(root);
      const upload = multipartPayload([{ name: "participant_id", value: pid }]);
      const res = await app.inject({
        method: "POST",
        url: `/sessions/${sessionId}/attachments`,
        headers: upload.headers,
        payload: upload.payload,
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error).toBe("file is required");
      await app.close();
    });
  });
});
