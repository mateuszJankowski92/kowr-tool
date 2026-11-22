import type { TerrainContextResponse, TerrainTextureResponse } from "@kowr/contracts";
import { useQuery } from "@tanstack/react-query";
import { ImageOff } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  BufferGeometry,
  Color,
  DirectionalLight,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
  TextureLoader,
  Uint32BufferAttribute,
  Vector3,
  WebGLRenderer,
} from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { getTerrainTexture } from "../../api/terrain-context";
import { Spinner } from "../../components/ui/spinner";
import { isPointInRing } from "./terrain-model-geometry";

type TerrainData = Extract<TerrainContextResponse["terrain"], { status: "available" }>;
type TextureMetadata = Pick<TerrainTextureResponse, "source" | "limitations">;
type ProjectedPosition = [number, number];

function soilDepthMeters(terrain: TerrainData) {
  const width = terrain.grid.bounds.east - terrain.grid.bounds.west;
  const depth = terrain.grid.bounds.north - terrain.grid.bounds.south;
  return Math.max(6, Math.min(18, Math.max(width, depth) * 0.04));
}

function gridPoint(terrain: TerrainData, row: number, column: number, heightOffset = 0) {
  const { grid } = terrain;
  const centerX = (grid.bounds.west + grid.bounds.east) / 2;
  const centerY = (grid.bounds.south + grid.bounds.north) / 2;
  const easting =
    grid.bounds.west + ((column + 0.5) / grid.columns) * (grid.bounds.east - grid.bounds.west);
  const northing =
    grid.bounds.north - ((row + 0.5) / grid.rows) * (grid.bounds.north - grid.bounds.south);
  const height = grid.heightsMeters[row * grid.columns + column];

  return new Vector3(
    easting - centerX,
    (height ?? terrain.metrics.minimumElevationMeters) -
      terrain.metrics.minimumElevationMeters +
      heightOffset,
    -(northing - centerY),
  );
}

function isPointInParcel(terrain: TerrainData, point: ProjectedPosition) {
  const polygons =
    terrain.parcelGeometry.type === "Polygon"
      ? [terrain.parcelGeometry.coordinates]
      : terrain.parcelGeometry.coordinates;

  return polygons.some(([outerRing, ...holes]) => {
    if (!outerRing || !isPointInRing(point, outerRing)) return false;
    return !holes.some((hole) => isPointInRing(point, hole));
  });
}

function gridHeight(terrain: TerrainData, easting: number, northing: number): number {
  const { grid } = terrain;
  const columnPosition =
    ((easting - grid.bounds.west) / (grid.bounds.east - grid.bounds.west)) * grid.columns - 0.5;
  const rowPosition =
    ((grid.bounds.north - northing) / (grid.bounds.north - grid.bounds.south)) * grid.rows - 0.5;
  const left = Math.max(0, Math.min(grid.columns - 1, Math.floor(columnPosition)));
  const right = Math.max(0, Math.min(grid.columns - 1, Math.ceil(columnPosition)));
  const top = Math.max(0, Math.min(grid.rows - 1, Math.floor(rowPosition)));
  const bottom = Math.max(0, Math.min(grid.rows - 1, Math.ceil(rowPosition)));
  const horizontal = Math.max(0, Math.min(1, columnPosition - left));
  const vertical = Math.max(0, Math.min(1, rowPosition - top));
  const samples = [
    {
      value: grid.heightsMeters[top * grid.columns + left],
      weight: (1 - horizontal) * (1 - vertical),
    },
    { value: grid.heightsMeters[top * grid.columns + right], weight: horizontal * (1 - vertical) },
    {
      value: grid.heightsMeters[bottom * grid.columns + left],
      weight: (1 - horizontal) * vertical,
    },
    { value: grid.heightsMeters[bottom * grid.columns + right], weight: horizontal * vertical },
  ].filter(
    (sample): sample is { value: number; weight: number } =>
      sample.value !== null && sample.value !== undefined,
  );
  const weight = samples.reduce((sum, sample) => sum + sample.weight, 0);
  if (weight <= 0) return terrain.metrics.minimumElevationMeters;
  return samples.reduce((sum, sample) => sum + sample.value * sample.weight, 0) / weight;
}

function buildTerrainGeometry(terrain: TerrainData) {
  const { grid } = terrain;
  const centerX = (grid.bounds.west + grid.bounds.east) / 2;
  const centerY = (grid.bounds.south + grid.bounds.north) / 2;
  const baseHeight = terrain.metrics.minimumElevationMeters;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let row = 0; row < grid.rows; row += 1) {
    const northing =
      grid.bounds.north - ((row + 0.5) / grid.rows) * (grid.bounds.north - grid.bounds.south);
    for (let column = 0; column < grid.columns; column += 1) {
      const easting =
        grid.bounds.west + ((column + 0.5) / grid.columns) * (grid.bounds.east - grid.bounds.west);
      const height = grid.heightsMeters[row * grid.columns + column];
      positions.push(
        easting - centerX,
        height === null || height === undefined ? 0 : height - baseHeight,
        -(northing - centerY),
      );
      uvs.push((column + 0.5) / grid.columns, 1 - (row + 0.5) / grid.rows);
    }
  }

  for (let row = 0; row < grid.rows - 1; row += 1) {
    for (let column = 0; column < grid.columns - 1; column += 1) {
      const topLeft = row * grid.columns + column;
      const topRight = topLeft + 1;
      const bottomLeft = topLeft + grid.columns;
      const bottomRight = bottomLeft + 1;
      const values = [topLeft, topRight, bottomLeft, bottomRight].map(
        (index) => grid.heightsMeters[index],
      );
      if (values.some((value) => value === null || value === undefined)) continue;
      indices.push(topLeft, bottomLeft, topRight, topRight, bottomLeft, bottomRight);
    }
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new Float32BufferAttribute(uvs, 2));
  geometry.setIndex(new Uint32BufferAttribute(indices, 1));
  geometry.computeVertexNormals();
  return geometry;
}

function buildTerrainBlock(terrain: TerrainData) {
  const { grid } = terrain;
  const perimeter: Vector3[] = [];

  for (let column = 0; column < grid.columns; column += 1) {
    perimeter.push(gridPoint(terrain, 0, column));
  }
  for (let row = 1; row < grid.rows; row += 1) {
    perimeter.push(gridPoint(terrain, row, grid.columns - 1));
  }
  for (let column = grid.columns - 2; column >= 0; column -= 1) {
    perimeter.push(gridPoint(terrain, grid.rows - 1, column));
  }
  for (let row = grid.rows - 2; row > 0; row -= 1) {
    perimeter.push(gridPoint(terrain, row, 0));
  }

  const baseHeight = -soilDepthMeters(terrain);
  const wallPositions: number[] = [];
  const wallIndices: number[] = [];
  for (let index = 0; index < perimeter.length; index += 1) {
    const nextIndex = (index + 1) % perimeter.length;
    const start = perimeter[index];
    const end = perimeter[nextIndex];
    if (!start || !end) continue;
    const vertexIndex = wallPositions.length / 3;
    wallPositions.push(
      start.x,
      start.y,
      start.z,
      end.x,
      end.y,
      end.z,
      start.x,
      baseHeight,
      start.z,
      end.x,
      baseHeight,
      end.z,
    );
    wallIndices.push(
      vertexIndex,
      vertexIndex + 2,
      vertexIndex + 1,
      vertexIndex + 1,
      vertexIndex + 2,
      vertexIndex + 3,
    );
  }

  const wallGeometry = new BufferGeometry();
  wallGeometry.setAttribute("position", new Float32BufferAttribute(wallPositions, 3));
  wallGeometry.setIndex(new Uint32BufferAttribute(wallIndices, 1));
  wallGeometry.computeVertexNormals();
  const wallMaterial = new MeshStandardMaterial({
    color: 0x76543a,
    metalness: 0,
    roughness: 1,
    side: DoubleSide,
  });

  const northWest = gridPoint(terrain, 0, 0);
  const northEast = gridPoint(terrain, 0, grid.columns - 1);
  const southWest = gridPoint(terrain, grid.rows - 1, 0);
  const southEast = gridPoint(terrain, grid.rows - 1, grid.columns - 1);
  const bottomGeometry = new BufferGeometry();
  bottomGeometry.setAttribute(
    "position",
    new Float32BufferAttribute(
      [
        northWest.x,
        baseHeight,
        northWest.z,
        northEast.x,
        baseHeight,
        northEast.z,
        southWest.x,
        baseHeight,
        southWest.z,
        southEast.x,
        baseHeight,
        southEast.z,
      ],
      3,
    ),
  );
  bottomGeometry.setIndex(new Uint32BufferAttribute([0, 2, 1, 1, 2, 3], 1));
  bottomGeometry.computeVertexNormals();
  const bottomMaterial = new MeshStandardMaterial({
    color: 0x4f3727,
    metalness: 0,
    roughness: 1,
    side: DoubleSide,
  });

  const group = new Group();
  group.add(new Mesh(wallGeometry, wallMaterial), new Mesh(bottomGeometry, bottomMaterial));
  return group;
}

function buildParcelFill(terrain: TerrainData) {
  const { grid } = terrain;
  const positions: number[] = [];
  const indices: number[] = [];

  for (let row = 0; row < grid.rows; row += 1) {
    for (let column = 0; column < grid.columns; column += 1) {
      positions.push(...gridPoint(terrain, row, column, 0.1).toArray());
    }
  }

  for (let row = 0; row < grid.rows - 1; row += 1) {
    const northing =
      grid.bounds.north - ((row + 1) / grid.rows) * (grid.bounds.north - grid.bounds.south);
    for (let column = 0; column < grid.columns - 1; column += 1) {
      const easting =
        grid.bounds.west + ((column + 1) / grid.columns) * (grid.bounds.east - grid.bounds.west);
      if (!isPointInParcel(terrain, [easting, northing])) continue;
      const topLeft = row * grid.columns + column;
      const topRight = topLeft + 1;
      const bottomLeft = topLeft + grid.columns;
      const bottomRight = bottomLeft + 1;
      const values = [topLeft, topRight, bottomLeft, bottomRight].map(
        (index) => grid.heightsMeters[index],
      );
      if (values.some((value) => value === null || value === undefined)) continue;
      indices.push(topLeft, bottomLeft, topRight, topRight, bottomLeft, bottomRight);
    }
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setIndex(new Uint32BufferAttribute(indices, 1));
  const material = new MeshBasicMaterial({
    color: 0x2563eb,
    depthWrite: false,
    opacity: 0.22,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
    side: DoubleSide,
    transparent: true,
  });
  const mesh = new Mesh(geometry, material);
  mesh.renderOrder = 1;
  return mesh;
}

function buildParcelLines(terrain: TerrainData) {
  const centerX = (terrain.grid.bounds.west + terrain.grid.bounds.east) / 2;
  const centerY = (terrain.grid.bounds.south + terrain.grid.bounds.north) / 2;
  const baseHeight = terrain.metrics.minimumElevationMeters;
  const polygons =
    terrain.parcelGeometry.type === "Polygon"
      ? [terrain.parcelGeometry.coordinates]
      : terrain.parcelGeometry.coordinates;
  const group = new Group();

  for (const polygon of polygons) {
    for (const ring of polygon) {
      const points: Vector3[] = [];
      for (let index = 0; index < ring.length - 1; index += 1) {
        const start = ring[index];
        const end = ring[index + 1];
        if (!start || !end) continue;
        const length = Math.hypot(end[0] - start[0], end[1] - start[1]);
        const stepCount = Math.max(1, Math.ceil(length / terrain.grid.cellSizeMeters));
        for (let step = 0; step < stepCount; step += 1) {
          const fraction = step / stepCount;
          const easting = start[0] + (end[0] - start[0]) * fraction;
          const northing = start[1] + (end[1] - start[1]) * fraction;
          points.push(
            new Vector3(
              easting - centerX,
              gridHeight(terrain, easting, northing) - baseHeight + 0.18,
              -(northing - centerY),
            ),
          );
        }
      }
      const closingPoint = ring.at(-1);
      if (closingPoint) {
        points.push(
          new Vector3(
            closingPoint[0] - centerX,
            gridHeight(terrain, closingPoint[0], closingPoint[1]) - baseHeight + 0.18,
            -(closingPoint[1] - centerY),
          ),
        );
      }
      const positions = points.flatMap((point) => point.toArray());
      const boundaryGeometry = new LineGeometry();
      boundaryGeometry.setPositions(positions);
      const boundaryMaterial = new LineMaterial({
        color: 0x3b82f6,
        depthWrite: false,
        linewidth: 7,
      });
      const boundary = new Line2(boundaryGeometry, boundaryMaterial);
      boundary.renderOrder = 2;
      boundary.computeLineDistances();
      group.add(boundary);
    }
  }

  return group;
}

function positionCamera(camera: PerspectiveCamera, controls: OrbitControls, terrain: TerrainData) {
  const width = terrain.grid.bounds.east - terrain.grid.bounds.west;
  const depth = terrain.grid.bounds.north - terrain.grid.bounds.south;
  const extent = Math.max(width, depth);
  const elevation = terrain.metrics.elevationRangeMeters;
  const targetHeight = (elevation - soilDepthMeters(terrain)) / 2;
  const framingScale = Math.max(0.68, Math.min(1.05, 1.35 / camera.aspect));
  controls.target.set(0, targetHeight, 0);
  camera.up.set(0, 1, 0);
  camera.position.set(
    extent * 0.52 * framingScale,
    targetHeight + extent * 0.64 * framingScale,
    extent * 0.61 * framingScale,
  );
  camera.near = Math.max(0.1, extent / 2_000);
  camera.far = extent * 10;
  camera.updateProjectionMatrix();
  controls.update();
}

export function TerrainModel({
  onTextureMetadata,
  parcelIdentifier,
  terrain,
}: {
  onTextureMetadata?: (metadata: TextureMetadata) => void;
  parcelIdentifier: string;
  terrain: TerrainData;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cameraRef = useRef<PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const rendererRef = useRef<WebGLRenderer | null>(null);
  const sceneRef = useRef<Scene | null>(null);
  const materialRef = useRef<MeshStandardMaterial | null>(null);
  const [webglUnavailable, setWebglUnavailable] = useState(false);
  const [textureStatus, setTextureStatus] = useState<"loading" | "loaded" | "failed">("loading");
  const textureQuery = useQuery({
    queryKey: ["terrain-texture", parcelIdentifier],
    queryFn: ({ signal }) => getTerrainTexture(parcelIdentifier, signal),
    retry: false,
    staleTime: 30 * 60 * 1_000,
  });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let renderer: WebGLRenderer;
    try {
      renderer = new WebGLRenderer({ antialias: true, alpha: false });
    } catch {
      setWebglUnavailable(true);
      return;
    }
    rendererRef.current = renderer;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(new Color(0xdfe8dd));
    renderer.outputColorSpace = SRGBColorSpace;
    container.append(renderer.domElement);

    const scene = new Scene();
    sceneRef.current = scene;
    scene.background = new Color(0xdfe8dd);
    const camera = new PerspectiveCamera(38, 1, 0.1, 10_000);
    cameraRef.current = camera;
    const controls = new OrbitControls(camera, renderer.domElement);
    controlsRef.current = controls;
    controls.enableDamping = false;
    controls.enablePan = true;
    controls.enableZoom = false;
    controls.maxPolarAngle = (Math.PI * 3) / 8;
    const terrainExtent = Math.max(
      terrain.grid.bounds.east - terrain.grid.bounds.west,
      terrain.grid.bounds.north - terrain.grid.bounds.south,
    );
    controls.maxTargetRadius = terrainExtent * 0.75;
    controls.screenSpacePanning = true;

    const material = new MeshStandardMaterial({
      color: 0xa6b49a,
      roughness: 0.94,
      metalness: 0,
    });
    materialRef.current = material;
    const geometry = buildTerrainGeometry(terrain);
    const mesh = new Mesh(geometry, material);
    const terrainBlock = buildTerrainBlock(terrain);
    const parcelFill = buildParcelFill(terrain);
    scene.add(mesh);
    scene.add(terrainBlock);
    scene.add(parcelFill);
    const parcelLines = buildParcelLines(terrain);
    scene.add(parcelLines);
    scene.add(new HemisphereLight(0xf3f6ed, 0x68745f, 1.8));
    const sunlight = new DirectionalLight(0xffffff, 1.35);
    sunlight.position.set(-1, 2, 1);
    scene.add(sunlight);

    const render = () => renderer.render(scene, camera);
    const resize = () => {
      const width = Math.max(container.clientWidth, 1);
      const height = Math.max(container.clientHeight, 1);
      renderer.setSize(width, height, false);
      for (const line of parcelLines.children) {
        if (line instanceof Line2 && line.material instanceof LineMaterial) {
          line.material.resolution.set(width, height);
        }
      }
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      render();
    };
    controls.addEventListener("change", render);
    const observer = new ResizeObserver(resize);
    observer.observe(container);
    resize();
    positionCamera(camera, controls, terrain);
    render();

    return () => {
      observer.disconnect();
      controls.removeEventListener("change", render);
      controls.dispose();
      geometry.dispose();
      material.map?.dispose();
      material.dispose();
      parcelFill.geometry.dispose();
      parcelFill.material.dispose();
      for (const child of terrainBlock.children) {
        if (child instanceof Mesh) {
          child.geometry.dispose();
          if (Array.isArray(child.material)) {
            for (const childMaterial of child.material) childMaterial.dispose();
          } else {
            child.material.dispose();
          }
        }
      }
      for (const line of parcelLines.children) {
        if (line instanceof Line2) {
          line.geometry.dispose();
          if (line.material instanceof LineMaterial) line.material.dispose();
        }
      }
      renderer.dispose();
      renderer.domElement.remove();
      rendererRef.current = null;
      sceneRef.current = null;
      cameraRef.current = null;
      controlsRef.current = null;
      materialRef.current = null;
    };
  }, [terrain]);

  useEffect(() => {
    if (textureQuery.isError) setTextureStatus("failed");
  }, [textureQuery.isError]);

  useEffect(() => {
    if (!textureQuery.data) return;
    onTextureMetadata?.({
      source: textureQuery.data.source,
      limitations: textureQuery.data.limitations,
    });
  }, [onTextureMetadata, textureQuery.data]);

  useEffect(() => {
    const imageDataUrl = textureQuery.data?.imageDataUrl;
    const material = materialRef.current;
    const renderer = rendererRef.current;
    const camera = cameraRef.current;
    const scene = sceneRef.current;
    if (!imageDataUrl || !material || !renderer || !camera || !scene) return;
    setTextureStatus("loading");
    let active = true;
    const texture = new TextureLoader().load(
      imageDataUrl,
      (loadedTexture) => {
        if (!active) {
          loadedTexture.dispose();
          return;
        }
        loadedTexture.colorSpace = SRGBColorSpace;
        material.map?.dispose();
        material.map = loadedTexture;
        material.color.set(0xffffff);
        material.needsUpdate = true;
        setTextureStatus("loaded");
        renderer.render(scene, camera);
        controlsRef.current?.dispatchEvent({ type: "change" });
      },
      undefined,
      () => {
        if (!active) return;
        material.map?.dispose();
        material.map = null;
        material.color.set(0xa6b49a);
        material.needsUpdate = true;
        setTextureStatus("failed");
        renderer.render(scene, camera);
      },
    );
    return () => {
      active = false;
      if (material.map !== texture) texture.dispose();
    };
  }, [textureQuery.data?.imageDataUrl]);

  if (webglUnavailable) {
    return (
      <div className="terrain-model-fallback" role="status">
        <ImageOff aria-hidden="true" />
        <strong>Widok 3D nie jest dostępny w tej przeglądarce.</strong>
        <span>Wartości wysokości i spadku powyżej pozostają miarodajne.</span>
      </div>
    );
  }

  return (
    <div className="terrain-model-shell">
      <div
        aria-label="Interaktywny model 3D terenu działki. Przeciągnij, aby obrócić."
        className="terrain-model-canvas"
        ref={containerRef}
        role="img"
      />
      <p className="terrain-model-note">
        Skala pionowa 1:1 ·{" "}
        {textureStatus === "failed" ? (
          "widok neutralny — ortofotomapa niedostępna"
        ) : textureStatus === "loading" ? (
          <Spinner className="align-middle" label="Pobieranie ortofotomapy…" />
        ) : (
          "ortofotomapa GUGiK"
        )}{" "}
        · grubość przekroju umowna
      </p>
    </div>
  );
}
