'use client';

import Link from 'next/link';
import { Theme } from '@astryxdesign/core/theme';
import { LinkProvider } from '@astryxdesign/core/Link';
import { draculaTheme } from '@/themes/dracula.js';

export function Providers({ children }: { children: React.ReactNode }) {
	return (
		<Theme theme={draculaTheme} mode="dark">
			<LinkProvider component={Link}>{children}</LinkProvider>
		</Theme>
	);
}
