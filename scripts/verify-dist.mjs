import { readFile, stat } from 'node:fs/promises'
import assert from 'node:assert/strict'

const root = new URL('../apps/web/dist/', import.meta.url)
const html = await readFile(new URL('index.html', root), 'utf8')
assert.match(html, /动画制作委员会/)
for (const file of ['wasm/game-core.mjs', 'wasm/game-core.wasm', 'wasm/game-core-v4.mjs', 'wasm/game-core-v4.wasm']) {
  const info = await stat(new URL(file, root))
  assert.ok(info.size > 0 && info.size < 50 * 1024 * 1024, `${file} 应存在且低于 Sites 单文件限制`)
  console.log(`${file}: ${info.size} bytes`)
}
const binary = await readFile(new URL('wasm/game-core.wasm', root))
assert.equal(WebAssembly.validate(binary), true)
console.log('静态产物与 WASM 二进制验证通过。')
