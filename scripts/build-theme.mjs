// Builds the Dracula theme quietly. `astryx theme build` prints install
// instructions and an `astryx init` nudge on every run; this shows its output
// only when the build fails.
import { spawnSync } from 'node:child_process';

const result = spawnSync(
	'npx',
	[
		'astryx',
		'theme',
		'build',
		'src/themes/dracula.theme.ts',
		'-o',
		'src/themes/dracula.css',
	],
	{
		encoding: 'utf8',
	},
);

if (result.status !== 0) {
	process.stdout.write(result.stdout ?? '');
	process.stderr.write(result.stderr ?? '');
	process.exit(result.status ?? 1);
}
