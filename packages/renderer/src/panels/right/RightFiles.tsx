import { RightFilesPane } from "./files/RightFilesPane.js";
import { useRightFilesController } from "./files/useRightFilesController.js";

export function RightFiles(): JSX.Element {
  const controller = useRightFilesController();
  return <RightFilesPane controller={controller} />;
}
