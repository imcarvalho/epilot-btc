import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import './globals.css';
import { Providers } from './providers';

// Served from the repository (./fonts, SIL OFL 1.1: the variable fonts' Latin
// subset, as Google Fonts serves it), so the build fetches nothing. The
// Dracula theme reads them through these two variables
// (src/themes/dracula.theme.ts).
const sans = localFont({
	src: './fonts/SpaceGrotesk-Variable.woff2',
	weight: '300 700',
	variable: '--font-sans',
	display: 'swap',
});
const mono = localFont({
	src: './fonts/JetBrainsMono-Variable.woff2',
	weight: '100 800',
	variable: '--font-mono',
	display: 'swap',
});

export const metadata: Metadata = {
	title: 'BTC Guess',
	description:
		'Guess whether BTC/USD will be higher or lower one minute from now.',
};

export const viewport: Viewport = {
	colorScheme: 'dark',
	themeColor: '#17171F',
};

export default function RootLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	return (
		<html
			data-theme="dark"
			data-astryx-theme
			lang="en"
			className={`${sans.variable} ${mono.variable}`}
		>
			<body>
				<Providers>{children}</Providers>
			</body>
		</html>
	);
}
