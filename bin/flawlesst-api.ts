#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { FlawlesstApiStack } from '../infrastructure/lib/flawlesst-api-stack';

const app = new cdk.App();

new FlawlesstApiStack(app, 'FlawlesstApiStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION ?? 'eu-west-2',
  },
});
