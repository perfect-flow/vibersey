// Prints the AI designer's system prompt and tool for a fresh jersey, so the
// prompt can be tried by hand. Run: npx tsx --conditions=react-server scripts/prompt-check.ts hockey
import { defaultSpec } from "../src/lib/design-spec";
import { promptFor } from "../src/lib/designer";
import type { Sport } from "../src/lib/catalog";

const { system, tool } = promptFor(defaultSpec((process.argv[2] ?? "hockey") as Sport));
console.log(system);
console.log("\n--- TOOL ---\n" + JSON.stringify(tool.parameters));
