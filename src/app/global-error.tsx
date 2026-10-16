"use client";

/** Last-resort error page when the root layout itself fails. */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", background: "#f7f5ef", color: "#161514", display: "grid", placeItems: "center", minHeight: "100dvh", margin: 0 }}>
        <div style={{ maxWidth: 420, padding: 24 }}>
          <h1 style={{ fontSize: 22, margin: 0 }}>Movents hit an error</h1>
          <p style={{ color: "#6b665e" }}>Please try again. If it keeps happening, share this code with support: {error.digest ?? "n/a"}</p>
          <button onClick={reset} style={{ padding: "10px 18px", borderRadius: 999, border: 0, background: "#161514", color: "#fff", fontWeight: 600, cursor: "pointer" }}>
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
