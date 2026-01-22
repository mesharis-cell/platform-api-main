import { config, resourceName } from "./config";

export function createInstanceProfileRole(aws: typeof import("@pulumi/aws"), stage: string) {
    const instanceProfileRole = new aws.iam.Role(resourceName("eb-ec2-role", stage), {
        name: resourceName("eb-ec2-role", stage),
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

    new aws.iam.RolePolicyAttachment(resourceName("role-policy-attachment-ec2-ecr", stage), {
        role: instanceProfileRole.name,
        policyArn: "arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryReadOnly",
    });

    new aws.iam.RolePolicyAttachment(resourceName("role-policy-attachment-web", stage), {
        role: instanceProfileRole.name,
        policyArn: "arn:aws:iam::aws:policy/AWSElasticBeanstalkWebTier",
    });

    new aws.iam.RolePolicyAttachment(resourceName("role-policy-attachment-worker", stage), {
        role: instanceProfileRole.name,
        policyArn: "arn:aws:iam::aws:policy/AWSElasticBeanstalkWorkerTier",
    });

    return instanceProfileRole;
}

export function createInstanceProfile(
    aws: typeof import("@pulumi/aws"),
    instanceProfileRole: import("@pulumi/aws/iam").Role,
    stage: string
) {
    const instanceProfile = new aws.iam.InstanceProfile(
        resourceName("eb-ec2-instance-profile", stage),
        {
            role: instanceProfileRole.name,
        }
    );

    return instanceProfile;
}

export function createServiceRole(aws: typeof import("@pulumi/aws"), stage: string) {
    const serviceRole = new aws.iam.Role(resourceName("elasticbeanstalk-service-role", stage), {
        name: resourceName("elasticbeanstalk-service-role", stage),
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
    });

    new aws.iam.RolePolicyAttachment(
        resourceName("role-policy-attachment-eb-enhanced-health", stage),
        {
            role: serviceRole.name,
            policyArn: "arn:aws:iam::aws:policy/service-role/AWSElasticBeanstalkEnhancedHealth",
        }
    );

    return serviceRole;
}

export function createCodeBuildRole(
    aws: typeof import("@pulumi/aws"),
    pulumi: typeof import("@pulumi/pulumi"),
    artifactBucketUsEast1: import("@pulumi/aws/s3").BucketV2,
    artifactBucketApSouth1: import("@pulumi/aws/s3").BucketV2,
    ecrRepo: import("@pulumi/aws/ecr").Repository,
    awsAccountId: string,
    stage: string
) {
    const codeBuildRole = new aws.iam.Role(resourceName("codebuild-role", stage), {
        name: resourceName("codebuild-role", stage),
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

    new aws.iam.RolePolicy(resourceName("codebuild-policy", stage), {
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
                    "Resource": "arn:aws:logs:${config.regions.secondary}:${awsAccountId}:log-group:/aws/codebuild/${config.appName}-${stage}-build:*"
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

export function createCodePipelineRole(
    aws: typeof import("@pulumi/aws"),
    pulumi: typeof import("@pulumi/pulumi"),
    artifactBucketUsEast1: import("@pulumi/aws/s3").BucketV2,
    artifactBucketApSouth1: import("@pulumi/aws/s3").BucketV2,
    codeBuildProject: import("@pulumi/aws/codebuild").Project,
    connectionArn: string,
    stage: string
) {
    const codePipelineRole = new aws.iam.Role(resourceName("codepipeline-role", stage), {
        name: resourceName("codepipeline-role", stage),
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

    new aws.iam.RolePolicy(resourceName("codepipeline-policy", stage), {
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
                },
                {
                    "Effect": "Allow",
                    "Action": [
                        "elasticbeanstalk:CreateApplicationVersion",
                        "elasticbeanstalk:DescribeApplicationVersions",
                        "elasticbeanstalk:DescribeEnvironments",
                        "elasticbeanstalk:DescribeEvents",
                        "elasticbeanstalk:UpdateEnvironment"
                    ],
                    "Resource": "*"
                },
                {
                    "Effect": "Allow",
                    "Action": [
                        "autoscaling:DescribeAutoScalingGroups",
                        "autoscaling:DescribeLaunchConfigurations",
                        "autoscaling:DescribeScalingActivities",
                        "autoscaling:ResumeProcesses",
                        "autoscaling:SuspendProcesses",
                        "ec2:DescribeInstances",
                        "ec2:DescribeInstanceStatus",
                        "cloudformation:GetTemplate",
                        "cloudformation:DescribeStackResource",
                        "cloudformation:DescribeStackResources",
                        "cloudformation:DescribeStackEvents",
                        "cloudformation:DescribeStacks",
                        "cloudformation:UpdateStack"
                    ],
                    "Resource": "*"
                }
            ]
        }`,
    });

    return codePipelineRole;
}
