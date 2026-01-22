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

        const {
            config,
            getBranchForStage,
            createInstanceProfileRole,
            createInstanceProfile,
            createServiceRole,
            createCodeBuildRole,
            createCodePipelineRole,
            createECRRepository,
            createArtifactBuckets,
            createCodeBuildProject,
            createPipeline,
            createElasticBeanstalkApp,
            createElasticBeanstalkEnvironment,
            createAppVersion,
            getLatestSolutionStack,
        } = await import("./infra");

        const awsUsEast1 = new aws.Provider("useast1", {
            region: config.regions.secondary,
        });

        const awsAccountId = (await aws.getCallerIdentity()).accountId;
        const stage = $app.stage;
        const branch = getBranchForStage(stage);
        const connectionArn =
            "arn:aws:codeconnections:us-east-1:965847494840:connection/f73b48ae-2ff4-4f67-95a3-c3ed67fb1319";
        const solutionStackName = await getLatestSolutionStack(aws);

        const bucket = new sst.aws.Bucket("kadence");

        const instanceProfileRole = createInstanceProfileRole(aws, stage);
        const instanceProfile = createInstanceProfile(aws, instanceProfileRole, stage);
        const serviceRole = createServiceRole(aws, stage);
        const ecrRepo = createECRRepository(aws, stage);

        const { artifactBucketUsEast1, artifactBucketApSouth1 } = createArtifactBuckets(
            aws,
            awsUsEast1,
            stage
        );

        const codeBuildRole = createCodeBuildRole(
            aws,
            pulumi,
            artifactBucketUsEast1,
            artifactBucketApSouth1,
            ecrRepo,
            awsAccountId,
            stage
        );

        const codeBuildProject = createCodeBuildProject(
            aws,
            pulumi,
            awsUsEast1,
            codeBuildRole,
            awsAccountId,
            stage
        );

        const codePipelineRole = createCodePipelineRole(
            aws,
            pulumi,
            artifactBucketUsEast1,
            artifactBucketApSouth1,
            codeBuildProject,
            connectionArn,
            stage
        );

        const app = createElasticBeanstalkApp(aws, stage);

        const { appVersion } = createAppVersion(aws, pulumi, app, bucket, ecrRepo, stage);

        const env = createElasticBeanstalkEnvironment(
            aws,
            pulumi,
            app,
            serviceRole,
            instanceProfile,
            ecrRepo,
            appVersion,
            solutionStackName,
            stage
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
            stage,
            app.name,
            env.name
        );

        return {
            bucketName: bucket.name,
            ecrRepositoryUrl: ecrRepo.repositoryUrl,
            environmentUrl: env.endpointUrl,
            pipelineName: pipeline.name,
            codeBuildProjectName: codeBuildProject.name,
            appVersionLabel: appVersion.name,
            solutionStack: solutionStackName,
        };
    },
});
