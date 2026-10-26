const TABLE_SEPARATOR_CELL = /(?:^|\|)\s*:?-{3,}:?\s*(?=\|)/;
const COMPACT_ROW_BOUNDARY = /\|\s*\|\s*/g;

export function normalizeAiMarkdown(content: string): string {
  let codeFence: '`' | '~' | null = null;

  return content
    .split('\n')
    .map((line) => {
      const fence = line.match(/^\s*(`{3,}|~{3,})/);
      if (fence) {
        const marker = fence[1][0] as '`' | '~';
        if (codeFence === marker) codeFence = null;
        else if (!codeFence) codeFence = marker;
        return line;
      }

      if (!codeFence && TABLE_SEPARATOR_CELL.test(line)) {
        return line.replace(COMPACT_ROW_BOUNDARY, '|\n|');
      }

      return line;
    })
    .join('\n');
}
