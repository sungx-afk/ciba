#!/usr/bin/env node
/**
 * CI 辅助脚本：把 xcodebuild 日志里的关键错误转成 GitHub Annotations。
 *
 * 失败时 Actions 页面顶部会直接显示真正的编译错误，不用在几十万行日志里翻。
 * 用法: node tools/surface-xcode-errors.js <xcodebuild.log>
 */
const fs = require('fs');

const file = process.argv[2];
if (!file || !fs.existsSync(file)) {
  console.log('未找到构建日志:', file || '(未指定)');
  process.exit(0);
}

const lines = fs.readFileSync(file, 'utf8').split('\n').map((l) => l.trim());

const patterns =
  /(error:|fatal error:|error\(|ld:|ARCHIVE FAILED|BUILD FAILED|The following build commands failed|Compiling for iOS|Swift Compiler Error|Undefined symbol|Cycle in dependencies|Multiple commands produce)/i;

const errors = [...new Set(lines.filter((l) => patterns.test(l)))].slice(0, 15);
const tail = lines.slice(-12).filter(Boolean);

const clean = (s) => s.replace(/\r/g, ' ').replace(/\n/g, ' ').slice(0, 3000);
const emit = (title, msg) => {
  if (!msg) return;
  console.log(`::error title=${title}::${clean(msg)}`);
};

emit('xcodebuild-errors', errors.join(' ⏎ '));
emit('log-tail', tail.join(' ⏎ '));
