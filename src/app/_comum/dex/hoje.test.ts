import { describe, expect, it } from "vitest";

import { hojeLocal } from "./hoje";

describe("hojeLocal", () => {
  it("usa o dia do relógio local, não o da UTC", () => {
    // 23h59 locais: em qualquer fuso a oeste de Greenwich a UTC já é o dia seguinte.
    expect(hojeLocal(new Date(2026, 10, 22, 23, 59))).toBe("2026-11-22");
    expect(hojeLocal(new Date(2026, 10, 23, 0, 1))).toBe("2026-11-23");
  });

  it("preenche mês e dia com zero", () => {
    expect(hojeLocal(new Date(2027, 0, 5, 12))).toBe("2027-01-05");
  });

  it("sem argumento, é hoje", () => {
    expect(hojeLocal()).toBe(hojeLocal(new Date()));
  });
});
