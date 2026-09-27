/**
 * Engineering spec §9: "generation is pure and draws only on the curated
 * lists". The privacy property - that no response carries a Google display
 * name - is tested at the API boundary, not here.
 */

import { ADJECTIVES, ANIMALS, generateName } from "./names";

describe("generateName", () => {
  it("joins one curated adjective and one curated animal in PascalCase", () => {
    const name = generateName(() => 0);
    expect(name).toBe(`${ADJECTIVES[0]}${ANIMALS[0]}`);
    expect(name).toMatch(/^[A-Z][a-z]+[A-Z][a-z]+$/);
  });

  it("is deterministic for a given random source", () => {
    expect(generateName(() => 0.5)).toBe(generateName(() => 0.5));
  });

  it("only ever draws from the curated lists", () => {
    for (let i = 0; i < 500; i++) {
      const name = generateName();
      const adjective = ADJECTIVES.find((a) => name.startsWith(a));
      expect(adjective).toBeDefined();
      expect(ANIMALS).toContain(name.slice(adjective!.length));
    }
  });

  it("stays inside the lists at the top of the random range", () => {
    expect(() => generateName(() => 0.999999)).not.toThrow();
    expect(generateName(() => 0.999999)).toBe(
      `${ADJECTIVES[ADJECTIVES.length - 1]}${ANIMALS[ANIMALS.length - 1]}`,
    );
  });
});
