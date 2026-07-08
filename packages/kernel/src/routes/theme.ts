/**
 * Theme routes.
 *
 *   GET   /theme          → the active theme's design-document markdown.
 *   PATCH /theme          → the renderer reports the currently-applied theme.
 *
 * The active theme is selected client-side (localStorage `fmark.theme`), so the
 * kernel has no DOM-level knowledge of it. The renderer PATCHes the applied
 * theme here on change (see renderer `themes/report.ts`); the kernel holds it in
 * a tiny in-memory store so `fmark_get_theme` reflects what's actually on
 * screen. Both endpoints accept an optional `theme` override and default to the
 * reported (else default) theme.
 *
 * App-wide and read-mostly: not session- or path-scoped.
 */

import type { FastifyInstance } from "fastify";
import {
  buildActiveThemeDoc,
  getReportedTheme,
  setReportedTheme,
} from "../services/theme.js";

export function registerThemeRoutes(app: FastifyInstance): void {
  app.get<{ Querystring: { theme?: string; format?: string } }>(
    "/theme",
    {
      schema: {
        querystring: {
          type: "object",
          properties: {
            theme: { type: "string" },
            format: { type: "string", enum: ["markdown", "json"] },
          },
        },
      },
    },
    async (req, reply) => {
      let doc: ReturnType<typeof buildActiveThemeDoc>;
      try {
        doc = buildActiveThemeDoc(req.query.theme);
      } catch (err) {
        reply.code(400);
        return { error: err instanceof Error ? err.message : String(err) };
      }
      if (req.query.format === "json") {
        return { theme: doc.theme, source: doc.source, markdown: doc.markdown };
      }
      reply.header("Content-Type", "text/markdown; charset=utf-8");
      return doc.markdown;
    },
  );

  app.patch<{ Body: { theme: string } }>(
    "/theme",
    {
      schema: {
        body: {
          type: "object",
          required: ["theme"],
          additionalProperties: false,
          properties: { theme: { type: "string", minLength: 1 } },
        },
      },
    },
    async (req, reply) => {
      const ok = setReportedTheme(req.body.theme);
      if (!ok) {
        reply.code(400);
        return { error: `unknown theme: ${req.body.theme}` };
      }
      return { theme: getReportedTheme() };
    },
  );
}
