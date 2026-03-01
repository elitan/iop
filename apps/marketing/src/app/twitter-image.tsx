import { ImageResponse } from "next/og";
import { OgImageContent } from "./og-image-content";

export const alt =
  "Frost - Open Source Alternative to Vercel, Netlify, Railway, Render and Neon.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  return new ImageResponse(<OgImageContent />, { ...size });
}
