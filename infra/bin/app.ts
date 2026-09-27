#!/usr/bin/env node
import 'source-map-support/register'
import { App } from 'aws-cdk-lib'
import { BtcGuessStack } from '../lib/btc-guess-stack'

const app = new App()

new BtcGuessStack(app, 'BtcGuessStack', {
  env: { region: process.env.CDK_DEFAULT_REGION ?? 'eu-central-1' },
})
