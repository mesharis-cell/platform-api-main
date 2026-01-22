import { config, resourceName } from "./config";

type SettingValue = string | import("@pulumi/pulumi").Output<string>;

function ebSetting(
    namespace: string,
    name: string,
    value: SettingValue
): {
    namespace: string;
    name: string;
    value: SettingValue;
} {
    return { namespace, name, value };
}

const NS = {
    environment: "aws:elasticbeanstalk:environment",
    launchConfig: "aws:autoscaling:launchconfiguration",
    healthReporting: "aws:elasticbeanstalk:healthreporting:system",
    appEnv: "aws:elasticbeanstalk:application:environment",
} as const;

export function createElasticBeanstalkApp(aws: typeof import("@pulumi/aws"), stage: string) {
    const app = new aws.elasticbeanstalk.Application(resourceName("service", stage), {
        name: resourceName("service", stage),
        description: "Kadence API",
        tags: {
            Project: config.appName,
            Environment: stage,
            ManagedBy: "sst",
        },
    });

    return app;
}

export async function getLatestSolutionStack(aws: typeof import("@pulumi/aws")): Promise<string> {
    const solutionStack = await aws.elasticbeanstalk.getSolutionStack({
        mostRecent: true,
        nameRegex: config.elasticBeanstalk.solutionStackPattern,
    });
    return solutionStack.name;
}

export function createElasticBeanstalkEnvironment(
    aws: typeof import("@pulumi/aws"),
    pulumi: typeof import("@pulumi/pulumi"),
    app: import("@pulumi/aws/elasticbeanstalk").Application,
    serviceRole: import("@pulumi/aws/iam").Role,
    instanceProfile: import("@pulumi/aws/iam").InstanceProfile,
    ecrRepo: import("@pulumi/aws/ecr").Repository,
    appVersion: import("@pulumi/aws/elasticbeanstalk").ApplicationVersion,
    solutionStackName: string,
    stage: string
) {
    const env = new aws.elasticbeanstalk.Environment(
        resourceName("env", stage),
        {
            name: resourceName("env", stage),
            application: app.name,
            solutionStackName: solutionStackName,
            settings: [
                ebSetting(NS.environment, "ServiceRole", serviceRole.name),
                ebSetting(NS.launchConfig, "IamInstanceProfile", instanceProfile.name),
                ebSetting(NS.launchConfig, "InstanceType", config.elasticBeanstalk.instanceType),
                ebSetting(NS.healthReporting, "SystemType", "enhanced"),
                ebSetting(NS.appEnv, "Image", pulumi.interpolate`${ecrRepo.repositoryUrl}:latest`),
                ebSetting(NS.appEnv, "NODE_ENV", "production"),
                ebSetting(NS.appEnv, "PORT", String(config.elasticBeanstalk.containerPort)),
                ebSetting(NS.appEnv, "APP_NAME", config.appName),
                ebSetting(NS.appEnv, "AWS_REGION", config.regions.primary),
                ebSetting(NS.appEnv, "DATABASE_URL", ""),
                ebSetting(NS.appEnv, "CLIENT_URL", ""),
                ebSetting(NS.appEnv, "SERVER_URL", ""),
                ebSetting(NS.appEnv, "SALT_ROUNDS", ""),
                ebSetting(NS.appEnv, "JWT_ACCESS_SECRET", ""),
                ebSetting(NS.appEnv, "JWT_REFRESH_SECRET", ""),
                ebSetting(NS.appEnv, "JWT_ACCESS_EXPIRES_IN", ""),
                ebSetting(NS.appEnv, "JWT_REFRESH_EXPIRES_IN", ""),
                ebSetting(NS.appEnv, "SMTP_HOST", ""),
                ebSetting(NS.appEnv, "SMTP_PORT", ""),
                ebSetting(NS.appEnv, "SMTP_USER", ""),
                ebSetting(NS.appEnv, "SMTP_PASS", ""),
                ebSetting(NS.appEnv, "EMAIL_FROM", ""),
                ebSetting(NS.appEnv, "AWS_BUCKET_NAME", ""),
                ebSetting(NS.appEnv, "SYSTEM_USER_EMAIL", ""),
                ebSetting(NS.appEnv, "SYSTEM_USER_PASSWORD", ""),
            ],
            tags: {
                Project: config.appName,
                Environment: stage,
                ManagedBy: "sst",
            },
        },
        { dependsOn: [appVersion] }
    );

    return env;
}

export function createAppVersion(
    aws: typeof import("@pulumi/aws"),
    pulumi: typeof import("@pulumi/pulumi"),
    app: import("@pulumi/aws/elasticbeanstalk").Application,
    bucket: { name: import("@pulumi/pulumi").Output<string> },
    ecrRepo: import("@pulumi/aws/ecr").Repository,
    stage: string
) {
    const appVersionBucket = new aws.s3.BucketObjectv2(resourceName("dockerrun", stage), {
        bucket: bucket.name,
        key: `dockerrun-${stage}.json`,
        content: pulumi.interpolate`{
          "AWSEBDockerrunVersion": "1",
          "Image": {
            "Name": "${ecrRepo.repositoryUrl}:latest",
            "Update": "true"
          },
          "Ports": [
            {
              "ContainerPort": ${config.elasticBeanstalk.containerPort},
              "HostPort": ${config.elasticBeanstalk.hostPort}
            }
          ],
          "Logging": "/var/log/nginx"
        }`,
        contentType: "application/json",
    });

    const appVersion = new aws.elasticbeanstalk.ApplicationVersion(
        resourceName("version", stage),
        {
            application: app.name,
            bucket: bucket.name,
            key: appVersionBucket.key,
            name: `v1-${stage}`,
        },
        { dependsOn: [appVersionBucket] }
    );

    return { appVersionBucket, appVersion };
}
