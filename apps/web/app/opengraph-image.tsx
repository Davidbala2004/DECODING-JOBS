import { ImageResponse } from "next/og";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Same brand mark as app/icon.tsx, scaled up as the share-card preview shown
// by Slack/Twitter/LinkedIn/WhatsApp when a link to this site is pasted.
export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #ffffff 0%, #f0fdf4 100%)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 140,
            height: 140,
            borderRadius: 32,
            background: "linear-gradient(135deg, #22c55e 0%, #059669 100%)",
            marginBottom: 40,
          }}
        >
          <svg width="76" height="76" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
            <circle cx="12" cy="10" r="3" />
          </svg>
        </div>
        <div style={{ display: "flex", fontSize: 68, fontWeight: 800, color: "#0f172a", letterSpacing: -2 }}>
          DECODING<span style={{ color: "#16a34a" }}>JOBS</span>
        </div>
        <div style={{ display: "flex", marginTop: 20, fontSize: 28, color: "#64748b" }}>
          A map-based job search command center for tech students
        </div>
      </div>
    ),
    { ...size }
  );
}
