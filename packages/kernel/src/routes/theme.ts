/**
 * Theme routes.
 *
 *   GET   /theme          → the active theme/font design-document markdown.
 *   PATCH /theme          → the renderer reports the currently-applied theme/font.
 *
 * The active theme/font are selected client-side (`fmark.theme` / `fmark.font`),
 * so the kernel has no DOM-level knowledge of them. The renderer PATCHes the applied
 * appearance here on change (see renderer `themes/report.ts`); the kernel holds
 * it in a tiny in-memory store so `fmark_get_theme` reflects what's actually on
 * screen. GET accepts optional `theme` / `font` overrides and defaults to the
 * reported (else default) appearance.
 *
 * App-wide and read-mostly: not session- or path-scoped.
 */

import type { FastifyInstance } from "fastify";
import {
  buildActiveThemeDoc,
  getReportedFont,
  getReportedTheme,
  setReportedAppearance,
} from "../services/theme.js";

export function registerThemeRoutes(app: FastifyInstance): void {
  app.get<{ Querystring: { theme?: string; font?: string; format?: string } }>(
    "/theme",
    {
      schema: {
        querystring: {
          type: "object",
          properties: {
            theme: { type: "string" },
            font: { type: "string" },
            format: { type: "string", enum: ["markdown", "json"] },
          },
        },
      },
    },
    async (req, reply) => {
      let doc: ReturnType<typeof buildActiveThemeDoc>;
      try {
        doc = buildActiveThemeDoc(req.query.theme, req.query.font);
      } catch (err) {
        reply.code(400);
        return { error: err instanceof Error ? err.message : String(err) };
      }
      if (req.query.format === "json") {
        return {
          theme: doc.theme,
          source: doc.source,
          font: doc.font,
          font_source: doc.fontSource,
          markdown: doc.markdown,
        };
      }
      reply.header("Content-Type", "text/markdown; charset=utf-8");
      return doc.markdown;
    },
  );

  app.patch<{ Body: { theme: string; font?: string } }>(
    "/theme",
    {
      schema: {
        body: {
          type: "object",
          required: ["theme"],
          additionalProperties: false,
          properties: {
            theme: { type: "string", minLength: 1 },
            font: { type: "string", minLength: 1 },
          },
        },
      },
    },
    async (req, reply) => {
      const result = setReportedAppearance(req.body.theme, req.body.font);
      if (!result.ok) {
        reply.code(400);
        return { error: result.error };
      }
      return { theme: getReportedTheme(), font: getReportedFont() };
    },
  );
}
