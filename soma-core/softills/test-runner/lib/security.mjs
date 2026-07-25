/**
 * security.mjs — test-runner command whitelist & danger check
 *
 * 白名单 + 危险命令检测，不执行任何命令。
 */

const DANGEROUS_PATTERNS = [
  /(^|\||;|&&)\s*(rm|del|rd|rmdir|format|dd)\s/,        // 删除/格式化
  /(^|\||;|&&)\s*(sudo|doas|pkexec)\s/,                   // 提权
  /(^|\||;|&&)\s*(:(){ :\|:& };:)/,                       // fork bomb
  /(^|\||;|&&)\s*(>\/dev\/|>\/null|\/dev\/null)/,          // 仅测试用
  /(^|\||;|&&)\s*curl\s+.*\|(\s*bash|\s*sh)/,             // 管道执行远程脚本
  /(^|\||;|&&)\s*wget\s+.*-O-\s*\|/,                      // wget 管道执行
  /(^|\||;|&&)\s*mv\s+\/\s*/,                              // 移动根目录
  /(^|\||;|&&)\s*chmod\s+777\s+\//,                       // 改根目录权限
  /(^|\||;|&&)\s*chown\s/,                                 // 改所有者
  /(^|\||;|&&)\s*write\s+/,                                // 写磁盘
  /(^|\||;|&&)\s*passwd\s/,                                // 改密码
  /(?:^|\||;|&&)\s*dd\s+if=.(?:dev|[a-z]:)/i,             // dd 读磁盘
  /(^|\||;|&&)\s*reboot|shutdown|poweroff|halt\s/,         // 关机
  /\${.*}/,                                                 // 变量注入
  /`.*`/,                                                   // 反引号注入
  /\|\|/,                                                   // 或逻辑
];

export function isDangerous(command) {
  for (const p of DANGEROUS_PATTERNS) {
    if (p.test(command)) return true;
  }
  return false;
}

export function isAllowed(command, allowedCommands) {
  if (!allowedCommands || allowedCommands.length === 0) return false;
  const cmd = command.trim();
  for (const a of allowedCommands) {
    // 支持通配符匹配：`npm test` 精确匹配，`npm *` 前缀匹配
    if (a.endsWith('*')) {
      if (cmd.startsWith(a.slice(0, -1))) return true;
    } else if (a === cmd) {
      return true;
    } else if (cmd.startsWith(a + ' ') || cmd === a) {
      return true;
    }
  }
  return false;
}
