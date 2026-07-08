import { useEffect, useState } from "react";
import {
  cachedStillAvatarDataUrl,
  isAnimatedGifDataUrl,
  stillAvatarDataUrl,
} from "../../lib/avatarImage.js";

interface AvatarImageState {
  displayImageUrl?: string;
  gifAvatar: boolean;
  shouldPlayAnimated: boolean;
}

export function useAvatarImage(
  imageUrl: string | undefined,
  shouldPlayAnimated: boolean,
): AvatarImageState {
  const gifAvatar = isAnimatedGifDataUrl(imageUrl);
  const [stillUrl, setStillUrl] = useState<string | undefined>(() =>
    gifAvatar && imageUrl !== undefined
      ? cachedStillAvatarDataUrl(imageUrl)
      : undefined,
  );

  useEffect(() => {
    if (!gifAvatar || imageUrl === undefined || shouldPlayAnimated) return;
    const cached = cachedStillAvatarDataUrl(imageUrl);
    if (cached !== undefined) {
      setStillUrl(cached);
      return;
    }
    let cancelled = false;
    void stillAvatarDataUrl(imageUrl)
      .then((url) => {
        if (!cancelled) setStillUrl(url);
      })
      .catch(() => {
        if (!cancelled) setStillUrl(undefined);
      });
    return () => {
      cancelled = true;
    };
  }, [gifAvatar, imageUrl, shouldPlayAnimated]);

  useEffect(() => {
    if (imageUrl === undefined || !gifAvatar) {
      setStillUrl(undefined);
    }
  }, [gifAvatar, imageUrl]);

  return {
    displayImageUrl: gifAvatar && !shouldPlayAnimated ? stillUrl : imageUrl,
    gifAvatar,
    shouldPlayAnimated,
  };
}

