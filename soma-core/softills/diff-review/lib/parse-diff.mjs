/**
 * parse-diff.mjs — diff-review git diff parser
 *
 * 将 git diff 文本解析为结构化文件/hunk 数组。
 * 纯解析，无 I/O，无外部依赖。
 */

export function parseDiff(diffText) {
  if (!diffText || typeof diffText !== 'string') {
    return { files: [] };
  }

  const files = [];
  const lines = diffText.split('\n');
  let currentFile = null;
  let currentHunk = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // diff --git a/... b/...
    const diffMatch = line.match(/^diff --git a\/(.+?) b\/(.+?)$/);
    if (diffMatch) {
      if (currentFile && currentHunk) {
        currentFile.hunks.push(currentHunk);
        currentHunk = null;
      }
      if (currentFile) {
        files.push(currentFile);
      }
      currentFile = {
        path: diffMatch[2],
        oldPath: diffMatch[1],
        status: 'modified',
        additions: 0,
        deletions: 0,
        hunks: [],
      };
      continue;
    }

    // new file mode
    if (/^new file mode/.test(line) && currentFile) {
      currentFile.status = 'added';
      continue;
    }

    // deleted file mode
    if (/^deleted file mode/.test(line) && currentFile) {
      currentFile.status = 'deleted';
      continue;
    }

    // rename from/to
    if (/^rename from/.test(line) && currentFile) {
      currentFile.status = 'renamed';
      continue;
    }

    // index line
    if (/^index [0-9a-f]+\.\.[0-9a-f]+/.test(line)) {
      continue;
    }

    // --- a/filename
    if (/^--- a\//.test(line)) continue;
    // +++ b/filename
    if (/^\+\+\+ b\//.test(line)) continue;

    // @@ hunk header
    const hunkMatch = line.match(/^@@ -(\d+),?(\d*) \+(\d+),?(\d*) @@(.*)/);
    if (hunkMatch) {
      if (currentFile && currentHunk) {
        currentFile.hunks.push(currentHunk);
      }
      currentHunk = {
        header: line,
        oldStart: parseInt(hunkMatch[1]),
        oldCount: parseInt(hunkMatch[2] || '1'),
        newStart: parseInt(hunkMatch[3]),
        newCount: parseInt(hunkMatch[4] || '1'),
        additions: 0,
        deletions: 0,
        lines: [],
      };
      continue;
    }

    // Content line
    if (currentFile && currentHunk) {
      const entry = { text: line, type: 'context' };
      if (line.startsWith('+')) {
        entry.type = 'addition';
        currentHunk.additions++;
        currentFile.additions++;
      } else if (line.startsWith('-')) {
        entry.type = 'deletion';
        currentHunk.deletions++;
        currentFile.deletions++;
      }
      currentHunk.lines.push(entry);
    }
  }

  // Flush last hunk & file
  if (currentFile && currentHunk) {
    currentFile.hunks.push(currentHunk);
  }
  if (currentFile) {
    files.push(currentFile);
  }

  return { files };
}

export default { parseDiff };
