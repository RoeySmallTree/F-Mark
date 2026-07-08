import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";
import {
  centeredOffset,
  clampOffset,
  coverScale,
  offsetForScale,
  sourceRectFromView,
  type Point,
} from "../../lib/avatarCrop.js";
import { cropToAvatarDataUrl } from "../../lib/avatarImage.js";
import {
  AVATAR_CROP_MAX_ZOOM,
  AVATAR_CROP_VIEWPORT,
  clampZoom,
  cropErrorMessage,
  imageStyleForCrop,
  type AvatarCropImageSize,
} from "./model.js";

interface UseAvatarCropperControllerInput {
  src: string;
  onApply(dataUrl: string): void;
  onCancel(): void;
}

interface DragState {
  px: number;
  py: number;
  ox: number;
  oy: number;
}

export interface AvatarCropperController {
  applying: boolean;
  canApply: boolean;
  canZoom: boolean;
  error: string | null;
  imageRef: RefObject<HTMLImageElement>;
  imageStyle: CSSProperties;
  maxZoom: number;
  src: string;
  stageRef: RefObject<HTMLDivElement>;
  viewport: number;
  zoom: number;
  apply(): void;
  applyZoom(nextZoom: number): void;
  endDrag(): void;
  onCancel(): void;
  onImageLoad(): void;
  onPointerDown(event: ReactPointerEvent<HTMLDivElement>): void;
  onPointerMove(event: ReactPointerEvent<HTMLDivElement>): void;
}

export function useAvatarCropperController({
  src,
  onApply,
  onCancel,
}: UseAvatarCropperControllerInput): AvatarCropperController {
  const imageRef = useRef<HTMLImageElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const [natural, setNatural] = useState<AvatarCropImageSize | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState<Point>({ x: 0, y: 0 });
  const [error, setError] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);

  const baseScale =
    natural !== null ? coverScale(natural, AVATAR_CROP_VIEWPORT) : 1;
  const scale = baseScale * zoom;
  const imageStyle = imageStyleForCrop({ natural, offset, scale });

  const onImageLoad = useCallback((): void => {
    const image = imageRef.current;
    if (image === null) return;
    const nextNatural = { w: image.naturalWidth, h: image.naturalHeight };
    const nextScale = coverScale(nextNatural, AVATAR_CROP_VIEWPORT);
    setNatural(nextNatural);
    setZoom(1);
    setOffset(centeredOffset(nextNatural, nextScale, AVATAR_CROP_VIEWPORT));
  }, []);

  const applyZoom = useCallback(
    (nextZoom: number): void => {
      if (natural === null) return;
      const boundedZoom = clampZoom(nextZoom);
      const nextScale = baseScale * boundedZoom;
      const recentered = offsetForScale(
        offset,
        scale,
        nextScale,
        AVATAR_CROP_VIEWPORT,
      );
      setZoom(boundedZoom);
      setOffset(
        clampOffset(recentered, natural, nextScale, AVATAR_CROP_VIEWPORT),
      );
    },
    [baseScale, natural, offset, scale],
  );

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (natural === null) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      px: event.clientX,
      py: event.clientY,
      ox: offset.x,
      oy: offset.y,
    };
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (dragRef.current === null || natural === null) return;
    setOffset(
      clampOffset(
        {
          x: dragRef.current.ox + (event.clientX - dragRef.current.px),
          y: dragRef.current.oy + (event.clientY - dragRef.current.py),
        },
        natural,
        scale,
        AVATAR_CROP_VIEWPORT,
      ),
    );
  };

  const endDrag = (): void => {
    dragRef.current = null;
  };

  const apply = (): void => {
    const image = imageRef.current;
    if (image === null || natural === null || applying) return;
    setApplying(true);
    setError(null);
    void (async () => {
      const rect = sourceRectFromView(offset, scale, AVATAR_CROP_VIEWPORT);
      onApply(await cropToAvatarDataUrl(image, rect, src));
    })()
      .catch((err: unknown) => setError(cropErrorMessage(err)))
      .finally(() => setApplying(false));
  };

  useWheelZoom(stageRef, zoom, applyZoom);
  useEscapeCancel(onCancel);

  return {
    applying,
    canApply: natural !== null && !applying,
    canZoom: natural !== null,
    error,
    imageRef,
    imageStyle,
    maxZoom: AVATAR_CROP_MAX_ZOOM,
    src,
    stageRef,
    viewport: AVATAR_CROP_VIEWPORT,
    zoom,
    apply,
    applyZoom,
    endDrag,
    onCancel,
    onImageLoad,
    onPointerDown,
    onPointerMove,
  };
}

function useWheelZoom(
  stageRef: RefObject<HTMLDivElement>,
  zoom: number,
  applyZoom: (nextZoom: number) => void,
): void {
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const applyZoomRef = useRef(applyZoom);
  applyZoomRef.current = applyZoom;

  useEffect(() => {
    const stage = stageRef.current;
    if (stage === null) return;
    const onWheel = (event: WheelEvent): void => {
      event.preventDefault();
      const direction = event.deltaY < 0 ? 1.08 : 1 / 1.08;
      applyZoomRef.current(zoomRef.current * direction);
    };
    stage.addEventListener("wheel", onWheel, { passive: false });
    return () => stage.removeEventListener("wheel", onWheel);
  }, [stageRef]);
}

function useEscapeCancel(onCancel: () => void): void {
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);
}
