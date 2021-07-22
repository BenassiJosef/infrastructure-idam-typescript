import cdk = require('@aws-cdk/core');
import ec2 = require("@aws-cdk/aws-ec2");
import ecr = require('@aws-cdk/aws-ecr');
import ecs = require("@aws-cdk/aws-ecs");
import ecs_patterns = require("@aws-cdk/aws-ecs-patterns");
import iam = require("@aws-cdk/aws-iam");
import codebuild = require('@aws-cdk/aws-codebuild');
import codepipeline = require('@aws-cdk/aws-codepipeline');
import codepipeline_actions = require('@aws-cdk/aws-codepipeline-actions');
import * as CDK from '@aws-cdk/core'
import * as CodePipeline from '@aws-cdk/aws-codepipeline'
import * as CodePipelineAction from '@aws-cdk/aws-codepipeline-actions'
import * as CodeBuild from '@aws-cdk/aws-codebuild'
import {Certificate, CertificateValidation} from '@aws-cdk/aws-certificatemanager';
import * as route53 from '@aws-cdk/aws-route53';
import { Secret } from '@aws-cdk/aws-secretsmanager';

export interface PipelineProps extends CDK.StackProps {
    github: {
      owner: string
      repository: string
    }
  }
export class ECRStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props: PipelineProps) {
    super(scope, id, props);

    const vpc = new ec2.Vpc(this, "MyVpcECRTEST", {
        maxAzs: 3 // Default is all AZs in region
      });
  
      const cluster = new ecs.Cluster(this, "MyClusterECRTEST", {
        vpc: vpc
      });

      const taskRole = new iam.Role(this, `ecs-taskRole-${this.stackName}`, {
        roleName: `ecs-taskRole-${this.stackName}`,
        assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com')
      });

      const executionRolePolicy =  new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        resources: ['*'],
        actions: [
                  "ecr:GetAuthorizationToken",
                  "ecr:BatchCheckLayerAvailability",
                  "ecr:GetDownloadUrlForLayer",
                  "ecr:BatchGetImage",
                  "logs:CreateLogStream",
                  "logs:PutLogEvents"
              ]
      });
  
      const taskDef = new ecs.FargateTaskDefinition(this, "ecs-taskdef", {
        taskRole: taskRole
      });
  
      taskDef.addToExecutionRolePolicy(executionRolePolicy);
      
      const logging = new ecs.AwsLogDriver({
        streamPrefix: "ecs-logs-node-joe"
      });
  
      const container = taskDef.addContainer('joe-node', {
        image: ecs.ContainerImage.fromRegistry("amazon/amazon-ecs-sample"),
        memoryLimitMiB: 256,
        cpu: 256,
        logging: logging,
        secrets: {
          AWS_ACCESS_KEY_ID: ecs.Secret.fromSecretsManager(Secret.fromSecretNameV2(this, "access_key", "AWS_ACCESS_KEY_ID")),
          AWS_SECRET_ACCESS_KEY: ecs.Secret.fromSecretsManager(Secret.fromSecretNameV2(this, "secret_access_key", "AWS_SECRET_ACCESS_KEY")),
          AWS_REGION: ecs.Secret.fromSecretsManager(Secret.fromSecretNameV2(this, "region", "AWS_REGION")),
          AWS_USER_POOL_ID: ecs.Secret.fromSecretsManager(Secret.fromSecretNameV2(this, "pool_id", "AWS_USER_POOL_ID")),
          AWS_USER_POOL_CLIENT_ID: ecs.Secret.fromSecretsManager(Secret.fromSecretNameV2(this, "pool_client_id", "AWS_USER_POOL_CLIENT_ID"))
        }
      });
  
      container.addPortMappings({
        containerPort: 8000,
        protocol: ecs.Protocol.TCP
      });

      

      const domainName = "idam.link";
      const alternativeDomains = "*.idam.link";

      const hostedZone = route53.HostedZone.fromHostedZoneAttributes(this,'idam.link',{
        hostedZoneId: 'Z0483838INILSJESX4EG',
        zoneName:'idam.link'
      })

      const cert = new Certificate(this, 'cert', {domainName, validation : CertificateValidation.fromEmail(), subjectAlternativeNames: [alternativeDomains]})
      //CertificateValidation.fromEmail({["idam.link"]:"admin@idam.link"})
      // Create a load-balanced Fargate service and make it public
       const fargateService = new ecs_patterns.ApplicationLoadBalancedFargateService(this, "MyFargateServiceECRTEST", {
        cluster: cluster, // Required
        cpu: 256, // Default is 256
        desiredCount: 1, // Default is 1
        taskDefinition: taskDef,
        memoryLimitMiB: 2048, // Default is 512
        publicLoadBalancer: true, // Default is false,
        certificate: cert,
        domainName:"api.idam.link",
        domainZone: hostedZone,
      });


    const ECRRole : iam.IRole = new iam.Role(this, 'ECRBuildRole', {
      assumedBy: new iam.ServicePrincipal('codebuild.amazonaws.com'),
    });

    const executionRolePolicyE =  new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      resources: ['*'],
      actions: [
                "ecr:GetAuthorizationToken",
                "ecr:BatchCheckLayerAvailability",
                "ecr:GetDownloadUrlForLayer",
                "ecr:InitiateLayerUpload",
                "ecr:UploadLayerPart",
                "ecr:CompleteLayerUpload",
                "ecr:PutImage",
                "ecr:BatchGetImage",
                "logs:CreateLogStream",
                "logs:PutLogEvents"
            ],
    });

    ECRRole.addToPrincipalPolicy(executionRolePolicyE);

    // ECR - repo
    const ecrRepo  = new ecr.Repository(this, 'EcrRepoECRTEST');
    ecrRepo.applyRemovalPolicy(cdk.RemovalPolicy.DESTROY)


    // ***PIPELINE ACTIONS***

    const outputSources = new CodePipeline.Artifact()
    const outputBuild = new CodePipeline.Artifact()

    const pipeline = new CodePipeline.Pipeline(this, 'MyECSPipelineECRTEST', {
        pipelineName: 'BackendMyECSPipelineECRTEST',
        restartExecutionOnUpdate: true,
      })
  
      // AWS CodePipeline stage to clone sources from GitHub repository
      pipeline.addStage({
        stageName: 'Source',
        actions: [
          new CodePipelineAction.GitHubSourceAction({
            actionName: 'Checkout',
            owner: props.github.owner,
            repo: props.github.repository,
            branch:"main",
            oauthToken: CDK.SecretValue.secretsManager('GitHubTokenEcs'),
            output: outputSources,
            trigger: CodePipelineAction.GitHubTrigger.WEBHOOK,
          }),
        ],
      })
  
      // AWS CodePipeline stage to build CRA website and CDK resources
      pipeline.addStage({
        stageName: 'Build',
        actions: [
          // AWS CodePipeline action to run CodeBuild project
          new CodePipelineAction.CodeBuildAction({
            actionName: 'BuildNodeApp',
            // role: ECRRole,
            project: new CodeBuild.PipelineProject(this, 'BuildWebsite', {
              projectName: 'ecsNodeAppTest',
              environment: {
                buildImage: codebuild.LinuxBuildImage.AMAZON_LINUX_2_2,
                privileged: true
              },
              role:ECRRole,
              environmentVariables: {
                'CLUSTER_NAME': {
                  value: `${cluster.clusterName}`
                },
                'ECR_REPO_URI': {
                  value: `${ecrRepo.repositoryUri}`
                }
              },
              buildSpec: codebuild.BuildSpec.fromObject({
                version: "0.2",
                phases: {
                  pre_build: {
                    commands: [
                      'echo Logging in to Amazon ECR...',
                      'aws --version',
                      '$(aws ecr get-login --region eu-west-1 --no-include-email)',
                      'COMMIT_HASH=$(echo $CODEBUILD_RESOLVED_SOURCE_VERSION | cut -c 1-7)',
                      'IMAGE_TAG=${COMMIT_HASH:=latest}',
                      'docker login -u josefbenassi -p dogcatpig100.'
                    ]
                  },
                  build: {
                    commands: [
                      'echo Build started on `date` ',
                      'echo Building the Docker image...',
                      'docker build -t $ECR_REPO_URI:latest .',
                      'docker tag $ECR_REPO_URI:latest $ECR_REPO_URI:$IMAGE_TAG'
                    ]
                  },
                  post_build: {
                    commands: [
                      'echo Build completed on `date`',
                      'echo Pushing the Docker images...',
                      'docker push $ECR_REPO_URI:latest',
                      'docker push $ECR_REPO_URI:$IMAGE_TAG',
                      "printf '[{\"name\":\"%s\",\"imageUri\":\"%s\"}]' joe-node $ECR_REPO_URI:$IMAGE_TAG > imagedefinitions.json",
                      "pwd; ls -al; cat imagedefinitions.json"
                    ]
                  }
                },
                artifacts: {
                  files: [
                    'imagedefinitions.json'
                  ]
                }
              }),
            }),
            input: outputSources,
            outputs: [outputBuild],
          }),
        ],
      })

      pipeline.addStage({
        stageName: 'ManualApproval',
        actions: [
       
          new codepipeline_actions.ManualApprovalAction({
            actionName: 'Approve',
          })
        ],
      })

      pipeline.addStage({
        stageName: 'Deploy',
        actions: [
          // AWS CodePipeline action to deploy node app to ecs fargate
          new CodePipelineAction.EcsDeployAction({
            actionName: 'DeployAction',
            service: fargateService.service,
            imageFile: new codepipeline.ArtifactPath(outputBuild , `imagedefinitions.json`)
          })
        ],
      })    
    }

}