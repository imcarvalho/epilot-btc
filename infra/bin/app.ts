#!/usr/bin/env node
import 'source-map-support/register';
import { App } from 'aws-cdk-lib';
import { BtcGuessStack } from '../lib/btc-guess-stack';

const app = new App();

// Pinned, not taken from the deployer's profile (engineering spec §2). The
// profile only supplies credentials, so a different profile region is
// harmless, but worth saying out loud.
const REGION = 'eu-central-1';
const profileRegion = process.env.CDK_DEFAULT_REGION;
if (profileRegion && profileRegion !== REGION) {
	console.warn(
		`AWS profile region is ${profileRegion}; deploying to ${REGION} regardless.`,
	);
}

// The Amplify Hosting app (dalnijp0oanzq, eu-central-1), production branch.
const SITE = 'https://main.dalnijp0oanzq.amplifyapp.com';
const SWEEP_URL = `${SITE}/api/cron/resolve`;

new BtcGuessStack(app, 'BtcGuessStack', {
	env: {
		account: process.env.CDK_DEFAULT_ACCOUNT,
		region: REGION,
	},
	sweepUrl: SWEEP_URL,
	streamOrigins: [SITE, 'http://localhost:3000'],
});
