import { expect as expectCDK, matchTemplate, MatchStyle } from '@aws-cdk/assert';
import * as cdk from '@aws-cdk/core';
import * as InfrastructureIdamTypescript from '../lib/infrastructure-idam-typescript-stack';

test('Empty Stack', () => {
    const app = new cdk.App();
    // WHEN
    const stack = new InfrastructureIdamTypescript.InfrastructureIdamTypescriptStack(app, 'MyTestStack');
    // THEN
    expectCDK(stack).to(matchTemplate({
      "Resources": {}
    }, MatchStyle.EXACT))
});
