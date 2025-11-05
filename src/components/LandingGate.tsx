"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

const ACCESS_CODE = "thistooshallpass";

export function LandingGate() {
  const router = useRouter();
  const [input, setInput] = useState("");
  const [error, setError] = useState("");
  const [isAnimating, setIsAnimating] = useState(false);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (input.trim().toLowerCase() === ACCESS_CODE) {
      setError("");
      setIsAnimating(true);
      setTimeout(() => {
        router.push("/dashboard");
      }, 600);
      return;
    }

    setError("Access denied. Recalibrate passphrase.");
  };

  return (
    <div className="landing-shell">
      <div className="grid-overlay" aria-hidden />
      <section className="landing-hero">
        <h1 className="landing-title">DNDBLACKLINE OPS</h1>
        <p className="landing-subtitle">
          [PROSPERABIMUS | VERUM MANERE | SICUT FRATRES]
        </p>
      </section>
      <section className="landing-access">
        <div
          className="hud-panel glow"
          style={{
            transform: isAnimating ? "scale(1.03)" : "scale(1)",
            transition: "transform 0.4s ease"
          }}
        >
          <div className="grid-overlay" aria-hidden />
          <div style={{ position: "relative", zIndex: 2 }}>
            <p
              style={{
                marginTop: 0,
                marginBottom: "1.5rem",
                fontSize: "0.85rem",
                letterSpacing: "0.2rem",
                textTransform: "uppercase",
                color: "#0b0b0f"
              }}
            >
              
            </p>
            <form className="landing-access-form" onSubmit={handleSubmit}>
              <label htmlFor="access-input" className="sr-only">
                Access Key
              </label>
              <input
                id="access-input"
                name="access"
                type="password"
                className="landing-input"
                placeholder="xxxxx"
                value={input}
                onChange={(event) => setInput(event.target.value)}
                autoComplete="off"
                aria-describedby={error ? "access-feedback" : undefined}
              />
              <button type="submit" className="landing-enter">
                ENTER
              </button>
            </form>
            {error ? (
              <p id="access-feedback" className="landing-feedback">
                {error}
              </p>
            ) : (
              <p
                className="text-contrast"
                style={{
                  marginTop: "1.25rem",
                  fontSize: "0.75rem",
                  letterSpacing: "0.12rem",
                  textTransform: "uppercase"
                }}
              >
                
              </p>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
