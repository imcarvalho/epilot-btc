import * as stylex from "@stylexjs/stylex";
import { Loader } from "lucide-react";
import { Icon } from "@astryxdesign/core/Icon";
import { Panel } from "@/components/ui";
import { palette } from "@/components/ui/tokens.stylex";

/**
 * The strip between the buttons and the panels: what is going on with the
 * guess. On a first visit, nothing yet - so it says what to do, and who the
 * player is (product spec §7, "First visit").
 */
export function GuessStrip({ name }: { name: string | null }) {
  return (
    <Panel as="div" variant="dashed">
      <div {...stylex.props(styles.row)}>
        <span aria-hidden {...stylex.props(styles.icon)}>
          <Icon icon={Loader} size="md" />
        </span>
        <div {...stylex.props(styles.text)}>
          <p {...stylex.props(styles.lead)}>Will BTC be higher or lower in a minute? Make your first guess.</p>
          {name && (
            <p {...stylex.props(styles.sub)}>
              You are {name}. Your score is kept on this browser until you sign in.
            </p>
          )}
        </div>
      </div>
    </Panel>
  );
}

const styles = stylex.create({
  row: {
    alignItems: "center",
    display: "flex",
    gap: "var(--spacing-5)",
  },
  icon: {
    color: palette.purple,
    display: "inline-flex",
    flexShrink: 0,
  },
  text: {
    display: "flex",
    flexDirection: "column",
    gap: "var(--spacing-1)",
  },
  lead: {
    color: "var(--color-text-primary)",
    fontSize: "var(--font-size-xl)",
    margin: 0,
  },
  sub: {
    color: "var(--color-text-secondary)",
    margin: 0,
  },
});
