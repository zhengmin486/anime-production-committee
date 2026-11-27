// 读取 content/events/*.json，返回卡片与定位到文件的校验问题。
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { validateCard } from './event-schema.mjs'

export function loadEventCards(root = 'content/events') {
  const cards = []
  const issues = []
  let files = []
  try {
    files = readdirSync(root).filter((name) => name.endsWith('.json')).sort()
  } catch {
    return { cards, issues: [{ source: root, card_id: '', field: 'cards', message: '内容目录不存在或不可读' }] }
  }
  if (files.length === 0) {
    return { cards, issues: [{ source: root, card_id: '', field: 'cards', message: '内容目录为空' }] }
  }
  for (const file of files) {
    const source = `${root}/${file}`
    let card
    try {
      card = JSON.parse(readFileSync(join(root, file), 'utf8'))
    } catch (error) {
      issues.push({ source, card_id: '', field: '', message: `不是合法 JSON：${error.message}` })
      continue
    }
    const expectedId = file.replace(/\.json$/, '')
    if (card?.id !== expectedId) {
      issues.push({ source, card_id: card?.id ?? '', field: 'id', message: `文件名应与 id 一致（期望 ${expectedId}）` })
    }
    const cardIssues = validateCard(card, source)
    issues.push(...cardIssues)
    if (cardIssues.length === 0) cards.push(card)
  }
  const ids = new Set()
  for (const card of cards) {
    if (ids.has(card.id)) issues.push({ source: root, card_id: card.id, field: 'id', message: '重复的事件 id' })
    ids.add(card.id)
  }
  return { cards, issues }
}
