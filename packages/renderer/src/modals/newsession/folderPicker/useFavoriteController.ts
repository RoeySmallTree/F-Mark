import {
  useCallback,
  useMemo,
  useState,
} from "react";
import type { PathFavorite } from "../../../api/client.js";
import type {
  FavoriteController,
  FolderPickerClient,
} from "./types.js";

interface FavoriteControllerInput {
  client: FolderPickerClient;
  currentPath: string;
  favorites: PathFavorite[];
  setFavorites(favorites: PathFavorite[]): void;
}

export function useFavoriteController(
  input: FavoriteControllerInput,
): FavoriteController {
  const { client, currentPath, favorites, setFavorites } = input;
  const [savePromptOpen, setSavePromptOpen] = useState(false);
  const [favName, setFavName] = useState("");
  const [favError, setFavError] = useState<string | null>(null);
  const [savingFav, setSavingFav] = useState(false);

  const openSavePrompt = useCallback((): void => {
    setSavePromptOpen(true);
    setFavError(null);
  }, []);

  const closeSavePrompt = useCallback((): void => {
    setSavePromptOpen(false);
    setFavName("");
    setFavError(null);
  }, []);

  const saveCurrentAsFavorite = useCallback(
    async (name: string): Promise<void> => {
      if (savingFav) return;
      const trimmed = name.trim();
      if (trimmed.length === 0) {
        setFavError("Name required");
        return;
      }
      setSavingFav(true);
      setFavError(null);
      try {
        const response = await client.addFavorite({
          name: trimmed,
          path: currentPath,
        });
        setFavorites(response.favorites);
        setSavePromptOpen(false);
        setFavName("");
      } catch (error) {
        setFavError(error instanceof Error ? error.message : String(error));
      } finally {
        setSavingFav(false);
      }
    },
    [client, currentPath, savingFav, setFavorites],
  );

  const removeFavorite = useCallback(
    async (path: string): Promise<void> => {
      try {
        const response = await client.removeFavorite(path);
        setFavorites(response.favorites);
      } catch {
        /* keep silent - user just sees the chip stay */
      }
    },
    [client, setFavorites],
  );

  const currentIsFavorited = useMemo(
    () => favorites.some((favorite) => favorite.path === currentPath),
    [currentPath, favorites],
  );

  return {
    closeSavePrompt,
    currentIsFavorited,
    favError,
    favorites,
    favName,
    openSavePrompt,
    removeFavorite,
    saveCurrentAsFavorite,
    savePromptOpen,
    savingFav,
    setFavName,
  };
}
