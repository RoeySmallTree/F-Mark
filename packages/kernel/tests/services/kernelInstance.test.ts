import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { withTempProject } from "../helpers/tempdir.js";
import {
  KernelStartupLockError,
  acquireKernelStartupLock,
  allowMultipleKernels,
  confirmKernelHealth,
  healthKernelMatchesRecord,
  healthUrlForRecord,
  readKernelInstanceRecord,
  terminatePreviousKernelInstance,
  writeKernelInstanceRecord,
  type KernelInstanceRecord,
} from "../../src/services/kernelInstance.js";

function sampleRecord(
  overrides: Partial<KernelInstanceRecord> = {},
): KernelInstanceRecord {
  return {
    instance_id: "inst-old",
    pid: 41_001,
    config_root: "/tmp/fmark-config",
    project_root: "/tmp/fmark-project",
    path_id: "abc123def456",
    host: "localhost",
    port: 7777,
    version: "0.4.0",
    started_at: "2026-06-18T11:00:00.000Z",
    ...overrides,
  };
}

describe("kernel instance records", () => {
  it("matches health identity only when the instance, pid, and config root agree", () => {
    const record = sampleRecord();

    expect(
      healthKernelMatchesRecord(
        {
          status: "ok",
          kernel: record,
        },
        record,
        record.config_root,
      ),
    ).toBe(true);

    expect(
      healthKernelMatchesRecord(
        {
          status: "ok",
          kernel: { ...record, instance_id: "other" },
        },
        record,
        record.config_root,
      ),
    ).toBe(false);
  });

  it("confirms health through the injected health fetcher", async () => {
    const record = sampleRecord();
    await expect(
      confirmKernelHealth(record, record.config_root, {
        fetchHealth: vi.fn(async () => ({ kernel: record })),
      }),
    ).resolves.toBe(true);
  });

  it("always confirms through localhost instead of trusting record host", () => {
    expect(healthUrlForRecord(sampleRecord({ host: "example.com" }))).toBe(
      "http://localhost:7777/health",
    );
  });

  it("honors the explicit multi-kernel escape hatch", () => {
    expect(
      allowMultipleKernels({
        FMARK_ALLOW_MULTIPLE_KERNELS: "1",
      } as NodeJS.ProcessEnv),
    ).toBe(true);
    expect(
      allowMultipleKernels({
        FMARK_ALLOW_MULTIPLE_KERNELS: "true",
      } as NodeJS.ProcessEnv),
    ).toBe(false);
  });
});

describe("terminatePreviousKernelInstance", () => {
  it("ignores malformed records without signalling a process", async () => {
    await withTempProject(async (root) => {
      const instanceFile = join(root, "kernel-instance.json");
      await writeFile(instanceFile, "{not-json", "utf8");
      const signalProcess = vi.fn();

      const result = await terminatePreviousKernelInstance({
        instanceFile,
        configRoot: "/tmp/fmark-config",
        currentInstanceId: "inst-new",
        deps: {
          isPidAlive: vi.fn(async () => true),
          signalProcess,
        },
      });

      expect(result.action).toBe("invalid");
      expect(signalProcess).not.toHaveBeenCalled();
    });
  });

  it("removes a record for a dead PID without signalling", async () => {
    await withTempProject(async (root) => {
      const instanceFile = join(root, "kernel-instance.json");
      const record = sampleRecord({ config_root: root });
      await writeKernelInstanceRecord(instanceFile, record);
      const signalProcess = vi.fn();

      const result = await terminatePreviousKernelInstance({
        instanceFile,
        configRoot: root,
        currentInstanceId: "inst-new",
        deps: {
          isPidAlive: vi.fn(async () => false),
          signalProcess,
        },
      });

      expect(result.action).toBe("dead");
      expect(signalProcess).not.toHaveBeenCalled();
      await expect(readKernelInstanceRecord(instanceFile)).resolves.toBeNull();
    });
  });

  it("refuses to signal when /health identity is missing", async () => {
    await withTempProject(async (root) => {
      const instanceFile = join(root, "kernel-instance.json");
      const record = sampleRecord({ config_root: root });
      await writeKernelInstanceRecord(instanceFile, record);
      const signalProcess = vi.fn();

      const result = await terminatePreviousKernelInstance({
        instanceFile,
        configRoot: root,
        currentInstanceId: "inst-new",
        deps: {
          isPidAlive: vi.fn(async () => true),
          fetchHealth: vi.fn(async () => ({ status: "ok" })),
          signalProcess,
        },
      });

      expect(result.action).toBe("unconfirmed");
      expect(signalProcess).not.toHaveBeenCalled();
    });
  });

  it("sends SIGTERM and skips hard kill when liveness clears", async () => {
    await withTempProject(async (root) => {
      const instanceFile = join(root, "kernel-instance.json");
      const record = sampleRecord({ config_root: root });
      await writeKernelInstanceRecord(instanceFile, record);
      const aliveStates = [true, false];
      const signalProcess = vi.fn();
      const hardKillProcess = vi.fn();

      const result = await terminatePreviousKernelInstance({
        instanceFile,
        configRoot: root,
        currentInstanceId: "inst-new",
        deps: {
          isPidAlive: vi.fn(async () => aliveStates.shift() ?? false),
          fetchHealth: vi.fn(async () => ({ kernel: record })),
          signalProcess,
          hardKillProcess,
        },
      });

      expect(result.action).toBe("terminated");
      expect(signalProcess).toHaveBeenCalledWith(record.pid, "SIGTERM");
      expect(hardKillProcess).not.toHaveBeenCalled();
    });
  });

  it("hard-kills only after timeout and reconfirmed health identity", async () => {
    await withTempProject(async (root) => {
      const instanceFile = join(root, "kernel-instance.json");
      const record = sampleRecord({ config_root: root });
      await writeKernelInstanceRecord(instanceFile, record);
      const aliveStates = [true, true, false];
      const signalProcess = vi.fn();
      const hardKillProcess = vi.fn();
      const fetchHealth = vi.fn(async () => ({ kernel: record }));

      const result = await terminatePreviousKernelInstance({
        instanceFile,
        configRoot: root,
        currentInstanceId: "inst-new",
        gracefulShutdownMs: 0,
        hardKillWaitMs: 0,
        deps: {
          isPidAlive: vi.fn(async () => aliveStates.shift() ?? false),
          fetchHealth,
          signalProcess,
          hardKillProcess,
        },
      });

      expect(result.action).toBe("hard-killed");
      expect(signalProcess).toHaveBeenCalledWith(record.pid, "SIGTERM");
      expect(fetchHealth).toHaveBeenCalledTimes(2);
      expect(hardKillProcess).toHaveBeenCalledWith(record.pid);
    });
  });

  it("refuses hard kill when identity cannot be reconfirmed", async () => {
    await withTempProject(async (root) => {
      const instanceFile = join(root, "kernel-instance.json");
      const record = sampleRecord({ config_root: root });
      await writeKernelInstanceRecord(instanceFile, record);
      const aliveStates = [true, true];
      const healthStates = [{ kernel: record }, { status: "ok" }];

      await expect(
        terminatePreviousKernelInstance({
          instanceFile,
          configRoot: root,
          currentInstanceId: "inst-new",
          gracefulShutdownMs: 0,
          deps: {
            isPidAlive: vi.fn(async () => aliveStates.shift() ?? true),
            fetchHealth: vi.fn(async () => healthStates.shift() ?? null),
            signalProcess: vi.fn(),
            hardKillProcess: vi.fn(),
          },
        }),
      ).rejects.toThrow(/refusing to hard-kill an unconfirmed process/);
    });
  });
});

describe("kernel startup lock", () => {
  it("cleans a dead stale lock and releases only its own lock", async () => {
    await withTempProject(async (root) => {
      const lockDir = join(root, "kernel-startup.lock");
      await mkdir(lockDir);
      await writeFile(
        join(lockDir, "owner.json"),
        JSON.stringify({
          lock_id: "old-lock",
          pid: 99_999,
          started_at: "2026-06-18T10:00:00.000Z",
        }),
        "utf8",
      );

      const lock = await acquireKernelStartupLock(lockDir, {
        deps: {
          isPidAlive: vi.fn(async () => false),
        },
      });

      const owner = JSON.parse(
        await readFile(join(lockDir, "owner.json"), "utf8"),
      ) as { pid: number };
      expect(owner.pid).toBe(process.pid);

      await lock.release();
      await expect(stat(lockDir)).rejects.toMatchObject({ code: "ENOENT" });
    });
  });

  it("waits on a live recent lock and fails clearly when the wait is bounded", async () => {
    await withTempProject(async (root) => {
      const lockDir = join(root, "kernel-startup.lock");
      await mkdir(lockDir);
      await writeFile(
        join(lockDir, "owner.json"),
        JSON.stringify({
          lock_id: "live-lock",
          pid: 12_345,
          started_at: new Date(0).toISOString(),
        }),
        "utf8",
      );
      let now = 0;

      await expect(
        acquireKernelStartupLock(lockDir, {
          waitMs: 15,
          staleMs: 1_000,
          pollMs: 5,
          deps: {
            now: () => now,
            sleep: vi.fn(async (ms: number) => {
              now += ms;
            }),
            isPidAlive: vi.fn(async () => true),
          },
        }),
      ).rejects.toBeInstanceOf(KernelStartupLockError);
    });
  });
});
