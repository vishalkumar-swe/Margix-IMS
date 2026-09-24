import { describe, expect, it } from "vitest";
import { unresolvedItems, type ChecklistItem } from "@/lib/checklist";
import {
  summarizeStatuses,
  systemItemStatus,
  taskAppliesTo,
  taskStatus,
} from "@/server/modules/checklist/checklist-status";

describe("system item status", () => {
  it("is completed when there is nothing to do", () => {
    expect(systemItemStatus(0, { critical: true, overdue: true })).toBe("COMPLETED");
  });

  it("ranks critical above overdue above pending", () => {
    expect(systemItemStatus(3, { critical: true, overdue: true })).toBe("CRITICAL");
    expect(systemItemStatus(3, { overdue: true })).toBe("OVERDUE");
    expect(systemItemStatus(3)).toBe("PENDING");
  });
});

describe("administrator task status", () => {
  it("is completed once ticked, whatever the time", () => {
    expect(taskStatus({ done: true, dueTime: "10:00" }, "18:00")).toBe("COMPLETED");
  });

  it("becomes overdue at its due time (IST)", () => {
    expect(taskStatus({ done: false, dueTime: "10:00" }, "09:59")).toBe("PENDING");
    expect(taskStatus({ done: false, dueTime: "10:00" }, "10:00")).toBe("OVERDUE");
    expect(taskStatus({ done: false, dueTime: null }, "23:59")).toBe("PENDING");
  });

  it("applies to its roles, or to everyone when none are set", () => {
    expect(taskAppliesTo([], "WAREHOUSE_OPERATOR")).toBe(true);
    expect(taskAppliesTo(["ACCOUNTS"], "ACCOUNTS")).toBe(true);
    expect(taskAppliesTo(["ACCOUNTS"], "STORE_MANAGER")).toBe(false);
  });
});

describe("summary and unresolved items", () => {
  const item = (id: string, status: ChecklistItem["status"]): ChecklistItem => ({
    id,
    kind: "system",
    title: id,
    detail: null,
    status,
    count: null,
    href: null,
    dueTime: null,
    taskId: null,
  });
  const items = [item("a", "PENDING"), item("b", "COMPLETED"), item("c", "CRITICAL"), item("d", "OVERDUE"), item("e", "PENDING")];

  it("counts items per status", () => {
    expect(summarizeStatuses(items)).toEqual({ CRITICAL: 1, OVERDUE: 1, PENDING: 2, COMPLETED: 1 });
  });

  it("lists what is still open, most urgent first", () => {
    expect(unresolvedItems(items).map((i) => i.id)).toEqual(["c", "d", "a", "e"]);
  });
});
