#!/usr/bin/env node
import 'source-map-support/register';
import { App } from 'aws-cdk-lib';
import { BtcGuessStack } from '../lib/btc-guess-stack';

const app = new App();

// The Amplify Hosting app (dalnijp0oanzq, eu-central-1), production branch.
const SITE = 'https://main.dalnijp0oanzq.amplifyapp.com';
const SWEEP_URL = `${SITE}/api/cron/resolve`;

new BtcGuessStack(app, 'BtcGuessStack', {
	env: {
		region: process.env.CDK_DEFAULT_REGION ?? 'eu-central-1',
	},
	sweepUrl: SWEEP_URL,
	streamOrigins: [SITE, 'http://localhost:3000'],
});
