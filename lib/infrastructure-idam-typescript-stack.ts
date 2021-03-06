import * as cdk from '@aws-cdk/core';
import * as cognito from "@aws-cdk/aws-cognito";
import { Duration, RemovalPolicy } from '@aws-cdk/core';
import * as iam from "@aws-cdk/aws-iam"
import * as lambda from "@aws-cdk/aws-lambda";

export class InfrastructureIdamTypescriptStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const POLICY = {
      "Version": "2012-10-17",
      "Statement": [
          {
              "Effect": "Allow",
              "Action": [
                  "sns:Publish"
              ],
              "Resource": "*"
          }
      ]
  }
    const snsPolicy = iam.PolicyDocument.fromJson(POLICY)
    const poolSmsRole = new iam.Role(this, 'Role', {
      assumedBy: new iam.ServicePrincipal('cognito-idp.amazonaws.com'),
      inlinePolicies:{['sns-test']:snsPolicy}
    });

    const customMessage = new lambda.Function(this, "CustomMessageHandler", {
      runtime: lambda.Runtime.NODEJS_10_X,
      code: lambda.Code.fromAsset("lambdas"),
      handler: "customMessage.handler",
    });

    const userpool = new cognito.UserPool(this, 'testUserPool', {
      userPoolName: 'test-cdk',
      selfSignUpEnabled: true,
      userInvitation: {
        emailSubject: 'Invite to join our test app!',
        emailBody: 'Hello {username}, you have been invited to join our test app! Your temporary password is {####}',
        smsMessage: undefined
      },
      signInAliases: {
        email: true,
        username: false,
        phone: false
      },
      standardAttributes: {
        // this is "name in coginto console"
        fullname: {
          required: true,
          mutable: false,
        },
        address: {
          required: true,
          mutable: false,
        },
        email: {
          required: true,
          mutable: false
        },
        familyName: {
          required: true,
          mutable: false
        },
        
      },
      customAttributes: {
        'terms': new cognito.BooleanAttribute({ mutable: true })
      },
      accountRecovery: 2,
      autoVerify: {
        email: true,
        phone: false
      },
      signInCaseSensitive: false,
      passwordPolicy: {
        minLength: 8,
        requireLowercase: false,
        requireUppercase: false,
        requireDigits: false,
        requireSymbols: false,
        tempPasswordValidity: Duration.days(7),
      },
      removalPolicy: RemovalPolicy.DESTROY,
      mfa: cognito.Mfa.REQUIRED,
      mfaSecondFactor: {
        sms: true,
        otp: true
      },
      smsRole: poolSmsRole,
      smsRoleExternalId: 'c87467be-4f34-11ea-b77f-2e728ce88125',
    });   
    userpool.addClient('IDAM_BACKEND', {
        generateSecret: false,
        authFlows: {
          adminUserPassword: false,
          custom: true,
          userPassword: true,
          userSrp: true
        },
        oAuth: {
          callbackUrls: ["http://localhost:3000/success"],
          flows: {
            authorizationCodeGrant: true,
            implicitCodeGrant: true,
            clientCredentials: false
          },
    
        },
        preventUserExistenceErrors: true
    
    });

    userpool.addTrigger({
        operationName: "customMessage"
    },customMessage);
  }
}
