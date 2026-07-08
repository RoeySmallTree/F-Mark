import { ASCII_LOGO } from "../../branding.js";

export function TopBarBrand(): JSX.Element {
  return (
    <div className="brand" title="F-Mark">
      <span className="logo-mark" aria-hidden="true">
        <pre className="glyph">{ASCII_LOGO}</pre>
      </span>
      <span className="name">F·Mark</span>
    </div>
  );
}
