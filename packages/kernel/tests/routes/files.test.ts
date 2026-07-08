import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createServer } from "../../src/server.js";
import { initProject } from "../../src/project.js";
import { paths } from "../../src/paths.js";
import { createSession } from "../../src/sessions.js";
import { listParticipants } from "../../src/participants.js";
import { MAX_ATTACHMENT_BYTES } from "../../src/routes/files.js";
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
          root,
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
          root,
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
          root,
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
  it("sets the local upload staging cap to 1 GiB", () => {
    expect(MAX_ATTACHMENT_BYTES).toBe(1024 * 1024 * 1024);
  });

  it("uploads a multipart file and returns staging metadata (no event written)", async () => {
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
      expect(body.id).toMatch(/^att_[a-f0-9]{12}$/);
      expect(body.display_name).toBe("note.txt");
      expect(body.mime_type).toBe("text/plain");
      expect(body.size_bytes).toBe("hello attachment".length);
      expect(body.preview_kind).toBe("text");
      expect(body.path).toMatch(/^attachments\/att_[a-f0-9]{12}\/note\.txt$/);
      expect(body.filename).toBeUndefined();
      expect(body.kind).toBeUndefined();

      await expect(
        readFile(join(p.sessionDir(sessionId), body.path), "utf8"),
      ).resolves.toBe("hello attachment");
      await app.close();
    });
  });

  it("classifies media and code-like uploads for inline previews", async () => {
    await withTempProject(async (root) => {
      const { app, sessionId, pid } = await setup(root);

      const cases = [
        {
          filename: "clip.mp4",
          contentType: "video/mp4",
          expected: "video",
        },
        {
          filename: "voice.mp3",
          contentType: "audio/mpeg",
          expected: "audio",
        },
        {
          filename: "script.js",
          contentType: "application/octet-stream",
          expected: "text",
        },
      ] as const;

      for (const item of cases) {
        const upload = multipartPayload([
          {
            name: "file",
            filename: item.filename,
            contentType: item.contentType,
            value: Buffer.from("bytes"),
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
        expect(body.preview_kind).toBe(item.expected);

        const event = await app.inject({
          method: "POST",
          url: `/sessions/${sessionId}/events/file`,
          payload: {
            root,
            participant_id: pid,
            id: body.id,
            path: body.path,
            mime_type: body.mime_type,
            display_name: body.display_name,
            size_bytes: body.size_bytes,
            preview_kind: body.preview_kind,
          },
        });
        expect(event.statusCode).toBe(200);
      }

      await app.close();
    });
  });

  it("commits a staged attachment to a file event when /events/file is POSTed with the metadata", async () => {
    await withTempProject(async (root) => {
      const { p, app, sessionId, pid } = await setup(root);
      const upload = multipartPayload([
        {
          name: "file",
          filename: "diagram.png",
          contentType: "image/png",
          value: Buffer.from([0x89, 0x50, 0x4e, 0x47]),
        },
      ]);
      const staged = (
        await app.inject({
          method: "POST",
          url: `/sessions/${sessionId}/attachments`,
          headers: upload.headers,
          payload: upload.payload,
        })
      ).json();

      const event = await app.inject({
        method: "POST",
        url: `/sessions/${sessionId}/events/file`,
        payload: {
          root,
          participant_id: pid,
          id: staged.id,
          path: staged.path,
          mime_type: staged.mime_type,
          display_name: staged.display_name,
          size_bytes: staged.size_bytes,
          preview_kind: staged.preview_kind,
        },
      });
      expect(event.statusCode).toBe(200);
      const eventBody = event.json();
      expect(eventBody.kind).toBe("file");

      const onDisk = JSON.parse(
        await readFile(join(p.sessionDir(sessionId), eventBody.filename), "utf8"),
      );
      expect(onDisk.schema).toBe("fmark.file.v1");
      expect(onDisk.id).toBe(staged.id);
      expect(onDisk.display_name).toBe(staged.display_name);
      expect(onDisk.size_bytes).toBe(staged.size_bytes);
      expect(onDisk.preview_kind).toBe("image");

      const content = await app.inject({
        method: "GET",
        url: `/sessions/${sessionId}/attachments/${staged.id}/content`,
      });
      expect(content.statusCode).toBe(200);
      expect(content.headers["content-type"]).toContain("image/png");
      expect(content.headers["x-content-type-options"]).toBe("nosniff");
      expect(content.headers["content-disposition"]).toBeUndefined();
      await app.close();
    });
  });

  it("serves active attachment content inline but sandboxed", async () => {
    await withTempProject(async (root) => {
      const { app, sessionId, pid } = await setup(root);
      const upload = multipartPayload([
        {
          name: "file",
          filename: "page.html",
          contentType: "text/html",
          value: Buffer.from("<script>alert(1)</script>"),
        },
      ]);
      const staged = (
        await app.inject({
          method: "POST",
          url: `/sessions/${sessionId}/attachments`,
          headers: upload.headers,
          payload: upload.payload,
        })
      ).json();
      const event = await app.inject({
        method: "POST",
        url: `/sessions/${sessionId}/events/file`,
        payload: {
          root,
          participant_id: pid,
          id: staged.id,
          path: staged.path,
          mime_type: staged.mime_type,
          display_name: staged.display_name,
          size_bytes: staged.size_bytes,
          preview_kind: staged.preview_kind,
        },
      });
      expect(event.statusCode).toBe(200);

      const content = await app.inject({
        method: "GET",
        url: `/sessions/${sessionId}/attachments/${staged.id}/content`,
      });
      expect(content.statusCode).toBe(200);
      expect(content.headers["content-type"]).toContain("text/html");
      expect(content.headers["x-content-type-options"]).toBe("nosniff");
      expect(content.headers["content-security-policy"]).toBe("sandbox");
      expect(content.headers["content-disposition"]).toBeUndefined();
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

describe("DELETE /sessions/:id/attachments/:file_id", () => {
  it("removes a staged attachment that has not been committed", async () => {
    await withTempProject(async (root) => {
      const { p, app, sessionId } = await setup(root);
      const upload = multipartPayload([
        {
          name: "file",
          filename: "ditch.txt",
          contentType: "text/plain",
          value: Buffer.from("toss me"),
        },
      ]);
      const staged = (
        await app.inject({
          method: "POST",
          url: `/sessions/${sessionId}/attachments`,
          headers: upload.headers,
          payload: upload.payload,
        })
      ).json();

      const res = await app.inject({
        method: "DELETE",
        url: `/sessions/${sessionId}/attachments/${staged.id}`,
      });
      expect(res.statusCode).toBe(204);
      await expect(
        readFile(join(p.sessionDir(sessionId), staged.path), "utf8"),
      ).rejects.toThrow();
      await app.close();
    });
  });

  it("returns 409 when the attachment is already referenced by a file event", async () => {
    await withTempProject(async (root) => {
      const { app, sessionId, pid } = await setup(root);
      const upload = multipartPayload([
        {
          name: "file",
          filename: "keep.txt",
          contentType: "text/plain",
          value: Buffer.from("keep me"),
        },
      ]);
      const staged = (
        await app.inject({
          method: "POST",
          url: `/sessions/${sessionId}/attachments`,
          headers: upload.headers,
          payload: upload.payload,
        })
      ).json();
      await app.inject({
        method: "POST",
        url: `/sessions/${sessionId}/events/file`,
        payload: {
          root,
          participant_id: pid,
          id: staged.id,
          path: staged.path,
          mime_type: staged.mime_type,
          display_name: staged.display_name,
        },
      });

      const res = await app.inject({
        method: "DELETE",
        url: `/sessions/${sessionId}/attachments/${staged.id}`,
      });
      expect(res.statusCode).toBe(409);
      await app.close();
    });
  });

  it("returns 400 for an invalid attachment id", async () => {
    await withTempProject(async (root) => {
      const { app, sessionId } = await setup(root);
      const res = await app.inject({
        method: "DELETE",
        url: `/sessions/${sessionId}/attachments/..%2Fetc`,
      });
      expect(res.statusCode).toBe(400);
      await app.close();
    });
  });
});
