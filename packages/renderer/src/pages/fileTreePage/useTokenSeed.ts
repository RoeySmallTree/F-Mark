import { useEffect } from "react";
import { useStore } from "../../state/store.js";

export function useTokenSeed(token: string | null): void {
  useEffect(() => {
    useStore.getState().setToken(token);
  }, [token]);
}
