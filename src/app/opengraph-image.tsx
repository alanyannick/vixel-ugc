import { ImageResponse } from "next/og";

export const alt =
  "Vixel UGC — AI Product-to-UGC Campaign Studio grounded in product truth";
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          alignItems: "stretch",
          background: "#090a08",
          color: "#f3f0e8",
          display: "flex",
          flexDirection: "column",
          fontFamily: "Arial, sans-serif",
          height: "100%",
          justifyContent: "space-between",
          padding: "54px 64px",
          position: "relative",
          width: "100%",
        }}
      >
        <div
          style={{
            backgroundImage:
              "linear-gradient(rgba(243,240,232,.07) 1px, transparent 1px), linear-gradient(90deg, rgba(243,240,232,.07) 1px, transparent 1px)",
            backgroundSize: "54px 54px",
            bottom: 0,
            display: "flex",
            left: 0,
            opacity: 0.65,
            position: "absolute",
            right: 0,
            top: 0,
          }}
        />
        <div
          style={{
            alignItems: "center",
            display: "flex",
            fontSize: 22,
            fontWeight: 700,
            letterSpacing: "-0.02em",
            position: "relative",
          }}
        >
          <div
            style={{
              alignItems: "center",
              background: "#c7f43d",
              color: "#090a08",
              display: "flex",
              height: 46,
              justifyContent: "center",
              marginRight: 16,
              width: 46,
            }}
          >
            VX
          </div>
          VIXEL UGC
        </div>
        <div style={{ display: "flex", flexDirection: "column", position: "relative" }}>
          <div
            style={{
              color: "#c7f43d",
              display: "flex",
              fontSize: 18,
              letterSpacing: "0.15em",
              marginBottom: 22,
              textTransform: "uppercase",
            }}
          >
            AI Product-to-UGC Campaign Studio
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 76,
              fontWeight: 800,
              letterSpacing: "-0.055em",
              lineHeight: 0.94,
              maxWidth: 900,
            }}
          >
            Creator-style ads,
            <br />
            grounded in product truth.
          </div>
        </div>
        <div
          style={{
            alignItems: "center",
            borderTop: "1px solid rgba(243,240,232,.25)",
            display: "flex",
            fontSize: 18,
            justifyContent: "space-between",
            paddingTop: 20,
            position: "relative",
          }}
        >
          <span>Source → Route → Approve → Generate → Adopt</span>
          <span style={{ color: "#c7f43d" }}>ugc.vixelai.com</span>
        </div>
      </div>
    ),
    size,
  );
}
