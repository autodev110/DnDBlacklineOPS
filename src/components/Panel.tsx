import { PropsWithChildren } from "react";

type PanelProps = PropsWithChildren<{
  title?: string;
  subtitle?: string;
  accent?: string;
}>;

export function Panel({ title, subtitle, accent, children }: PanelProps) {
  return (
    <section className="hud-panel">
      {title && (
        <header
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            marginBottom: "1.25rem"
          }}
        >
          <h2 className="hud-title" style={{ margin: 0, fontSize: "1.1rem" }}>
            {title}
          </h2>
          {accent ? (
            <span className="hud-tag" style={{ borderStyle: "solid" }}>
              {accent}
            </span>
          ) : null}
        </header>
      )}
      {subtitle ? (
        <p
          className="text-contrast"
          style={{
            marginTop: title ? "-1rem" : 0,
            marginBottom: "1.5rem",
            fontSize: "0.85rem",
            letterSpacing: "0.05rem"
          }}
        >
          {subtitle}
        </p>
      ) : null}
      {children}
    </section>
  );
}
