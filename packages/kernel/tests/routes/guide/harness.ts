import { paths, type Paths } from "../../../src/paths.js";
import { initProject } from "../../../src/project.js";
import { createServer, type CreatedServer } from "../../../src/server.js";
import { withTempProject } from "../../helpers/tempdir.js";

export type GuideApp = CreatedServer["app"];
export type GuidePaths = Paths;

export interface GuideAppContext {
  app: GuideApp;
  p: GuidePaths;
  root: string;
}

export interface GuideAppOptions {
  initializeProject?: boolean;
}

export async function withGuideApp<T>(
  fn: (context: GuideAppContext) => Promise<T>,
  options: GuideAppOptions = {},
): Promise<T> {
  return withTempProject(async (root) => {
    const p = paths(root);
    if (options.initializeProject !== false) {
      await initProject(p);
    }

    const { app } = createServer({ token: null, paths: p });
    try {
      return await fn({ app, p, root });
    } finally {
      await app.close();
    }
  });
}
