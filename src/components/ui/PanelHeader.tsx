import * as stylex from "@stylexjs/stylex";
import type { ComponentType, ReactNode, SVGProps } from "react";
import { Icon } from "@astryxdesign/core/Icon";
import { Text } from "@astryxdesign/core/Text";

/** Icon, title and an optional right-aligned note, as at the top of every panel. */
export function PanelHeader({
  id,
  icon,
  iconColor,
  title,
  meta,
}: {
  id?: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  /** A palette token: the icon is the one coloured thing in a panel header. */
  iconColor: string;
  title: string;
  meta?: ReactNode;
}) {
  return (
    <div {...stylex.props(styles.row)}>
      <span {...stylex.props(styles.icon(iconColor))}>
        <Icon icon={icon} size="md" />
      </span>
      <h2 id={id} {...stylex.props(styles.title)}>
        {title}
      </h2>
      {meta !== undefined && (
        <Text type="supporting" xstyle={styles.meta}>
          {meta}
        </Text>
      )}
    </div>
  );
}

const styles = stylex.create({
  row: {
    alignItems: "center",
    display: "flex",
    gap: "var(--spacing-3)",
  },
  icon: (color: string) => ({
    color,
    display: "inline-flex",
  }),
  title: {
    color: "var(--color-text-primary)",
    fontSize: "var(--font-size-lg)",
    fontWeight: "var(--font-weight-medium)",
    margin: 0,
  },
  meta: {
    marginInlineStart: "auto",
  },
});
