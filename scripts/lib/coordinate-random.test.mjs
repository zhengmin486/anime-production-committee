import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Stream, hashText, draw, drawBelow } from './coordinate-random.mjs'

test('hashText FNV-1a 已知向量与 UTF-8 字节语义', () => {
  assert.equal(hashText(''), 2166136261)
  assert.equal(hashText('a'), 0xe40c292c)
  assert.equal(hashText('foobar'), 0xbf9cf968)
  assert.equal(hashText('动画'), 1061707710)
})

test('draw 固定向量与 kernel.cpp 一致', () => {
  assert.equal(draw(42, 5, Stream.market, hashText('offer_gen'), 3), 1014894141)
  assert.equal(draw(0, 0, 0, 0, 0), 1853398634)
})

test('draw 同坐标恒等、分量敏感、值域合法', () => {
  const purpose = hashText('offer_gen')
  const base = draw(42, 5, Stream.market, purpose, 3)
  assert.equal(base, draw(42, 5, Stream.market, purpose, 3))
  assert.notEqual(base, draw(43, 5, Stream.market, purpose, 3))
  assert.notEqual(base, draw(42, 6, Stream.market, purpose, 3))
  assert.notEqual(base, draw(42, 5, Stream.staff, purpose, 3))
  assert.notEqual(base, draw(42, 5, Stream.market, hashText('heat'), 3))
  assert.notEqual(base, draw(42, 5, Stream.market, purpose, 4))
  assert.ok(base >= 0 && base <= 0xffffffff)
})

test('drawBelow 零上界返回零，否则使用同一坐标取模', () => {
  const purpose = hashText('offer_gen')
  assert.equal(drawBelow(42, 5, Stream.market, purpose, 3, 0), 0)
  assert.equal(drawBelow(42, 5, Stream.market, purpose, 3, 10), draw(42, 5, Stream.market, purpose, 3) % 10)
})
