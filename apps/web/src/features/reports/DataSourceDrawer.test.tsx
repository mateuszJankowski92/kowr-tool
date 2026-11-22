import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { DataSourceDrawerProvider, DataSourceDrawerTrigger } from "./DataSourceDrawer";

afterEach(cleanup);

it("labels the drawer and restores focus to its opener after Escape", async () => {
  render(
    <DataSourceDrawerProvider>
      <DataSourceDrawerTrigger
        content={<p>Model gleby, nie pomiar terenowy.</p>}
        description="Pochodzenie i ograniczenia danych."
        sectionLabel="Gleba"
        title="Źródło danych glebowych"
      />
    </DataSourceDrawerProvider>,
  );
  const trigger = screen.getByRole("button", { name: "Pokaż źródło i jakość danych: Gleba" });
  trigger.focus();
  fireEvent.click(trigger);
  const drawer = screen.getByRole("dialog", { name: "Źródło danych glebowych" });
  expect(within(drawer).getByText("Pochodzenie i ograniczenia danych.")).not.toBeNull();
  expect(within(drawer).getByText("Model gleby, nie pomiar terenowy.")).not.toBeNull();
  expect(document.activeElement).toBe(
    within(drawer).getByRole("button", { name: "Zamknij informacje o źródle" }),
  );
  fireEvent.keyDown(drawer, { key: "Escape" });
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  await waitFor(() => expect(document.activeElement).toBe(trigger));
});
