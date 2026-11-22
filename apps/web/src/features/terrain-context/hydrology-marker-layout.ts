export const HYDROLOGY_MARKER_RADIUS = 15;
const markerPadding = HYDROLOGY_MARKER_RADIUS + 3;
const markerSpacing = markerPadding * 2 + 2;

type Pixel = [number, number];

export function layoutHydrologyMarkers(anchors: Pixel[], size: number[]): Pixel[] {
  const placed: Pixel[] = [];
  const offsets: Pixel[] = [];
  for (let x = -anchors.length; x <= anchors.length; x++) {
    for (let y = -anchors.length; y <= anchors.length; y++) {
      offsets.push([x * markerSpacing, y * markerSpacing]);
    }
  }
  offsets.sort((a, b) => Math.hypot(...a) - Math.hypot(...b) || b[1] - a[1] || b[0] - a[0]);
  const width = size[0] ?? 0;
  const height = size[1] ?? 0;

  for (const anchor of anchors) {
    // Keep offscreen objects offscreen instead of pinning their labels to the viewport edge.
    if (anchor[0] < 0 || anchor[1] < 0 || anchor[0] > width || anchor[1] > height) {
      placed.push(anchor);
      continue;
    }
    const origin: Pixel = [
      Math.max(markerPadding, Math.min(width - markerPadding, anchor[0])),
      Math.max(markerPadding, Math.min(height - markerPadding, anchor[1])),
    ];
    const position = offsets
      .map(([x, y]): Pixel => [origin[0] + x, origin[1] + y])
      .find(
        ([x, y]) =>
          x >= markerPadding &&
          y >= markerPadding &&
          x <= width - markerPadding &&
          y <= height - markerPadding &&
          placed.every(([px, py]) => Math.hypot(x - px, y - py) >= markerSpacing),
      );
    placed.push(position ?? anchor);
  }
  return placed;
}
