import type {
  AnyEventRecord,
  ChoicesPayload,
  ChoicePayload,
} from "@f-mark/shared";
import { useStore } from "../../state/store.js";
import { createClient } from "../../api/client.js";

interface Props {
  event: AnyEventRecord;
  answers: AnyEventRecord[];
}

export function ChoicesCard({ event, answers }: Props): JSX.Element {
  const payload = event.payload as ChoicesPayload;
  const token = useStore((s) => s.token);
  const sessionId = useStore((s) => s.currentSessionId);
  const userId = useStore((s) => s.currentUserId);
  const lastAnswer = answers[answers.length - 1]?.payload as
    | ChoicePayload
    | undefined;
  const answered = lastAnswer?.selected ?? [];

  async function pick(optionId: string): Promise<void> {
    if (sessionId === null || userId === null) return;
    const client = createClient({ baseUrl: "", token });
    const selected = payload.multi
      ? answered.includes(optionId)
        ? answered.filter((x) => x !== optionId)
        : [...answered, optionId]
      : [optionId];
    await client.postChoice(sessionId, {
      participant_id: userId,
      choices_id: payload.id,
      selected,
    });
  }

  return (
    <article className="rounded-md border border-neutral-200 bg-white p-4">
      <header className="mb-3 text-xs text-neutral-500">
        {event.participant_id} asks
      </header>
      <h3 className="mb-2 text-sm font-medium">{payload.question}</h3>
      <ul className="space-y-1">
        {payload.options.map((opt) => {
          const isOn = answered.includes(opt.id);
          return (
            <li key={opt.id}>
              <button
                onClick={() => void pick(opt.id)}
                className={[
                  "w-full rounded border px-3 py-2 text-left text-sm",
                  isOn
                    ? "border-blue-500 bg-blue-50 text-blue-800"
                    : "border-neutral-200 hover:bg-neutral-50",
                ].join(" ")}
              >
                {opt.label}
              </button>
            </li>
          );
        })}
      </ul>
    </article>
  );
}
