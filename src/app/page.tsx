"use client";

import * as stylex from "@stylexjs/stylex";
import { VStack, HStack } from "@astryxdesign/core/Layout";
import { Button } from "@astryxdesign/core/Button";
import { Text, Heading } from "@astryxdesign/core/Text";
import { Badge } from "@astryxdesign/core/Badge";

// Day-one checkpoint (CLAUDE.md, "Day one, before any feature code", item 1):
// prove StyleX compiles, a real Astryx component renders, and atomic CSS is
// emitted, before any game logic lands here. Replaced by the guess-and-resolve
// screen next (product spec §9, build order item 1).

const styles = stylex.create({
  main: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: "100vh",
    padding: "2rem",
  },
  card: {
    maxWidth: 480,
    width: "100%",
    borderRadius: 8,
    border: "1px solid var(--color-border)",
    padding: "1.5rem",
    backgroundColor: "var(--color-background-body)",
  },
});

export default function Home() {
  return (
    <main {...stylex.props(styles.main)}>
      <div {...stylex.props(styles.card)}>
        <VStack gap={4}>
          <VStack gap={1}>
            <Heading level={1}>BTC Guess</Heading>
            <Text type="body" color="secondary">
              Scaffold checkpoint: StyleX compiling, an Astryx component on
              screen, atomic CSS emitted.
            </Text>
          </VStack>
          <HStack gap={3} vAlign="center">
            <Button label="Higher" variant="primary" />
            <Button label="Lower" variant="secondary" />
            <Badge variant="info" label="Not wired up yet" />
          </HStack>
        </VStack>
      </div>
    </main>
  );
}
