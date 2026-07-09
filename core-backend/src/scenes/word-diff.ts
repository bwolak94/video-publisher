/**
 * I03: Word-level diff using a simplified Myers LCS algorithm.
 * Returns hunks so the frontend can highlight what changed.
 */

export type DiffHunkType = "added" | "removed" | "unchanged";

export interface DiffHunk {
  type: DiffHunkType;
  text: string;
}

export interface DiffResult {
  hunks: DiffHunk[];
  changeCount: number;
}

/**
 * Compute a word-level diff between `original` and `current`.
 * Consecutive words of the same type are merged into one hunk.
 */
export function wordDiff(original: string, current: string): DiffResult {
  const a = tokenize(original);
  const b = tokenize(current);

  const lcs = computeLcs(a, b);
  const hunks = buildHunks(a, b, lcs);
  const changeCount = hunks.filter((h) => h.type !== "unchanged").length;

  return { hunks, changeCount };
}

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Split on whitespace, preserving the spaces as tokens so reconstruction is possible. */
function tokenize(text: string): string[] {
  return text.split(/(\s+)/).filter(Boolean);
}

/** Compute LCS (Longest Common Subsequence) table — O(n*m) */
function computeLcs(a: string[], b: string[]): number[][] {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }
  return dp;
}

/** Walk back through LCS table to build diff hunks. */
function buildHunks(a: string[], b: string[], dp: number[][]): DiffHunk[] {
  const raw: DiffHunk[] = [];
  let i = a.length;
  let j = b.length;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
      raw.push({ type: "unchanged", text: a[i - 1] });
      i--; j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      raw.push({ type: "added", text: b[j - 1] });
      j--;
    } else {
      raw.push({ type: "removed", text: a[i - 1] });
      i--;
    }
  }

  raw.reverse();
  return mergeConsecutive(raw);
}

/** Merge consecutive hunks of the same type. */
function mergeConsecutive(hunks: DiffHunk[]): DiffHunk[] {
  if (hunks.length === 0) return [];
  const out: DiffHunk[] = [{ ...hunks[0] }];
  for (let i = 1; i < hunks.length; i++) {
    const last = out[out.length - 1];
    if (last.type === hunks[i].type) {
      last.text += hunks[i].text;
    } else {
      out.push({ ...hunks[i] });
    }
  }
  return out;
}
