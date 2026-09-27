import { formatRate, successRate } from "./stats";

describe("successRate", () => {
  it("is correct guesses over resolved guesses, as a whole percent", () => {
    expect(successRate({ wins: 7, losses: 6 })).toBe(54);
    expect(successRate({ wins: 2, losses: 8 })).toBe(20);
    expect(successRate({ wins: 1, losses: 0 })).toBe(100);
    expect(successRate({ wins: 0, losses: 3 })).toBe(0);
  });

  it("does not exist before anything has resolved", () => {
    expect(successRate({ wins: 0, losses: 0 })).toBeNull();
  });

  it("rounds half up, so 1 of 8 is 13% rather than 12%", () => {
    expect(successRate({ wins: 1, losses: 7 })).toBe(13);
  });
});

describe("formatRate", () => {
  it("shows a percent, or a dash before the first result", () => {
    expect(formatRate(54)).toBe("54%");
    expect(formatRate(null)).toBe("-");
  });
});
