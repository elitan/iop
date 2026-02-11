export function OgImageContent() {
  return (
    <div
      style={{
        height: "100%",
        width: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#0a0a0a",
        position: "relative",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          display: "flex",
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
      />

      <div
        style={{
          position: "absolute",
          top: "-200px",
          left: "50%",
          transform: "translateX(-50%)",
          width: "1000px",
          height: "600px",
          display: "flex",
          background:
            "radial-gradient(ellipse 80% 50% at 50% 0%, rgba(255,255,255,0.06) 0%, transparent 70%)",
        }}
      />

      <div
        style={{
          position: "absolute",
          top: "32px",
          right: "32px",
          display: "flex",
          alignItems: "center",
          gap: "10px",
          opacity: 0.5,
        }}
      >
        <svg
          width="28"
          height="28"
          viewBox="0 0 24 24"
          fill="#fafafa"
          role="img"
          aria-label="GitHub"
        >
          <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
        </svg>
        <span style={{ fontSize: "18px", color: "#fafafa" }}>elitan/frost</span>
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "12px",
          marginBottom: "32px",
        }}
      >
        <svg
          width="56"
          height="56"
          viewBox="0 0 64 64"
          role="img"
          aria-label="Frost logo"
        >
          <circle cx="32" cy="32" r="30" fill="#0a0a0a" />
          <circle cx="32" cy="32" r="10" fill="#fafafa" />
        </svg>
        <div
          style={{
            fontSize: "36px",
            fontWeight: 700,
            color: "#fafafa",
            letterSpacing: "-0.02em",
            display: "flex",
          }}
        >
          Frost
        </div>
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          padding: "8px 16px",
          borderRadius: "9999px",
          border: "1px solid #262626",
          backgroundColor: "rgba(23,23,23,0.8)",
          marginBottom: "32px",
        }}
      >
        <div
          style={{
            width: "8px",
            height: "8px",
            borderRadius: "50%",
            backgroundColor: "#fafafa",
            display: "flex",
          }}
        />
        <span style={{ fontSize: "16px", color: "#a3a3a3" }}>Open source</span>
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "0px",
        }}
      >
        <div
          style={{
            fontSize: "76px",
            fontWeight: 900,
            color: "#fafafa",
            letterSpacing: "-0.03em",
            lineHeight: 1.1,
            display: "flex",
          }}
        >
          Vercel experience.
        </div>
        <div
          style={{
            fontSize: "76px",
            fontWeight: 900,
            color: "#a3a3a3",
            letterSpacing: "-0.03em",
            lineHeight: 1.1,
            display: "flex",
          }}
        >
          VPS pricing.
        </div>
      </div>

      <div
        style={{
          fontSize: "24px",
          fontWeight: 500,
          color: "#71717a",
          marginTop: "24px",
          letterSpacing: "-0.01em",
          display: "flex",
        }}
      >
        Open source
      </div>

      <div
        style={{
          position: "absolute",
          bottom: "0",
          left: "0",
          right: "0",
          height: "2px",
          display: "flex",
          background:
            "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.3) 50%, transparent 100%)",
        }}
      />
    </div>
  );
}
