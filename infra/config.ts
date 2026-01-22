export const config = {
    appName: "kadence-api",

    regions: {
        primary: "ap-south-1",
        secondary: "us-east-1",
    },

    elasticBeanstalk: {
        instanceType: "t2.micro",
        solutionStackPattern: "^64bit Amazon Linux 2023.*running Docker$",
        containerPort: 9000,
        hostPort: 80,
    },

    codeBuild: {
        computeType: "BUILD_GENERAL1_MEDIUM",
        image: "aws/codebuild/amazonlinux-x86_64-standard:5.0",
        buildspec: "buildspec.yml",
    },

    repository: {
        fullId: "homeofpmg/kadence-api",
    },

    stages: {
        staging: {
            branch: "staging",
        },
        production: {
            branch: "main",
        },
    },
} as const;

export type StageName = keyof typeof config.stages;

export function getBranchForStage(stage: string): string {
    if (stage in config.stages) {
        return config.stages[stage as StageName].branch;
    }
    throw new Error(
        `Unknown stage: ${stage}. Valid stages: ${Object.keys(config.stages).join(", ")}`
    );
}

export function resourceName(baseName: string, stage: string): string {
    return `${config.appName}-${baseName}-${stage}`;
}
