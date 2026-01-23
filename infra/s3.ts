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
