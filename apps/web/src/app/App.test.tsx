import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { App } from "./App";

vi.mock("../features/map/MapWorkspace", () => ({
  MapWorkspace: () => <div data-testid="map-workspace" />,
}));

describe("App", () => {
  it("mounts the map workspace", () => {
    render(<App />);
    expect(screen.getByTestId("map-workspace")).not.toBeNull();
  });
});
