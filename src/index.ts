import { program } from "commander";
import { glob } from "glob";
import { promises as fs } from "fs";
import path from "path";
import { execSync } from "child_process";

interface BitwardenItem {
  id: string;
  name: string;
  notes: string;
  organizationId: string;
  type: number;
}

interface ProgramOptions {
  organization: string;
  pattern: string;
  server?: string;
}

const getBwSession = async (): Promise<string> => {
  try {
    execSync("bw login --check", { stdio: "inherit" });
  } catch (error) {
    console.log("Please log in to Bitwarden:");
    execSync("bw login", { stdio: "inherit" });
  }

  const session = execSync("bw unlock --raw", {
    stdio: ["inherit", "pipe", "inherit"],
  });

  const sessionString = session.toString().trim();

  if (!sessionString) {
    throw new Error("Empty Bitwarden session");
  }

  process.env.BW_SESSION = sessionString;

  return sessionString;
};

const syncEnvFile = async (
  filePath: string,
  sessionKey: string,
  organizationId: string
): Promise<void> => {
  const fileContent = await fs.readFile(filePath, "utf-8");
  const itemName = `env-sync:${path.relative(process.cwd(), filePath)}`;

  try {
    const response = execSync(`bw list items --search "${itemName}"`, {
      stdio: ["pipe", "pipe", "pipe"],
      env: process.env,
    });

    let existingItems: BitwardenItem[] = [];
    try {
      existingItems = JSON.parse(response.toString()) as BitwardenItem[];
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
      execSync(`bw edit item ${itemId} "${encodedData}"`, {
        stdio: "inherit",
        env: process.env,
      });
      console.log(`Updated ${filePath} in Bitwarden`);
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
      execSync(`bw create item "${base64Data}"`, {
        stdio: "inherit",
        env: process.env,
      });
      console.log(`Created ${filePath} in Bitwarden`);
    }
  } catch (error) {
    if (error instanceof Error) {
      console.error(`Failed to sync ${filePath}:`, error.message);
      if (error.stack) {
        console.error("Stack trace:", error.stack);
      }
    } else {
      console.error(`Failed to sync ${filePath}:`, error);
    }
    throw error;
  }
};

const main = async (): Promise<void> => {
  program
    .name("bw-env-sync")
    .description("Sync environment files with Bitwarden")
    .requiredOption("-o, --organization <id>", "Bitwarden organization ID")
    .option(
      "-p, --pattern <pattern>",
      "Glob pattern for env files",
      "**/.env*(!(.example))"
    )
    .parse(process.argv);

  const { organization, pattern } = program.opts<ProgramOptions>();

  try {
    const sessionKey = await getBwSession();

    const files = await glob(pattern, {
      ignore: ["**/node_modules/**"],
      dot: true,
    });

    if (files.length === 0) {
      console.log("No environment files found");
      return;
    }

    console.log("Found environment files:", files);
    await Promise.all(
      files.map((file) => syncEnvFile(file, sessionKey, organization))
    );

    console.log("Sync completed successfully");
  } catch (error) {
    if (error instanceof Error) {
      console.error("Error:", error.message);
    } else {
      console.error("Error:", error);
    }
    process.exit(1);
  }
};

main();
