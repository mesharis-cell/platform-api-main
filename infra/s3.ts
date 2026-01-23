import { resourceName } from "./config";

export function createArtifactBuckets(
    aws: typeof import("@pulumi/aws"),
    awsUsEast1: import("@pulumi/aws").Provider,
    stage: string
) {
    const artifactBucketUsEast1 = new aws.s3.Bucket(
        resourceName("pipeline-us-east-1", stage),
        {
            bucket: resourceName("pipeline-us-east-1", stage),
            versioning: {
                enabled: true,
            },
            serverSideEncryptionConfiguration: {
                rule: {
                    applyServerSideEncryptionByDefault: {
                        sseAlgorithm: "AES256",
                    },
                    bucketKeyEnabled: true,
                },
            },
        },
        { provider: awsUsEast1 }
    );

    new aws.s3.BucketPublicAccessBlock(
        resourceName("pipeline-us-east-1-public-access-block", stage),
        {
            bucket: artifactBucketUsEast1.id,
            blockPublicAcls: true,
            blockPublicPolicy: true,
            ignorePublicAcls: true,
            restrictPublicBuckets: true,
        },
        { provider: awsUsEast1 }
    );

    const artifactBucketApSouth1 = new aws.s3.Bucket(resourceName("pipeline-ap-south-1", stage), {
        bucket: resourceName("pipeline-ap-south-1", stage),
        versioning: {
            enabled: true,
        },
        serverSideEncryptionConfiguration: {
            rule: {
                applyServerSideEncryptionByDefault: {
                    sseAlgorithm: "AES256",
                },
                bucketKeyEnabled: true,
            },
        },
    });

    new aws.s3.BucketPublicAccessBlock(
        resourceName("pipeline-ap-south-1-public-access-block", stage),
        {
            bucket: artifactBucketApSouth1.id,
            blockPublicAcls: true,
            blockPublicPolicy: true,
            ignorePublicAcls: true,
            restrictPublicBuckets: true,
        }
    );

    return { artifactBucketUsEast1, artifactBucketApSouth1 };
}

export function manageElasticBeanstalkBucketPolicy(
    aws: typeof import("@pulumi/aws"),
    pulumi: typeof import("@pulumi/pulumi"),
    region: string,
    awsAccountId: string,
    codePipelineRole: import("@pulumi/aws/iam").Role,
    serviceRole: import("@pulumi/aws/iam").Role,
    ec2Role: import("@pulumi/aws/iam").Role,
    stage: string
) {
    const bucketName = `elasticbeanstalk-${region}-${awsAccountId}`;

    new aws.s3.BucketPolicy(`eb-bucket-policy-${region}`, {
        bucket: bucketName,
        policy: pulumi.interpolate`{
                "Version": "2008-10-17",
                "Statement": [
                    {
                        "Sid": "eb-58950a8c-feb6-11e2-89e0-0800277d041b",
                        "Effect": "Deny",
                        "Principal": {
                            "AWS": "*"
                        },
                        "Action": "s3:DeleteBucket",
                        "Resource": "arn:aws:s3:::${bucketName}"
                    },
                    {
                        "Sid": "eb-af163bf3-d27b-4712-b795-d1e33e331ca4",
                        "Effect": "Allow",
                        "Principal": {
                            "AWS": [
                                "${ec2Role.arn}",
                                "${codePipelineRole.arn}",
                                "${serviceRole.arn}",
                                "arn:aws:iam::${awsAccountId}:role/kadence-api-eb-ec2-role-staging",
                                "arn:aws:iam::${awsAccountId}:role/kadence-api-eb-ec2-role-production",
                                "arn:aws:iam::${awsAccountId}:role/kadence-api-codepipeline-role-staging",
                                "arn:aws:iam::${awsAccountId}:role/kadence-api-codepipeline-role-production",
                                "arn:aws:iam::${awsAccountId}:role/kadence-api-elasticbeanstalk-service-role-staging",
                                "arn:aws:iam::${awsAccountId}:role/kadence-api-elasticbeanstalk-service-role-production"
                            ]
                        },
                        "Action": [
                            "s3:*"
                        ],
                        "Resource": [
                            "arn:aws:s3:::${bucketName}",
                            "arn:aws:s3:::${bucketName}/*"
                        ]
                    }
                ]
            }`,
    });
}
