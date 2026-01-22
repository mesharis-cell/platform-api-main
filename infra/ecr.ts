import { config, resourceName } from "./config";

export function createECRRepository(aws: typeof import("@pulumi/aws"), stage: string) {
    const ecrRepo = new aws.ecr.Repository(resourceName("repo", stage), {
        name: `${config.appName}-${stage}`,
        imageScanningConfiguration: {
            scanOnPush: true,
        },
        imageTagMutability: "MUTABLE",
    });

    new aws.ecr.LifecyclePolicy(resourceName("ecr-lifecycle", stage), {
        repository: ecrRepo.name,
        policy: JSON.stringify({
            rules: [
                {
                    rulePriority: 1,
                    description: "Keep last 10 tagged images",
                    selection: {
                        tagStatus: "tagged",
                        tagPrefixList: ["v", "latest"],
                        countType: "imageCountMoreThan",
                        countNumber: 10,
                    },
                    action: {
                        type: "expire",
                    },
                },
                {
                    rulePriority: 2,
                    description: "Remove untagged images older than 7 days",
                    selection: {
                        tagStatus: "untagged",
                        countType: "sinceImagePushed",
                        countUnit: "days",
                        countNumber: 7,
                    },
                    action: {
                        type: "expire",
                    },
                },
            ],
        }),
    });

    return ecrRepo;
}
