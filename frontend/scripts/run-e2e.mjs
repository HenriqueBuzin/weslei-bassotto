import { spawnSync } from "node:child_process";

const platformCommand = process.env.E2E_PLATFORM_COMMAND?.trim();

if (platformCommand) {
  const platformResult = spawnSync(platformCommand, {
    shell: true,
    stdio: "inherit",
    env: process.env,
  });
  if (platformResult.status === 0) process.exit(0);
  console.warn("Plataforma E2E falhou; executando o adapter Playwright.");
} else {
  console.info("Plataforma E2E nao definida; executando o adapter Playwright.");
}

const playwrightResult = spawnSync("npx", ["playwright", "test"], {
  shell: process.platform === "win32",
  stdio: "inherit",
  env: process.env,
});

process.exit(playwrightResult.status ?? 1);
