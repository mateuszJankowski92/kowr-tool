import { createOrthophotoLayer, POLISH_PROJECTION } from "../map/map-config";
import { PRINT_MAP_SIZE } from "./print-map-geometry";

export async function getPrintMapBackground(extent: number[], signal: AbortSignal) {
  const controller = new AbortController();
  const abort = () => controller.abort(signal.reason);
  if (signal.aborted) abort();
  signal.addEventListener("abort", abort, { once: true });
  const timeout = setTimeout(() => controller.abort(), 12_000);
  const layer = createOrthophotoLayer();
  const source = layer.getSource();
  try {
    controller.signal.throwIfAborted();
    if (!source) throw new Error("Orthophoto source unavailable.");
    const grid = source.getTileGridForProjection(POLISH_PROJECTION);
    const [mapWidth, mapHeight] = PRINT_MAP_SIZE;
    const canvas = document.createElement("canvas");
    canvas.width = mapWidth * 2;
    canvas.height = mapHeight * 2;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Print map canvas unavailable.");
    const [west = 0, south = 0, east = 0, north = 0] = extent;
    const resolution = (east - west) / canvas.width;
    if (resolution <= 0 || north <= south) throw new Error("Invalid print map extent.");
    const zoom = grid.getZForResolution(resolution);
    const range = grid.getTileRangeForExtentAndZ(extent, zoom);
    const tiles: [number, number, number][] = [];
    for (let x = range.minX; x <= range.maxX; x++) {
      for (let y = range.minY; y <= range.maxY; y++) tiles.push([zoom, x, y]);
    }
    if (tiles.length === 0 || tiles.length > 32) throw new Error("Print map tile limit exceeded.");
    const size = grid.getTileSize(zoom);
    const [tileWidth = 512, tileHeight = 512] = Array.isArray(size) ? size : [size, size];
    const mosaic = document.createElement("canvas");
    mosaic.width = (range.maxX - range.minX + 1) * tileWidth;
    mosaic.height = (range.maxY - range.minY + 1) * tileHeight;
    const mosaicContext = mosaic.getContext("2d");
    if (!mosaicContext) throw new Error("Print map canvas unavailable.");
    const urlFor = source.getTileUrlFunction();
    let next = 0;
    async function loadTiles() {
      while (next < tiles.length) {
        const tile = tiles[next++];
        if (!tile) return;
        const url = urlFor(tile, 1, POLISH_PROJECTION);
        if (!url) throw new Error("Orthophoto tile unavailable.");
        const response = await fetch(url, { signal: controller.signal, credentials: "omit" });
        if (!response.ok || !response.headers.get("content-type")?.startsWith("image/")) {
          throw new Error("Orthophoto tile request failed.");
        }
        const bitmap = await createImageBitmap(await response.blob());
        try {
          controller.signal.throwIfAborted();
          // Join at integer source pixels, then resample once to avoid seams between tiles.
          mosaicContext?.drawImage(
            bitmap,
            (tile[1] - range.minX) * tileWidth,
            (tile[2] - range.minY) * tileHeight,
            tileWidth,
            tileHeight,
          );
        } finally {
          bitmap.close();
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(4, tiles.length) }, loadTiles));
    controller.signal.throwIfAborted();
    const [mosaicWest = 0, , , mosaicNorth = 0] = grid.getTileCoordExtent([
      zoom,
      range.minX,
      range.minY,
    ]);
    const tileResolution = grid.getResolution(zoom);
    context.drawImage(
      mosaic,
      (mosaicWest - west) / resolution,
      (north - mosaicNorth) / resolution,
      (mosaic.width * tileResolution) / resolution,
      (mosaic.height * tileResolution) / resolution,
    );
    return {
      imageDataUrl: canvas.toDataURL("image/jpeg", 0.92),
      retrievedAt: new Date().toISOString(),
    };
  } finally {
    clearTimeout(timeout);
    signal.removeEventListener("abort", abort);
    controller.abort();
    source?.dispose();
    layer.dispose();
  }
}
