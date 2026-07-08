import { useMemo } from "react";
import { parseLaunch, type LaunchParams } from "./session.js";

export function useFileTreeLaunch(): LaunchParams {
  return useMemo(parseLaunch, []);
}
