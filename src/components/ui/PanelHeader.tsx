import * as stylex from "@stylexjs/stylex";
import type { ComponentType, ReactNode, SVGProps } from "react";
import { Icon } from "@astryxdesign/core/Icon";
import { Text } from "@astryxdesign/core/Text";
import { styles } from "./PanelHeader.styles";

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
