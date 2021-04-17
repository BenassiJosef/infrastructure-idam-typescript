import * as CDK from '@aws-cdk/core'
import * as CodeBuild from '@aws-cdk/aws-codebuild'
import * as S3 from '@aws-cdk/aws-s3'
import * as CodePipeline from '@aws-cdk/aws-codepipeline'
import * as CodePipelineAction from '@aws-cdk/aws-codepipeline-actions'
import * as cloudfront from '@aws-cdk/aws-cloudfront';

export interface PipelineProps extends CDK.StackProps {
  github: {
    owner: string
    repository: string
  }
}

export class Pipeline extends CDK.Stack {
  constructor(scope: CDK.App, id: string, props: PipelineProps) {
    super(scope, id, props)

    // Amazon S3 bucket to store CRA website
    const bucketWebsite = new S3.Bucket(this, 'Files', {
      websiteIndexDocument: 'index.html',
      websiteErrorDocument: 'index.html',
      publicReadAccess: true,
      removalPolicy: CDK.RemovalPolicy.DESTROY
    })

    // AWS CodeBuild artifacts
    const outputSources = new CodePipeline.Artifact()
    const outputWebsite = new CodePipeline.Artifact()

    // AWS CodePipeline pipeline
    const pipeline = new CodePipeline.Pipeline(this, 'Pipeline', {
      pipelineName: 'Website',
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
          oauthToken: CDK.SecretValue.secretsManager('GitHubToken'),
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
          actionName: 'Website',
          project: new CodeBuild.PipelineProject(this, 'BuildWebsite', {
            projectName: 'Website',
            buildSpec: CodeBuild.BuildSpec.fromSourceFilename('./buildspec.yml'),
          }),
          input: outputSources,
          outputs: [outputWebsite],
        }),
      ],
    })

    // AWS CodePipeline stage to deployt CRA website and CDK resources
    pipeline.addStage({
      stageName: 'Deploy',
      actions: [
        // AWS CodePipeline action to deploy CRA website to S3
        new CodePipelineAction.S3DeployAction({
          actionName: 'Website',
          input: outputWebsite,
          bucket: bucketWebsite,
        }),
      ],
    })

    new CDK.CfnOutput(this, 'WebsiteURL', {
      value: bucketWebsite.bucketWebsiteUrl,
      description: 'Website URL',
    })

  // Cloudfront uses bucket created above for content
   const cf =  new cloudfront.CloudFrontWebDistribution(this, "CDKIdamUiStaticDistribution", {
      originConfigs: [
        {
          s3OriginSource: {
            s3BucketSource: bucketWebsite
          },
          behaviors: [{isDefaultBehavior: true}]
        },
      ],
      errorConfigurations:[{
        errorCode: 403,
        errorCachingMinTtl: 60,
        responsePagePath:"/index.html",
        responseCode: 200
      }],
    });
  
    new CDK.CfnOutput(this, 'CFURL', {
      value: cf.distributionDomainName,
      description: 'CF URL',
    })
  
  }
}