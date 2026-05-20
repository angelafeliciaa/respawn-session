export type RunCommand = (cmd: string, args: string[]) => Promise<string>;

export const runCommand: RunCommand = async (cmd, args) => {
  const proc = Bun.spawn([cmd, ...args], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);

  if (exitCode !== 0) {
    throw new Error(
      `${cmd} ${args.join(" ")} failed with exit ${exitCode}: ${stderr.trim()}`,
    );
  }

  return stdout;
};
