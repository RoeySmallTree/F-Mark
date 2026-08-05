import { useRef, type JSX } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Rocket,
  Sparkles,
  X,
} from "lucide-react";
import {
  ONBOARDING_STEPS,
  type OnboardingStep,
} from "./types.js";
import { ThemeStep } from "./ThemeStep.js";
import { ProvidersStep } from "./ProvidersStep.js";
import { FolderStep } from "./FolderStep.js";
import { TodosStep } from "./TodosStep.js";
import { ProfileStep } from "./ProfileStep.js";
import type { OnboardingController } from "./useOnboardingController.js";
import { useFocusTrap } from "../../a11y/useFocusTrap.js";

const NO_LOOSE_STRING_VALUES = {
  finishing: "finishing",
  launching: "Launching…",
} as const;

interface OnboardingViewProps {
  controller: OnboardingController;
}

interface StepRailProps {
  step: OnboardingStep;
  idx: number;
  goTo(step: OnboardingStep): void;
}

const STEP_TITLES: Record<OnboardingStep, string> = {
  profile: "who the f**k are you?",
  theme: "Pick your look",
  providers: "Set up your providers",
  folder: "Choose your project",
  todos: "Line up the first run",
};

function StepRail({ step, idx, goTo }: StepRailProps): JSX.Element {
  return (
    <nav className="ob-rail" aria-label="Onboarding steps">
      {ONBOARDING_STEPS.map((item, i) => {
        const active = item.key === step;
        const done = i < idx;
        return (
          <button
            key={item.key}
            type="button"
            className={`ob-rail-item${active ? " active" : ""}${done ? " done" : ""}`}
            aria-current={active ? "step" : undefined}
            onClick={() => goTo(item.key)}
          >
            <span className="ob-rail-num">
              {done ? <Check size={12} aria-hidden /> : i + 1}
            </span>
            <span className="ob-rail-text">
              <span className="ob-rail-label">{item.label}</span>
              <span className="ob-rail-blurb">{item.blurb}</span>
            </span>
          </button>
        );
      })}
    </nav>
  );
}

function StepContent({ controller }: OnboardingViewProps): JSX.Element {
  switch (controller.step) {
    case "profile":
      return (
        <ProfileStep
          name={controller.name}
          avatarPreset={controller.avatarPreset}
          color={controller.userColor}
          onNameChange={controller.setName}
          onAvatarPresetChange={controller.setAvatarPreset}
        />
      );
    case "theme":
      return <ThemeStep />;
    case "providers":
      return (
        <ProvidersStep
          token={controller.token}
          runtimes={controller.spawn.runtimes}
          disabledReason={controller.spawn.spawnDisabledReason}
          chosenRuntimeId={controller.chosen?.runtimeId ?? null}
          modelForRuntime={controller.spawn.modelForRuntime}
          effortForRuntime={controller.spawn.effortForRuntime}
          onChoose={controller.onChoose}
        />
      );
    case "folder":
      return (
        <FolderStep
          folder={controller.folder}
          onPickFolder={controller.onPickFolder}
        />
      );
    case "todos":
      return (
        <TodosStep
          todos={controller.todos}
          prompt={controller.prompt}
          agentName={controller.chosen?.identity.name ?? null}
          onTodosChange={controller.setTodos}
          onPromptChange={controller.setPrompt}
        />
      );
  }
}

function WizardFooter({ controller }: OnboardingViewProps): JSX.Element {
  return (
    <div className="modal-foot ob-foot">
      <button type="button" className="btn-ghost" onClick={controller.skip}>
        Skip for now
      </button>
      <div className="foot-actions">
        {controller.idx > 0 ? (
          <button
            type="button"
            className="btn-ghost"
            onClick={controller.back}
            disabled={controller.busy !== null}
          >
            <ArrowLeft size={13} aria-hidden /> Back
          </button>
        ) : null}
        <button
          type="button"
          className="btn-solid ob-primary"
          disabled={controller.primaryDisabled}
          onClick={() => (controller.isLast ? void controller.finish() : controller.next())}
        >
          {controller.isLast ? (
            <>
              <Rocket size={13} aria-hidden />
              {controller.busy === NO_LOOSE_STRING_VALUES.finishing ? NO_LOOSE_STRING_VALUES.launching : "Finish & launch"}
            </>
          ) : (
            <>
              Next <ArrowRight size={13} aria-hidden />
            </>
          )}
        </button>
      </div>
    </div>
  );
}

export function OnboardingView({ controller }: OnboardingViewProps): JSX.Element {
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef, true);

  return (
    <div className="modal-backdrop ob-backdrop" role="presentation">
      <div
        ref={dialogRef}
        className="modal ob-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ob-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-head ob-head">
          <div className="modal-eyebrow">
            <Sparkles size={11} aria-hidden /> GET STARTED
          </div>
          <h2 className="modal-title" id="ob-title">
            {STEP_TITLES[controller.step]}
          </h2>
          <button
            type="button"
            className="icon-btn modal-close"
            aria-label="Skip onboarding"
            onClick={controller.skip}
          >
            <X size={14} aria-hidden />
          </button>
        </div>

        <div className="ob-shell">
          <StepRail step={controller.step} idx={controller.idx} goTo={controller.goTo} />
          <div className="ob-content">
            <StepContent controller={controller} />
          </div>
        </div>

        {controller.error !== null ? (
          <div className="ob-error form-error" role="alert">
            {controller.error}
          </div>
        ) : null}

        <WizardFooter controller={controller} />
      </div>
    </div>
  );
}
