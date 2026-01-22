/// <reference path="./.sst/platform/config.d.ts" />

export default $config({
    app(input) {
        return {
            name: "kadence-api",
            removal: input?.stage === "production" ? "retain" : "remove",
            protect: ["production"].includes(input?.stage),
            home: "aws",
            providers: {
                aws: {
                    region: "ap-south-1",
                },
            },
        };
    },
    async run() {
        const aws = await import("@pulumi/aws");
        const pulumi = await import("@pulumi/pulumi");
        const fs = await import("fs");
        const path = await import("path");

        const awsUsEast1 = new aws.Provider("useast1", {
            region: "us-east-1",
        });

        const awsAccountId = (await aws.getCallerIdentity()).accountId;
        const region = "ap-south-1";
        const usEast1Region = "us-east-1";
        const connectionArn =
            "arn:aws:codeconnections:us-east-1:965847494840:connection/f73b48ae-2ff4-4f67-95a3-c3ed67fb1319";

        const branchMap: Record<string, string> = {
            staging: "staging",
            production: "main",
        };
        const branch = branchMap[$app.stage] || "staging";

        const bucket = new sst.aws.Bucket("kadence");

        const instanceProfileRole = createInstanceProfileRole(aws);
        const instanceProfile = createInstanceProfile(aws, instanceProfileRole);
        const serviceRole = createServiceRole(aws);
        const ecrRepo = createECRRepository(aws);
        const { artifactBucketUsEast1, artifactBucketApSouth1 } = createArtifactBuckets(
            aws,
            awsUsEast1
        );
        const codeBuildRole = createCodeBuildRole(
            aws,
            artifactBucketUsEast1,
            artifactBucketApSouth1,
            ecrRepo,
            awsAccountId,
            usEast1Region
        );
        const codeBuildProject = createCodeBuildProject(
            aws,
            awsUsEast1,
            codeBuildRole,
            region,
            awsAccountId,
            branch
        );
        const codePipelineRole = createCodePipelineRole(
            aws,
            artifactBucketUsEast1,
            artifactBucketApSouth1,
            codeBuildProject,
            connectionArn
        );
        const pipeline = createPipeline(
            aws,
            awsUsEast1,
            codePipelineRole,
            artifactBucketUsEast1,
            artifactBucketApSouth1,
            codeBuildProject,
            connectionArn,
            branch,
            usEast1Region,
            region
        );
        const app = createElasticBeanstalkApp(aws);

        const appVersionBucket = new aws.s3.BucketObjectv2(`kadence-api-dockerrun-${$app.stage}`, {
            bucket: bucket.name,
            key: `dockerrun-${$app.stage}.json`,
            content: pulumi.interpolate`{
              "AWSEBDockerrunVersion": "1",
              "Image": {
                "Name": "${ecrRepo.repositoryUrl}:latest",
                "Update": "true"
              },
              "Ports": [
                {
                  "ContainerPort": 9000,
                  "HostPort": 80
                }
              ],
              "Logging": "/var/log/nginx"
            }`,
            contentType: "application/json",
        });

        const appVersion = new aws.elasticbeanstalk.ApplicationVersion(
            `kadence-api-version-${$app.stage}`,
            {
                application: app.name,
                bucket: bucket.name,
                key: appVersionBucket.key,
                name: `v1-${$app.stage}`,
            },
            { dependsOn: [appVersionBucket] }
        );

        const env = createElasticBeanstalkEnvironment(
            aws,
            pulumi,
            app,
            serviceRole,
            instanceProfile,
            ecrRepo,
            appVersion
        );

        return {
            bucketName: bucket.name,
            ecrRepositoryUrl: ecrRepo.repositoryUrl,
            environmentUrl: env.endpointUrl,
            pipelineName: pipeline.name,
            codeBuildProjectName: codeBuildProject.name,
            appVersionLabel: appVersion.name,
        };
    },
});

function createInstanceProfileRole(aws: typeof import("@pulumi/aws")) {
    const instanceProfileRole = new aws.iam.Role(`kadence-api-eb-ec2-role-${$app.stage}`, {
        name: `kadence-api-eb-ec2-role-${$app.stage}`,
        description: "Role for Kadence API EC2 managed by EB",
        assumeRolePolicy: JSON.stringify({
            Version: "2012-10-17",
            Statement: [
                {
                    Action: "sts:AssumeRole",
                    Principal: {
                        Service: "ec2.amazonaws.com",
                    },
                    Effect: "Allow",
                    Sid: "",
                },
            ],
        }),
    });

    new aws.iam.RolePolicyAttachment(`kadence-api-role-policy-attachment-ec2-ecr-${$app.stage}`, {
        role: instanceProfileRole.name,
        policyArn: "arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryReadOnly",
    });

    new aws.iam.RolePolicyAttachment(`kadence-api-role-policy-attachment-web-${$app.stage}`, {
        role: instanceProfileRole.name,
        policyArn: "arn:aws:iam::aws:policy/AWSElasticBeanstalkWebTier",
    });

    new aws.iam.RolePolicyAttachment(`kadence-api-role-policy-attachment-worker-${$app.stage}`, {
        role: instanceProfileRole.name,
        policyArn: "arn:aws:iam::aws:policy/AWSElasticBeanstalkWorkerTier",
    });

    return instanceProfileRole;
}

function createInstanceProfile(
    aws: typeof import("@pulumi/aws"),
    instanceProfileRole: import("@pulumi/aws/iam").Role
) {
    const instanceProfile = new aws.iam.InstanceProfile(
        `kadence-api-eb-ec2-instance-profile-${$app.stage}`,
        {
            role: instanceProfileRole.name,
        }
    );

    return instanceProfile;
}

function createServiceRole(aws: typeof import("@pulumi/aws")) {
    const serviceRole = new aws.iam.Role(
        `kadence-api-elasticbeanstalk-service-role-${$app.stage}`,
        {
            name: `kadence-api-elasticbeanstalk-service-role-${$app.stage}`,
            description: "Role trusted by Elastic Beanstalk",
            assumeRolePolicy: JSON.stringify({
                Version: "2012-10-17",
                Statement: [
                    {
                        Action: "sts:AssumeRole",
                        Condition: {
                            StringEquals: {
                                "sts:ExternalId": "elasticbeanstalk",
                            },
                        },
                        Principal: {
                            Service: "elasticbeanstalk.amazonaws.com",
                        },
                        Effect: "Allow",
                        Sid: "",
                    },
                ],
            }),
        }
    );

    new aws.iam.RolePolicyAttachment(
        `kadence-api-role-policy-attachment-eb-enhanced-health-${$app.stage}`,
        {
            role: serviceRole.name,
            policyArn: "arn:aws:iam::aws:policy/service-role/AWSElasticBeanstalkEnhancedHealth",
        }
    );

    return serviceRole;
}

function createElasticBeanstalkApp(aws: typeof import("@pulumi/aws")) {
    const app = new aws.elasticbeanstalk.Application(`kadence-api-service-${$app.stage}`, {
        name: `kadence-api-service-${$app.stage}`,
        description: "Kadence API",
        tags: {},
    });

    return app;
}

function createECRRepository(aws: typeof import("@pulumi/aws")) {
    const ecrRepo = new aws.ecr.Repository(`kadence-api-repo-${$app.stage}`, {
        name: `kadence-api-${$app.stage}`,
        imageScanningConfiguration: {
            scanOnPush: true,
        },
        imageTagMutability: "MUTABLE",
    });

    return ecrRepo;
}

function createArtifactBuckets(
    aws: typeof import("@pulumi/aws"),
    awsUsEast1: import("@pulumi/aws").Provider
) {
    const artifactBucketUsEast1 = new aws.s3.Bucket(
        `kadence-api-pipeline-us-east-1-${$app.stage}`,
        {
            bucket: `kadence-api-pipeline-us-east-1-${$app.stage}`,
        },
        { provider: awsUsEast1 }
    );

    const artifactBucketApSouth1 = new aws.s3.Bucket(
        `kadence-api-pipeline-ap-south-1-${$app.stage}`,
        {
            bucket: `kadence-api-pipeline-ap-south-1-${$app.stage}`,
        }
    );

    return { artifactBucketUsEast1, artifactBucketApSouth1 };
}

function createCodeBuildRole(
    aws: typeof import("@pulumi/aws"),
    artifactBucketUsEast1: import("@pulumi/aws/s3").Bucket,
    artifactBucketApSouth1: import("@pulumi/aws/s3").Bucket,
    ecrRepo: import("@pulumi/aws/ecr").Repository,
    awsAccountId: string,
    usEast1Region: string
) {
    const pulumi = require("@pulumi/pulumi");

    const codeBuildRole = new aws.iam.Role(`kadence-api-codebuild-role-${$app.stage}`, {
        name: `kadence-api-codebuild-role-${$app.stage}`,
        assumeRolePolicy: JSON.stringify({
            Version: "2012-10-17",
            Statement: [
                {
                    Effect: "Allow",
                    Principal: {
                        Service: "codebuild.amazonaws.com",
                    },
                    Action: "sts:AssumeRole",
                },
            ],
        }),
    });

    new aws.iam.RolePolicy(`kadence-api-codebuild-policy-${$app.stage}`, {
        role: codeBuildRole.id,
        policy: pulumi.interpolate`{
            "Version": "2012-10-17",
            "Statement": [
                {
                    "Effect": "Allow",
                    "Action": [
                        "logs:CreateLogGroup",
                        "logs:CreateLogStream",
                        "logs:PutLogEvents"
                    ],
                    "Resource": "arn:aws:logs:${usEast1Region}:${awsAccountId}:log-group:/aws/codebuild/kadence-api-${$app.stage}-build:*"
                },
                {
                    "Effect": "Allow",
                    "Action": [
                        "s3:GetObject",
                        "s3:PutObject"
                    ],
                    "Resource": [
                        "${artifactBucketUsEast1.arn}/*",
                        "${artifactBucketApSouth1.arn}/*"
                    ]
                },
                {
                    "Effect": "Allow",
                    "Action": [
                        "ecr:GetAuthorizationToken"
                    ],
                    "Resource": "*"
                },
                {
                    "Effect": "Allow",
                    "Action": [
                        "ecr:BatchCheckLayerAvailability",
                        "ecr:GetDownloadUrlForLayer",
                        "ecr:BatchGetImage",
                        "ecr:PutImage",
                        "ecr:InitiateLayerUpload",
                        "ecr:UploadLayerPart",
                        "ecr:CompleteLayerUpload"
                    ],
                    "Resource": "${ecrRepo.arn}"
                }
            ]
        }`,
    });

    return codeBuildRole;
}

function createCodeBuildProject(
    aws: typeof import("@pulumi/aws"),
    awsUsEast1: import("@pulumi/aws").Provider,
    codeBuildRole: import("@pulumi/aws/iam").Role,
    region: string,
    awsAccountId: string,
    branch: string
) {
    const pulumi = require("@pulumi/pulumi");

    const codeBuildProject = new aws.codebuild.Project(
        `kadence-api-build-${$app.stage}`,
        {
            name: `kadence-api-${$app.stage}-build`,
            description: `CodeBuild project for ${branch} branch`,
            serviceRole: codeBuildRole.arn,
            artifacts: {
                type: "CODEPIPELINE",
            },
            environment: {
                computeType: "BUILD_GENERAL1_MEDIUM",
                image: "aws/codebuild/amazonlinux-x86_64-standard:5.0",
                type: "LINUX_CONTAINER",
                privilegedMode: true,
                environmentVariables: [
                    {
                        name: "AWS_DEFAULT_REGION",
                        value: region,
                    },
                    {
                        name: "AWS_ACCOUNT_ID",
                        value: awsAccountId,
                    },
                    {
                        name: "IMAGE_REPO_NAME",
                        value: pulumi.interpolate`kadence-api-${$app.stage}`,
                    },
                    {
                        name: "IMAGE_TAG",
                        value: "latest",
                    },
                ],
            },
            source: {
                type: "CODEPIPELINE",
                buildspec: "buildspec.yml",
            },
        },
        { provider: awsUsEast1 }
    );

    return codeBuildProject;
}

function createCodePipelineRole(
    aws: typeof import("@pulumi/aws"),
    artifactBucketUsEast1: import("@pulumi/aws/s3").Bucket,
    artifactBucketApSouth1: import("@pulumi/aws/s3").Bucket,
    codeBuildProject: import("@pulumi/aws/codebuild").Project,
    connectionArn: string
) {
    const pulumi = require("@pulumi/pulumi");

    const codePipelineRole = new aws.iam.Role(`kadence-api-codepipeline-role-${$app.stage}`, {
        name: `kadence-api-codepipeline-role-${$app.stage}`,
        assumeRolePolicy: JSON.stringify({
            Version: "2012-10-17",
            Statement: [
                {
                    Effect: "Allow",
                    Principal: {
                        Service: "codepipeline.amazonaws.com",
                    },
                    Action: "sts:AssumeRole",
                },
            ],
        }),
    });

    new aws.iam.RolePolicy(`kadence-api-codepipeline-policy-${$app.stage}`, {
        role: codePipelineRole.id,
        policy: pulumi.interpolate`{
            "Version": "2012-10-17",
            "Statement": [
                {
                    "Effect": "Allow",
                    "Action": [
                        "s3:GetObject",
                        "s3:GetObjectVersion",
                        "s3:PutObject"
                    ],
                    "Resource": [
                        "${artifactBucketUsEast1.arn}/*",
                        "${artifactBucketApSouth1.arn}/*"
                    ]
                },
                {
                    "Effect": "Allow",
                    "Action": [
                        "s3:GetBucketLocation",
                        "s3:ListBucket"
                    ],
                    "Resource": [
                        "${artifactBucketUsEast1.arn}",
                        "${artifactBucketApSouth1.arn}"
                    ]
                },
                {
                    "Effect": "Allow",
                    "Action": [
                        "codebuild:BatchGetBuilds",
                        "codebuild:StartBuild"
                    ],
                    "Resource": "${codeBuildProject.arn}"
                },
                {
                    "Effect": "Allow",
                    "Action": [
                        "codestar-connections:UseConnection",
                        "codestar-connections:GetConnection",
                        "codeconnections:UseConnection",
                        "codeconnections:GetConnection"
                    ],
                    "Resource": "${connectionArn}"
                }
            ]
        }`,
    });

    return codePipelineRole;
}

function createPipeline(
    aws: typeof import("@pulumi/aws"),
    awsUsEast1: import("@pulumi/aws").Provider,
    codePipelineRole: import("@pulumi/aws/iam").Role,
    artifactBucketUsEast1: import("@pulumi/aws/s3").Bucket,
    artifactBucketApSouth1: import("@pulumi/aws/s3").Bucket,
    codeBuildProject: import("@pulumi/aws/codebuild").Project,
    connectionArn: string,
    branch: string,
    usEast1Region: string,
    region: string
) {
    const pipeline = new aws.codepipeline.Pipeline(
        `kadence-api-pipeline-${$app.stage}`,
        {
            name: `kadence-api-${$app.stage}-pipeline`,
            roleArn: codePipelineRole.arn,
            artifactStores: [
                {
                    location: artifactBucketUsEast1.bucket,
                    type: "S3",
                    region: usEast1Region,
                },
                {
                    location: artifactBucketApSouth1.bucket,
                    type: "S3",
                    region: region,
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
                                FullRepositoryId: "homeofpmg/kadence-api",
                                BranchName: branch,
                                OutputArtifactFormat: "CODE_ZIP",
                            },
                            region: usEast1Region,
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
                            region: usEast1Region,
                        },
                    ],
                },
            ],
        },
        { provider: awsUsEast1 }
    );

    return pipeline;
}

function createElasticBeanstalkEnvironment(
    aws: typeof import("@pulumi/aws"),
    pulumi: typeof import("@pulumi/pulumi"),
    app: import("@pulumi/aws/elasticbeanstalk").Application,
    serviceRole: import("@pulumi/aws/iam").Role,
    instanceProfile: import("@pulumi/aws/iam").InstanceProfile,
    ecrRepo: import("@pulumi/aws/ecr").Repository,
    appVersion: import("@pulumi/aws/elasticbeanstalk").ApplicationVersion
) {
    const env = new aws.elasticbeanstalk.Environment(
        `kadence-api-${$app.stage}`,
        {
            name: `kadence-api-${$app.stage}`,
            application: app.name,
            solutionStackName: "64bit Amazon Linux 2023 v4.9.1 running Docker",
            settings: [
                {
                    name: "ServiceRole",
                    namespace: "aws:elasticbeanstalk:environment",
                    value: serviceRole.name,
                },
                {
                    name: "IamInstanceProfile",
                    namespace: "aws:autoscaling:launchconfiguration",
                    value: instanceProfile.name,
                },
                {
                    name: "InstanceType",
                    namespace: "aws:autoscaling:launchconfiguration",
                    value: "t2.micro",
                },
                {
                    name: "SystemType",
                    namespace: "aws:elasticbeanstalk:healthreporting:system",
                    value: "enhanced",
                },
                {
                    name: "Image",
                    namespace: "aws:elasticbeanstalk:application:environment",
                    value: pulumi.interpolate`${ecrRepo.repositoryUrl}:latest`,
                },
                {
                    name: "NODE_ENV",
                    namespace: "aws:elasticbeanstalk:application:environment",
                    value: "production",
                },
                {
                    name: "DATABASE_URL",
                    namespace: "aws:elasticbeanstalk:application:environment",
                    value: "",
                },
                {
                    name: "CLIENT_URL",
                    namespace: "aws:elasticbeanstalk:application:environment",
                    value: "",
                },
                {
                    name: "SERVER_URL",
                    namespace: "aws:elasticbeanstalk:application:environment",
                    value: "",
                },
                {
                    name: "PORT",
                    namespace: "aws:elasticbeanstalk:application:environment",
                    value: "9000",
                },
                {
                    name: "SALT_ROUNDS",
                    namespace: "aws:elasticbeanstalk:application:environment",
                    value: "",
                },
                {
                    name: "JWT_ACCESS_SECRET",
                    namespace: "aws:elasticbeanstalk:application:environment",
                    value: "",
                },
                {
                    name: "JWT_REFRESH_SECRET",
                    namespace: "aws:elasticbeanstalk:application:environment",
                    value: "",
                },
                {
                    name: "JWT_ACCESS_EXPIRES_IN",
                    namespace: "aws:elasticbeanstalk:application:environment",
                    value: "",
                },
                {
                    name: "JWT_REFRESH_EXPIRES_IN",
                    namespace: "aws:elasticbeanstalk:application:environment",
                    value: "",
                },
                {
                    name: "SMTP_HOST",
                    namespace: "aws:elasticbeanstalk:application:environment",
                    value: "",
                },
                {
                    name: "SMTP_PORT",
                    namespace: "aws:elasticbeanstalk:application:environment",
                    value: "",
                },
                {
                    name: "SMTP_USER",
                    namespace: "aws:elasticbeanstalk:application:environment",
                    value: "",
                },
                {
                    name: "SMTP_PASS",
                    namespace: "aws:elasticbeanstalk:application:environment",
                    value: "",
                },
                {
                    name: "EMAIL_FROM",
                    namespace: "aws:elasticbeanstalk:application:environment",
                    value: "",
                },
                {
                    name: "APP_NAME",
                    namespace: "aws:elasticbeanstalk:application:environment",
                    value: "kadence-api",
                },
                {
                    name: "AWS_REGION",
                    namespace: "aws:elasticbeanstalk:application:environment",
                    value: "ap-south-1",
                },
                {
                    name: "AWS_BUCKET_NAME",
                    namespace: "aws:elasticbeanstalk:application:environment",
                    value: "",
                },
                {
                    name: "AWS_ACCESS_KEY_ID",
                    namespace: "aws:elasticbeanstalk:application:environment",
                    value: "",
                },
                {
                    name: "AWS_SECRET_ACCESS_KEY",
                    namespace: "aws:elasticbeanstalk:application:environment",
                    value: "",
                },
                {
                    name: "SYSTEM_USER_EMAIL",
                    namespace: "aws:elasticbeanstalk:application:environment",
                    value: "",
                },
                {
                    name: "SYSTEM_USER_PASSWORD",
                    namespace: "aws:elasticbeanstalk:application:environment",
                    value: "",
                },
            ],
        },
        { dependsOn: [appVersion] }
    );

    return env;
}
