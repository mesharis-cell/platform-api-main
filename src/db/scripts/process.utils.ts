import { spawn } from "node:child_process";

export async function runCommand(command: string, args: string[]): Promise<void> {
    await new Promise<void>((resolve, reject) => {
        const child = spawn(command, args, { stdio: "inherit" });

        child.on("error", reject);
        child.on("close", (code) => {
            if (code === 0) return resolve();
            reject(
                new Error(`Command failed (${code ?? "unknown"}): ${command} ${args.join(" ")}`)
            );
        });
    });
}
