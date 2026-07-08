import { type JSX } from "react";
import { SearchView } from "./search/SearchView.js";
import { useSearchController } from "./search/useSearchController.js";

export function Search(): JSX.Element {
  return <SearchView controller={useSearchController()} />;
}
