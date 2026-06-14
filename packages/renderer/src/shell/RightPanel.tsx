import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { SlidersHorizontal } from "lucide-react";
import {
  resolveRightTabsConfig,
  useStore,
  type RightPanelView,
  type RightTabKey,
} from "../state/store.js";
import { aggregate } from "../state/aggregate.js";
import { RightTodos } from "../panels/right/RightTodos.js";
import { RightComments } from "../panels/right/RightComments.js";
import { RightNamed } from "../panels/right/RightNamed.js";
import { RightAgents } from "../panels/right/RightAgents.js";
import { RightLog } from "../panels/right/RightLog.js";
import { RightFiles } from "../panels/right/RightFiles.js";
import { RightLayout } from "../panels/right/RightLayout.js";
import { RIGHT_TAB_META } from "../panels/right/tabMeta.js";
import { LogLevel, useSeqLog } from "../hooks/useSeqLog.js";
import { PaneResizer } from "../components/PaneResizer.js";

export function RightPanel(): JSX.Element {
  const rightTab = useStore((s) => s.rightTab);
  const setRightTab = useStore((s) => s.setRightTab);
  const sessions = useStore((s) => s.sessions);
  const currentSessionId = useStore((s) => s.currentSessionId);
  const activePath = useStore((s) => s.activePath);
  const participants = useStore((s) => s.participants);
  const events = useStore((s) => s.events);
  const commentTarget = useStore((s) => s.commentTarget);
  const scrollMap = useStore((s) => s.rightScrollBySession);
  const setRightScroll = useStore((s) => s.setRightScroll);
  const tabsRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const log = useSeqLog("RightPanel");

  const scrollTabIntoCenter = useCallback((tab: RightPanelView): void => {
    const container = tabsRef.current;
    if (container === null) return;
    const button = container.querySelector<HTMLButtonElement>(
      `button[data-tab="${tab}"]`,
    );
    if (button === null) return;
    const containerRect = container.getBoundingClientRect();
    const buttonRect = button.getBoundingClientRect();
    const buttonCenter =
      buttonRect.left - containerRect.left + buttonRect.width / 2;
    const target = container.scrollLeft + buttonCenter - container.clientWidth / 2;
    const left = Math.max(0, target);
    if (typeof container.scrollTo === "function") {
      container.scrollTo({ left, behavior: "smooth" });
    } else {
      container.scrollLeft = left;
    }
  }, []);

  const selectTab = useCallback(
    (tab: RightPanelView): void => {
      log("RightPanel tab clicked", { tab }, LogLevel.Info);
      setRightTab(tab);
      scrollTabIntoCenter(tab);
    },
    [log, scrollTabIntoCenter, setRightTab],
  );

  const slug = useMemo(
    () =>
      sessions.find((s) => s.id === currentSessionId)?.slug ?? "no session",
    [sessions, currentSessionId],
  );

  const agg = useMemo(() => aggregate(events), [events]);
  const commentsCount = useMemo(() => {
    let total = 0;
    for (const list of agg.commentsByTarget.values()) total += list.length;
    return total;
  }, [agg]);
  const namedCount = agg.named.length;
  const agentsCount = useMemo(
    () =>
      Object.values(participants).filter(
        (participant) =>
          participant.kind === "agent" &&
          participant.active_session === currentSessionId,
      ).length,
    [currentSessionId, participants],
  );

  /* Resolve the effective tab config (per-session override or global) and
     derive the filtered/ordered list of tabs to render. */
  const rightTabsConfig = useStore((s) => s.rightTabsConfig);
  const rightTabsConfigBySession = useStore(
    (s) => s.rightTabsConfigBySession,
  );
  const resolvedTabs = useMemo(
    () =>
      resolveRightTabsConfig(
        rightTabsConfig,
        rightTabsConfigBySession,
        currentSessionId,
      ),
    [rightTabsConfig, rightTabsConfigBySession, currentSessionId],
  );
  const enabledTabs = useMemo(
    () => resolvedTabs.filter((t) => t.enabled),
    [resolvedTabs],
  );

  /* Counts shown as a small badge after the tab label. Tabs without a
     count entry render without one (Todos, Log, Files). */
  const counts: Partial<Record<RightTabKey, number>> = {
    comments: commentsCount,
    named: namedCount,
    agents: agentsCount,
  };

  useEffect(() => {
    /* Auto-switch to Comments only when the user actually has Comments
       enabled in their resolved config — respect the disabled choice. */
    if (commentTarget === null || rightTab === "comments") return;
    const commentsEnabled = enabledTabs.some((t) => t.key === "comments");
    if (commentsEnabled) setRightTab("comments");
  }, [commentTarget, rightTab, setRightTab, enabledTabs]);

  /* When the user disables the currently-active tab, fall back to the
     first enabled tab — or to the Layout view if none are enabled (the
     last-enabled lock prevents that, but the fallback stays safe). */
  useEffect(() => {
    if (rightTab === "layout") return;
    const stillEnabled = enabledTabs.some((t) => t.key === rightTab);
    if (stillEnabled) return;
    const fallback: RightPanelView = enabledTabs[0]?.key ?? "layout";
    setRightTab(fallback);
  }, [enabledTabs, rightTab, setRightTab]);

  useLayoutEffect(() => {
    scrollTabIntoCenter(rightTab);
  }, [rightTab, scrollTabIntoCenter]);

  /* Restore the saved scrollTop when the session changes (or the tab does,
     since the active tab's component mounts fresh). Runs in a layout effect
     so the user never sees the panel snap from 0 → saved position. */
  useLayoutEffect(() => {
    const root = scrollRef.current;
    if (root === null) return;
    if (currentSessionId === null) return;
    const saved = scrollMap[currentSessionId] ?? 0;
    root.scrollTop = saved;
    /* `scrollMap` is intentionally NOT a dep — we only want to restore on
       session/tab switch, not whenever the persisted value updates (which
       happens after every save, creating a feedback loop). */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSessionId, rightTab]);

  /* Save the scroll position after a brief idle window so we don't write
     to localStorage on every wheel tick. Keyed off the scroll handler ref
     to coalesce bursts. */
  const scrollSaveTimerRef = useRef<number | null>(null);
  const onPanelScroll = useCallback(
    (e: React.UIEvent<HTMLDivElement>): void => {
      const top = e.currentTarget.scrollTop;
      if (scrollSaveTimerRef.current !== null) {
        clearTimeout(scrollSaveTimerRef.current);
      }
      scrollSaveTimerRef.current = window.setTimeout(() => {
        scrollSaveTimerRef.current = null;
        setRightScroll(top);
      }, 200);
    },
    [setRightScroll],
  );
  useEffect(
    () => () => {
      if (scrollSaveTimerRef.current !== null) {
        clearTimeout(scrollSaveTimerRef.current);
      }
    },
    [],
  );

  return (
    <aside className="right-panel" aria-label="Right panel">
      <PaneResizer pane="rightPanel" />
      <div
        ref={tabsRef}
        className="right-tabs"
        role="tablist"
        aria-label="Right panel tabs"
      >
        {enabledTabs.map((entry) => {
          const meta = RIGHT_TAB_META[entry.key];
          const count = counts[entry.key];
          return (
            <button
              key={entry.key}
              type="button"
              role="tab"
              data-tab={entry.key}
              aria-selected={rightTab === entry.key}
              className={rightTab === entry.key ? "active" : ""}
              onClick={() => selectTab(entry.key)}
            >
              {meta.icon}
              {meta.icon !== null ? " " : null}
              {meta.label}
              {count !== undefined ? (
                <>
                  {" "}
                  <span className="ct">{count}</span>
                </>
              ) : null}
            </button>
          );
        })}
        <button
          type="button"
          role="tab"
          data-tab="layout"
          aria-selected={rightTab === "layout"}
          aria-label="Layout settings"
          title="Layout settings"
          className={`icon-only${rightTab === "layout" ? " active" : ""}`}
          onClick={() => selectTab("layout")}
        >
          <SlidersHorizontal size={12} aria-hidden="true" />
        </button>
      </div>
      <div
        className="scope"
        style={{
          padding: "8px 14px 0",
          fontFamily: "var(--mono)",
          fontSize: 10.5,
          color: "var(--ink-4)",
          letterSpacing: ".04em",
          overflow: "hidden",
          whiteSpace: "nowrap",
        }}
        title={
          rightTab === "files" ? (activePath ?? "no path") : slug
        }
      >
        in{" "}
        <b
          style={{
            color: "var(--ink-2)",
            fontWeight: 500,
            display: "inline-block",
            maxWidth: "calc(100% - 24px)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            verticalAlign: "bottom",
            direction: rightTab === "files" ? "rtl" : "ltr",
            unicodeBidi: "plaintext",
          }}
        >
          {rightTab === "files" ? (activePath ?? "no path") : slug}
        </b>
      </div>
      <div
        ref={scrollRef}
        className="panel-scroll"
        onScroll={onPanelScroll}
      >
        {rightTab === "todos" && <RightTodos />}
        {rightTab === "comments" && <RightComments />}
        {rightTab === "named" && <RightNamed />}
        {rightTab === "agents" && <RightAgents />}
        {rightTab === "log" && <RightLog />}
        {rightTab === "files" && <RightFiles />}
        {rightTab === "layout" && <RightLayout />}
      </div>
    </aside>
  );
}
