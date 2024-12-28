import { spawn } from "bun";
import { glob } from "fast-glob";
import {
  intro,
  outro,
  text,
  isCancel,
  cancel,
  spinner,
  password,
  log,
} from "@clack/prompts";
import path from "path";

interface BitwardenItem {
  id: string;
  name: string;
  notes: string;
  organizationId: string;
  type: number;
}

const setBwSessionKey = async ({
  password,
}: {
  password: string;
}): Promise<void> => {
  const unlockProc = spawn(
    ["bw", "unlock", "--raw", "--passwordenv", "BW_PASSWORD", "--raw"],
    {
      stdio: ["inherit", "pipe", "inherit"],
      env: {
        BW_PASSWORD: password,
        ...process.env,
      },
    }
  );

  const output = await new Response(unlockProc.stdout).text();
  const sessionString = output.trim();

  if (!sessionString) {
    throw new Error("Empty Bitwarden session");
  }

  process.env.BW_SESSION = sessionString;
};

const syncEnvFile = async (
  filePath: string,
  organizationId: string
): Promise<void> => {
  const fileContent = await Bun.file(filePath).text();
  const itemName = `env-sync:${path.relative(process.cwd(), filePath)}`;

  try {
    const searchProc = spawn(["bw", "list", "items", "--search", itemName], {
      env: process.env,
    });

    const searchOutput = await new Response(searchProc.stdout).text();
    let existingItems: BitwardenItem[] = [];
    try {
      existingItems = JSON.parse(searchOutput) as BitwardenItem[];
    } catch {}

    if (existingItems.length > 0) {
      const { id: itemId } = existingItems[0];
      const itemData = {
        organizationId,
        name: itemName,
        notes: fileContent,
        secureNote: { type: 0 },
        type: 2, // Secure Note
      };

      const encodedData = Buffer.from(JSON.stringify(itemData)).toString(
        "base64"
      );
      const editProc = spawn(["bw", "edit", "item", itemId, encodedData], {
        stdio: ["inherit", "pipe", "pipe"],
        env: process.env,
      });
      await editProc.exited;
    } else {
      const itemToCreate = {
        organizationId,
        name: itemName,
        notes: fileContent,
        secureNote: { type: 0 },
        type: 2,
      };
      const base64Data = Buffer.from(JSON.stringify(itemToCreate)).toString(
        "base64"
      );
      const createProc = spawn(["bw", "create", "item", base64Data], {
        stdio: ["inherit", "pipe", "pipe"],
        env: process.env,
      });
      await createProc.exited;
    }
  } catch (error) {
    if (error instanceof Error) {
      log.error(`Failed to sync ${filePath}: ${error.message}`);
      if (error.stack) {
        log.error(error.stack);
      }
    } else {
      log.error(`Failed to sync ${filePath}: ${error}`);
    }
    throw error;
  }
};

const tasks = async (
  tasks: {
    title: string;
    task: () => Promise<void>;
  }[]
) => {
  await Promise.all(
    tasks.map(async (task) => {
      log.info(task.title);
      await task.task();
      log.success(task.title);
    })
  );
};

const main = async (): Promise<void> => {
  intro(`Bitwarden Environment File Sync`);

  try {
    const args = process.argv;
    let organizationId: string | undefined;
    if (
      args.find((arg) => arg.includes("--organization") || arg.includes("-o"))
    ) {
      const organization = args.find((arg) => arg.includes("--organization"));
      organizationId =
        organization?.split("=")[1] ?? args[args.indexOf("-o") + 1];
    } else {
      const organization = await text({
        message: "Enter your Bitwarden organization ID",
        validate(value: string) {
          if (!value) return "Organization ID is required";
          return;
        },
      });
      if (isCancel(organization)) {
        cancel("Operation cancelled");
        process.exit(0);
      }
      organizationId = organization;
    }
    log.info(`Organization ID: ${organizationId}`);

    const pattern = await text({
      message: "Enter glob pattern for env files",
      placeholder: "**/.env*(!(.example))",
      initialValue: "**/.env*(!(.example))",
    });

    if (isCancel(pattern)) {
      cancel("Operation cancelled");
      process.exit(0);
    }
    log.info("Getting Bitwarden session...");
    const bwPassword = await password({
      message: "Enter the Bitwarden password",
    });
    if (isCancel(bwPassword)) {
      cancel("Operation cancelled");
      process.exit(0);
    }
    await setBwSessionKey({ password: bwPassword });
    const startTime = performance.now();
    const searchSpinner = spinner();
    searchSpinner.start("Searching for environment files...");
    const files = await glob(pattern as string, {
      ignore: [
        "**/node_modules/**",
        "**/dist/**",
        "**/build/**",
        "**/.git/**",
        "**/coverage/**",
      ],
      dot: true,
      onlyFiles: true,
      absolute: false,
      stats: false,
      followSymbolicLinks: false,
    });
    const endTime = performance.now();
    const duration = (endTime - startTime).toFixed(0);

    if (files.length === 0) {
      searchSpinner.stop(`No environment files found`);
      return;
    }
    searchSpinner.stop(
      `Found ${files.length} environment files in ${duration}ms`
    );

    await tasks(
      files.map((file) => ({
        title: file,
        task: async () => {
          await syncEnvFile(file, organizationId);
        },
      }))
    );

    outro("Sync completed successfully");
  } catch (error) {
    if (error instanceof Error) {
      log.error(error.message);
    } else {
      log.error(error as string);
    }
    process.exit(1);
  }
};

main();
