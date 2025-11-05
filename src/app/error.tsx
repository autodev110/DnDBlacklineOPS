"use client";

export default function Error({ error }: { error: Error }) {
  return (
    <html lang="en">
      <body style={{ padding: "2rem", fontFamily: "Special Elite, monospace" }}>
        <h1>Something went wrong</h1>
        <pre>{error.message}</pre>
      </body>
    </html>
  );
}
