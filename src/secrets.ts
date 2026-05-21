export type RedactionResult = {
  content: string;
  redactions: number;
};

const directSecretPatterns = [
  /sk-[A-Za-z0-9_-]{20,}/g,
  /ghp_[A-Za-z0-9_]{20,}/g,
  /github_pat_[A-Za-z0-9_]{20,}/g,
  /xox[baprs]-[A-Za-z0-9-]{20,}/g,
  /AKIA[0-9A-Z]{16}/g,
  /AIza[0-9A-Za-z_-]{35}/g,
];

const assignmentPattern =
  /\b([A-Z0-9_]*(?:API[_-]?KEY|TOKEN|SECRET|PASSWORD|AUTH)[A-Z0-9_]*\s*[:=]\s*)(["']?)([^\s"',}]{8,})\2/gi;

const bearerPattern = /\b(Bearer\s+)([A-Za-z0-9._~+/=-]{16,})/gi;

export function redactSecrets(content: string): RedactionResult {
  let redactions = 0;
  let redacted = content;

  redacted = redacted.replace(
    assignmentPattern,
    (_match, prefix: string, quote: string) => {
      redactions += 1;
      return `${prefix}${quote}[REDACTED_SECRET]${quote}`;
    },
  );

  redacted = redacted.replace(bearerPattern, (_match, prefix: string) => {
    redactions += 1;
    return `${prefix}[REDACTED_SECRET]`;
  });

  for (const pattern of directSecretPatterns) {
    redacted = redacted.replace(pattern, () => {
      redactions += 1;
      return "[REDACTED_SECRET]";
    });
  }

  return { content: redacted, redactions };
}
