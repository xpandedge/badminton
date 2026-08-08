"use client";

import { useMemo } from "react";
import qrcode from "@/lib/qr/qrcode-generator.js";

interface QRCodeProps {
  /** The value encoded in the QR (e.g. the board URL). */
  value: string;
  /** Rendered pixel size of the square. */
  size?: number;
  /** Quiet-zone in modules (spec recommends 4). */
  margin?: number;
  dark?: string;
  light?: string;
}

/**
 * Dependency-free QR, rendered client-side as an on-brand SVG (ink modules on
 * white). Nothing is fetched from any external service, so nothing leaks and it
 * costs nothing per render.
 */
export function QRCode({ value, size = 150, margin = 2, dark = "#16241C", light = "#FFFFFF" }: QRCodeProps) {
  const path = useMemo(() => {
    const qr = qrcode(0, "M");
    qr.addData(value);
    qr.make();
    const count = qr.getModuleCount();
    const total = count + margin * 2;
    let d = "";
    for (let r = 0; r < count; r++) {
      for (let c = 0; c < count; c++) {
        if (qr.isDark(r, c)) {
          const x = c + margin;
          const y = r + margin;
          d += `M${x} ${y}h1v1h-1z`;
        }
      }
    }
    return { d, total };
  }, [value, margin]);

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${path.total} ${path.total}`}
      shapeRendering="crispEdges"
      role="img"
      aria-label="QR code linking to the player board"
      style={{ display: "block", borderRadius: 10 }}
    >
      <rect width={path.total} height={path.total} fill={light} />
      <path d={path.d} fill={dark} />
    </svg>
  );
}
