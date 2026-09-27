import * as stylex from "@stylexjs/stylex";
import { Avatar } from "@astryxdesign/core/Avatar";
import { Pill } from "./Pill";

/** "AudaciousRaccoon" -> "Audacious Raccoon", so the avatar's initials read "AR". */
const spaced = (name: string) => name.replace(/([a-z])([A-Z])/g, "$1 $2");

/** The player's generated public name, with its initials (product spec §6.6). */
export function PlayerChip({ name }: { name: string }) {
  return (
    <Pill xstyle={styles.pill}>
      {/* Decorative: the name is right beside it. */}
      <span aria-hidden {...stylex.props(styles.avatar)}>
        <Avatar name={spaced(name)} size="sm" tooltip={false} />
      </span>
      <span {...stylex.props(styles.name)}>{name}</span>
    </Pill>
  );
}

const styles = stylex.create({
  pill: {
    paddingInlineStart: "var(--spacing-1-5)",
  },
  avatar: {
    display: "inline-flex",
    transform: "scale(1.25)",
    marginInline: "var(--spacing-1)",
  },
  name: {
    color: "var(--color-text-primary)",
    fontSize: "var(--font-size-lg)",
    fontWeight: "var(--font-weight-medium)",
  },
});
