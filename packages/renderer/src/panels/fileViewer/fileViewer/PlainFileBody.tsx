import { RenderedLineCommentRail } from "../lineComment/RenderedLineCommentRail.js";
import { AudioRenderer } from "../renderers/AudioRenderer.js";
import { BinaryFallbackRenderer } from "../renderers/BinaryFallbackRenderer.js";
import { CsvRenderer } from "../renderers/CsvRenderer.js";
import { ImageRenderer } from "../renderers/ImageRenderer.js";
import { JsonRenderer } from "../renderers/JsonRenderer.js";
import { MarkdownRenderer } from "../renderers/MarkdownRenderer.js";
import { MonacoRenderer } from "../renderers/MonacoRenderer.js";
import { OfficeRenderer } from "../renderers/OfficeRenderer.js";
import { PdfRenderer } from "../renderers/PdfRenderer.js";
import type { RendererKind } from "../renderers/pickRenderer.js";
import { VideoRenderer } from "../renderers/VideoRenderer.js";

export interface PlainFileBodyProps {
  kind: RendererKind;
  path: string;
}

type PlainRenderer = (path: string) => JSX.Element;

const PLAIN_RENDERERS = {
  image: (path) => <ImageRenderer key={path} path={path} />,
  video: (path) => <VideoRenderer key={path} path={path} />,
  audio: (path) => <AudioRenderer key={path} path={path} />,
  json: (path) => <JsonRenderer key={path} path={path} />,
  markdown: (path) => <MarkdownRenderer key={path} path={path} />,
  csv: (path) => (
    <RenderedLineCommentRail key={path} path={path}>
      <CsvRenderer path={path} />
    </RenderedLineCommentRail>
  ),
  pdf: (path) => <PdfRenderer key={path} path={path} />,
  "office-xlsx": (path) => (
    <OfficeRenderer key={path} path={path} kind="xlsx" />
  ),
  "office-docx": (path) => (
    <OfficeRenderer key={path} path={path} kind="docx" />
  ),
  "office-pptx": (path) => (
    <OfficeRenderer key={path} path={path} kind="pptx" />
  ),
  monaco: (path) => <MonacoRenderer key={path} path={path} />,
  binary: (path) => <BinaryFallbackRenderer key={path} path={path} />,
} satisfies Record<RendererKind, PlainRenderer>;

export function PlainFileBody({
  kind,
  path,
}: PlainFileBodyProps): JSX.Element {
  return PLAIN_RENDERERS[kind](path);
}
