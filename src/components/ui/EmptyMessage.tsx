import * as stylex from "@stylexjs/stylex";
import { styles } from "./EmptyMessage.styles";

/**
 * What an empty panel says instead of apologising: a plain statement, then
 * what will fill the space (product spec §5, "Day zero").
 */
export function EmptyMessage({ title, body }: { title: string; body: string }) {
  return (
    <div {...stylex.props(styles.base)}>
      <p {...stylex.props(styles.title)}>{title}</p>
      <p {...stylex.props(styles.body)}>{body}</p>
    </div>
  );
}
