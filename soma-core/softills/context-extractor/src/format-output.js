/**
 * format-output.js
 *
 * 把 extract 结果格式化为 JSON 或 Markdown。
 */

function formatJson(result) {
  return result;
}

function formatMarkdown(result) {
  let md = `# Context Extractor Result\n\n`;
  md += `File: ${result.file}\n`;
  md += `Fingerprint: ${result.fingerprint}\n`;
  md += `Line Count: ${result.lineCount}\n\n`;

  if (result.slices.length > 0) {
    result.slices.forEach((slice, i) => {
      md += `## Slice ${i + 1}: ${slice.anchor}\n\n`;
      md += `Range: L${slice.startLine}-L${slice.endLine}\n\n`;
      md += '```txt\n';
      md += slice.content + '\n';
      md += '```\n\n';
    });
  }

  if (result.missingAnchors.length > 0) {
    md += '## Missing Anchors\n\n';
    result.missingAnchors.forEach(a => { md += `- \`${a}\`\n`; });
    md += '\n';
  } else {
    md += '## Missing Anchors\n\nNone\n\n';
  }

  return md;
}

module.exports = { formatJson, formatMarkdown };
