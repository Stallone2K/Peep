import TurndownService from "turndown";
import { gfm } from "turndown-plugin-gfm";

// Singleton Turndown service. Turndown is stateful between runs for
// rule registration, but the actual parse/convert is pure per-call.
let _instance: TurndownService | null = null;

export function getTurndown(): TurndownService {
  if (_instance) return _instance;

  const td = new TurndownService({
    headingStyle: "atx",
    codeBlockStyle: "fenced",
    bulletListMarker: "-",
    hr: "---",
    emDelimiter: "_",
    strongDelimiter: "**",
    linkStyle: "inlined",
  });

  td.use(gfm);

  // Honour <pre><code class="language-X"> fences for syntax hints.
  td.addRule("fencedLanguageCode", {
    filter: (node) =>
      node.nodeName === "PRE" &&
      !!node.firstChild &&
      node.firstChild.nodeName === "CODE",
    replacement(_content, node) {
      const code = (node as HTMLElement).querySelector("code");
      const lang =
        code
          ?.getAttribute("class")
          ?.match(/language-([^\s]+)/)
          ?.[1] ?? "";
      const text = code?.textContent ?? "";
      return `\n\n\`\`\`${lang}\n${text}\n\`\`\`\n\n`;
    },
  });

  // Drop any residual script/style/head — defensive belt-and-braces.
  td.remove(["script", "style", "head", "title", "meta"]);

  _instance = td;
  return _instance;
}

export function htmlToMarkdown(html: string): string {
  return getTurndown()
    .turndown(html)
    .replace(/\n{3,}/g, "\n\n") // collapse triple newlines
    .trim();
}
