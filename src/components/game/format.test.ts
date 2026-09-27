import { formatAge, formatUsd } from "./format";

describe("formatUsd", () => {
  it("always shows two decimals, whatever Coinbase sent", () => {
    expect(formatUsd(84650.025)).toBe("$84,650.03");
    expect(formatUsd(111144.8)).toBe("$111,144.80");
  });
});

describe("formatAge", () => {
  it("counts seconds, then minutes, then hours", () => {
    expect(formatAge(1_000)).toBe("1s ago");
    expect(formatAge(59_400)).toBe("59s ago");
    expect(formatAge(60_000)).toBe("1 min ago");
    expect(formatAge(2 * 3_600_000)).toBe("2 h ago");
  });

  it("never shows a negative age from a small clock difference", () => {
    expect(formatAge(-800)).toBe("0s ago");
  });
});
