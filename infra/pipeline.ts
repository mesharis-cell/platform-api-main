import type * as pulumi from "@pulumi/pulumi";
import { config, resourceName } from "./config";

export function createCodeBuildProject(
    aws: typeof import("@pulumi/aws"),
    pulumi: typeof import("@pulumi/pulumi"),
    awsUsEast1: import("@pulumi/aws").Provider,
    codeBuildRole: import("@pulumi/aws/iam").Role,
    awsAccountId: string,
    stage: string
) {
    const codeBuildProject = new aws.codebuild.Project(
        resourceName("build", stage),
        {
            name: `${config.appName}-${stage}-build`,
            description: `CodeBuild project for ${stage} environment`,
            serviceRole: codeBuildRole.arn,
            artifacts: {
                type: "CODEPIPELINE",
            },
            environment: {
                computeType: config.codeBuild.computeType,
                image: config.codeBuild.image,
                type: "LINUX_CONTAINER",
                privilegedMode: true,
                environmentVariables: [
                    {
                        name: "AWS_DEFAULT_REGION",
                        value: config.regions.primary,
                    },
                    {
                        name: "AWS_ACCOUNT_ID",
                        value: awsAccountId,
                    },
                    {
                        name: "IMAGE_REPO_NAME",
                        value: pulumi.interpolate`${config.appName}-${stage}`,
                    },
                    {
                        name: "IMAGE_TAG",
                        value: "latest",
                    },
                ],
            },
            source: {
                type: "CODEPIPELINE",
                buildspec: config.codeBuild.buildspec,
            },
        },
        { provider: awsUsEast1 }
    );

    return codeBuildProject;
}

export function createPipeline(
    aws: typeof import("@pulumi/aws"),
    awsUsEast1: import("@pulumi/aws").Provider,
    codePipelineRole: import("@pulumi/aws/iam").Role,
    artifactBucketUsEast1: import("@pulumi/aws/s3").Bucket,
    artifactBucketApSouth1: import("@pulumi/aws/s3").Bucket,
    codeBuildProject: import("@pulumi/aws/codebuild").Project,
    connectionArn: string,
    branch: string,
    stage: string,
    beanstalkAppName: pulumi.Output<string>,
    beanstalkEnvName: pulumi.Output<string>
) {
    const pipeline = new aws.codepipeline.Pipeline(
        resourceName("pipeline", stage),
        {
            name: `${config.appName}-${stage}-pipeline`,
            roleArn: codePipelineRole.arn,
            artifactStores: [
                {
                    location: artifactBucketUsEast1.bucket,
                    type: "S3",
                    region: config.regions.secondary,
                },
                {
                    location: artifactBucketApSouth1.bucket,
                    type: "S3",
                    region: config.regions.primary,
                },
            ],
            stages: [
                {
                    name: "Source",
                    actions: [
                        {
                            name: "Source",
                            category: "Source",
                            owner: "AWS",
                            provider: "CodeStarSourceConnection",
                            version: "1",
                            outputArtifacts: ["source_output"],
                            configuration: {
                                ConnectionArn: connectionArn,
                                FullRepositoryId: config.repository.fullId,
                                BranchName: branch,
                                OutputArtifactFormat: "CODE_ZIP",
                            },
                            region: config.regions.secondary,
                        },
                    ],
                },
                {
                    name: "Build",
                    actions: [
                        {
                            name: "Build",
                            category: "Build",
                            owner: "AWS",
                            provider: "CodeBuild",
                            version: "1",
                            inputArtifacts: ["source_output"],
                            outputArtifacts: ["build_output"],
                            configuration: {
                                ProjectName: codeBuildProject.name,
                            },
                            region: config.regions.secondary,
                        },
                    ],
                },
                {
                    name: "Deploy",
                    actions: [
                        {
                            name: "DeployToElasticBeanstalk",
                            category: "Deploy",
                            owner: "AWS",
                            provider: "ElasticBeanstalk",
                            version: "1",
                            inputArtifacts: ["build_output"],
                            configuration: {
                                ApplicationName: beanstalkAppName,
                                EnvironmentName: beanstalkEnvName,
                            },
                            region: config.regions.primary,
                        },
                    ],
                },
            ],
        },
        { provider: awsUsEast1 }
    );

    return pipeline;
}
