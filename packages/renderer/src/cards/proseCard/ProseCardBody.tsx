import { type JSX } from "react";
import { type MarkdownMode } from "../../render/MarkdownRenderer.js";
import { BlockAccordion } from "../../render/BlockAccordion.js";
import { ProseEmptyState } from "../ProseEmptyState.js";
import { ProseInlineBlock } from "../ProseInlineBlock.js";
import type { ProseCardModel } from "./model.js";

const NO_LOOSE_STRING_VALUES = {
  accordion: "accordion",
} as const;

interface Props {
  model: ProseCardModel;
  mode: MarkdownMode;
}

export function ProseCardBody({ model, mode }: Props): JSX.Element {
  return (
    <div className={`prose-body${model.who.isUser ? " user" : ""}`}>
      <ProseFrontmatter model={model} />
      {mode === NO_LOOSE_STRING_VALUES.accordion ? (
        <AccordionBody model={model} />
      ) : (
        <RenderedBody model={model} mode={mode} />
      )}
      {model.isTrulyEmpty && <ProseEmptyState />}
    </div>
  );
}

function ProseFrontmatter({
  model,
}: {
  model: ProseCardModel;
}): JSX.Element | null {
  if (model.frontmatterEntries.length === 0) return null;
  return (
    <div className="prose-frontmatter">
      {model.frontmatterEntries.map(([label, value]) => (
        <span key={label}>
          <b>{label}:</b> {value}
        </span>
      ))}
    </div>
  );
}

function AccordionBody({ model }: { model: ProseCardModel }): JSX.Element {
  return (
    <BlockAccordion
      blocks={model.blocks}
      participants={model.participants}
      commentsByFilename={model.commentsByFilename}
      legacyBlock={model.hasLegacyContent ? model.legacyBlock() : undefined}
      legacyComments={model.comments}
    />
  );
}

function RenderedBody({
  model,
  mode,
}: {
  model: ProseCardModel;
  mode: MarkdownMode;
}): JSX.Element {
  return (
    <>
      {model.hasLegacyContent && (
        <ProseInlineBlock
          event={model.legacyBlock()}
          participants={model.participants}
          comments={model.comments}
          mode={mode}
        />
      )}
      {model.blocks.map((block) => (
        <ProseInlineBlock
          key={block.filename}
          event={block}
          participants={model.participants}
          comments={model.commentsForBlock(block.filename)}
          mode={mode}
        />
      ))}
    </>
  );
}
