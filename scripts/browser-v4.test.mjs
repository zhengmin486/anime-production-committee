import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { createServer } from 'node:http'
import { mkdir, readFile } from 'node:fs/promises'
import { dirname, extname, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const output = resolve(root, 'apps/web/dist')
const screenshots = resolve(root, 'build/browser-tests')
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.wasm': 'application/wasm', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.png': 'image/png' }
let browser
let server
let baseUrl

before(async () => {
  await readFile(resolve(output, 'wasm/v4.wasm'))
  await mkdir(screenshots, { recursive: true })
  server = createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname)
      const file = resolve(output, `.${pathname === '/' ? '/index.html' : pathname}`)
      if (!file.startsWith(`${output}${sep}`)) { response.writeHead(403).end(); return }
      const body = await readFile(file)
      response.writeHead(200, { 'Content-Type': mime[extname(file)] ?? 'application/octet-stream' }).end(body)
    } catch { response.writeHead(404).end('Not found') }
  })
  await new Promise((done) => server.listen(0, '127.0.0.1', done))
  baseUrl = `http://127.0.0.1:${server.address().port}`
  browser = await chromium.launch(process.env.BROWSER_EXECUTABLE
    ? { executablePath: process.env.BROWSER_EXECUTABLE, headless: true }
    : { channel: process.env.BROWSER_CHANNEL ?? 'msedge', headless: true })
})
after(async () => {
  await browser?.close()
  if (server) await new Promise((done) => { server.close(done); server.closeAllConnections() })
})

async function open(page, seed = 3) {
  await page.goto(`${baseUrl}/index.html?view=v4&seed=${seed}`)
  await page.getByRole('button', { name: '开始新经营' }).click()
  try {
    await page.getByTestId('week').waitFor()
  } catch (error) {
    throw new Error(`v4 初始化失败：${await page.locator('body').innerText()}`, { cause: error })
  }
  assert.equal(await page.getByTestId('week').textContent(), '000')
}
async function chooseOffer(page, index = 0) {
  await page.getByRole('button', { name: '企划市场', exact: true }).click()
  await page.getByRole('button', { name: '审阅企划' }).nth(index).click()
}
async function startOffer(page, index = 0, committee = false) {
  await chooseOffer(page, index)
  await page.getByLabel('合作模式').selectOption(committee ? 'committee' : 'contract')
  await page.getByRole('button', { name: '确认立项' }).click()
  try {
    await page.getByRole('heading', { name: '制作与外包' }).waitFor({ timeout: 10000 })
  } catch (error) {
    throw new Error(`立项失败：${await page.locator('.v4-feedback').allTextContents()}`, { cause: error })
  }
}
async function resolveEvents(page) {
  while (await page.locator('.v4-event').count() > 0) {
    await page.locator('.v4-event').first().getByRole('button').first().click()
    await page.waitForFunction(() => !document.querySelector('.v4-feedback .v4-button'))
  }
}
async function advance(page) {
  const week = await page.getByTestId('week').textContent()
  await resolveEvents(page)
  await page.getByTestId('advance-week').click()
  await page.waitForFunction((previous) => document.querySelector('[data-testid="week"]')?.textContent !== previous, week)
  await resolveEvents(page)
}
async function readSave(page) {
  return page.evaluate(() => new Promise((done, fail) => {
    const request = indexedDB.open('anime-production-committee', 1)
    request.onsuccess = () => {
      const database = request.result
      const transaction = database.transaction('saves', 'readonly')
      const entry = transaction.objectStore('saves').get('current')
      transaction.oncomplete = () => { database.close(); done(entry.result) }
      transaction.onerror = () => { database.close(); fail(transaction.error) }
    }
    request.onerror = () => fail(request.error)
  }))
}
async function putSave(page, record) {
  await page.evaluate(async (record) => {
    await new Promise((done, fail) => {
      const request = indexedDB.open('anime-production-committee', 1)
      request.onupgradeneeded = () => request.result.createObjectStore('saves')
      request.onsuccess = () => {
        const database = request.result
        const transaction = database.transaction('saves', 'readwrite')
        transaction.objectStore('saves').put(record, 'current')
        transaction.oncomplete = () => { database.close(); done() }
        transaction.onerror = () => { database.close(); fail(transaction.error) }
      }
      request.onerror = () => fail(request.error)
    })
  }, record)
}
async function save(page) {
  const confirm = page.getByRole('button', { name: '确认覆盖本地存档', exact: true })
  const saved = page.getByText('已保存到此浏览器。', { exact: true })
  await page.getByRole('button', { name: '保存进度', exact: true }).click()
  let outcome
  try {
    outcome = await Promise.race([
      confirm.waitFor().then(() => 'conflict'),
      saved.waitFor().then(() => 'saved'),
      page.locator('.v4-feedback.v4-error').waitFor().then(() => 'error'),
    ])
    if (outcome === 'conflict') {
      await confirm.click()
      await saved.waitFor()
    } else if (outcome === 'error') throw new Error('保存返回错误')
  } catch (error) {
    throw new Error(`保存失败：${await page.locator('body').innerText()}`, { cause: error })
  }
  return readSave(page)
}
async function settleClosing(page) {
  await resolveEvents(page)
  await page.getByRole('button', { name: '结束公司经营' }).click()
  await page.getByRole('button', { name: '确认结束经营' }).click()
  await page.getByTestId('company-status').filter({ hasText: '关闭中' }).waitFor()
  while (await page.getByRole('button', { name: '结清交付', exact: true }).count() > 0) {
    await page.getByRole('button', { name: '结清交付', exact: true }).first().click()
  }
  await page.getByRole('button', { name: '生成经营总结' }).click()
  await page.getByTestId('company-status').filter({ hasText: '已结束' }).waitFor()
}

test('v4 浏览器：委员会＋承制双项目、招聘竞争、外包、周结算、存档覆盖与关闭结清', async () => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' })
  try {
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', (error) => errors.push(error.message))
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()) })
    const wasm = page.waitForResponse((response) => response.url().endsWith('/wasm/v4.wasm'))
    await open(page)
    assert.match((await wasm).headers()['content-type'], /application\/wasm/)
    await page.screenshot({ path: resolve(screenshots, 'v4-welcome-desktop.png'), fullPage: true })

    await startOffer(page, 0, true)
    await page.locator('.v4-recruit-list article').filter({ hasText: '监督' }).first().getByRole('button', { name: '签约核心' }).click()
    await startOffer(page, 0)
    assert.equal(await page.getByRole('tab').count(), 2)
    await page.getByLabel('陈原画 所属项目').selectOption('work_02')
    await page.getByRole('combobox', { name: /^工作项/ }).selectOption('work_01.common.character_design')
    await page.getByLabel('供应商').selectOption('supplier_draw')
    await page.getByLabel('工作量').fill('20')
    await page.getByRole('button', { name: '签约并预留产能' }).click()
    await page.locator('.v4-contract-list').getByText('曙光作画协力', { exact: true }).waitFor()
    await advance(page)
    await advance(page)
    assert.equal(await page.getByTestId('week').textContent(), '002')
    const first = await save(page)
    assert.equal(first.version, 4)
    assert.equal(first.state.works.length, 2)
    assert.equal(first.state.contracts.length, 1)
    assert.equal(first.state.committees.length, 1)
    assert.equal(first.state.staff.find((member) => member.id === 'staff_ka').assignment_work_id, 'work_02')
    assert.ok(first.state.contracts[0].work_done > 0)
    await page.screenshot({ path: resolve(screenshots, 'v4-production-desktop.png'), fullPage: true })

    await advance(page)
    await page.getByRole('button', { name: '保存进度', exact: true }).click()
    await page.getByRole('button', { name: '确认覆盖本地存档', exact: true }).waitFor()
    assert.deepEqual(await readSave(page), first)
    await page.getByRole('button', { name: '取消覆盖', exact: true }).click()
    assert.deepEqual(await readSave(page), first)
    await save(page)
    const overwritten = await readSave(page)
    assert.equal(overwritten.state.company.week, 3)
    await page.reload()
    await page.getByRole('button', { name: '读取本地存档' }).click()
    await page.getByText('已读取本地存档。', { exact: true }).waitFor()
    assert.equal(await page.getByTestId('week').textContent(), '003')
    await page.getByRole('button', { name: /^制作与外包/ }).click()
    assert.equal(await page.getByRole('tab').count(), 2)

    await settleClosing(page)
    await page.getByRole('button', { name: '委员会与 Archive', exact: true }).click()
    assert.equal(await page.locator('.v4-archive-card').count(), 2)
    assert.ok(await page.locator('.v4-committee').count() >= 1)
    const final = await save(page)
    assert.equal(final.state.company.status, 'ended')
    assert.equal(final.state.archive.company_result.total_projects, 2)
    assert.ok(final.state.archive.works.some((work) => work.mode === 'committee' && work.channel_breakdown.length > 1))
    assert.ok(final.state.archive.works.some((work) => work.mode === 'contract'))
    assert.equal(final.state.finance.opening_funds + final.state.finance.entries.reduce((sum, entry) => sum + entry.amount, 0), final.state.finance.balance)
    await page.getByRole('button', { name: '公司账本', exact: true }).click()
    await page.getByText('对账通过', { exact: true }).waitFor()
    await page.screenshot({ path: resolve(screenshots, 'v4-final-ledger-desktop.png'), fullPage: true })
    assert.deepEqual(errors, [])
  } finally { await context.close() }
})

test('v4 浏览器：自然市场企划可接手，合法临界存档通过界面正常交付', async () => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  try {
    const page = await context.newPage()
    await open(page, 19)
    let marketOffer = page.locator('.v4-offer').filter({ hasText: '市场企划' }).first()
    for (let week = 0; week < 10 && await marketOffer.count() === 0; week++) await advance(page)
    assert.ok(await marketOffer.count() > 0, '10 周内应出现自然市场企划')
    const name = await marketOffer.getByRole('heading').textContent()
    await marketOffer.getByRole('button', { name: '审阅企划' }).click()
    await page.getByRole('button', { name: '确认立项' }).click()
    await page.getByRole('tab', { name: new RegExp(name) }).waitFor()

    const ready = await page.evaluate(async () => {
      const { default: create } = await import('/wasm/v4.mjs')
      const core = await create()
      let state = JSON.parse(core.initialize_game(JSON.stringify({ seed: 19 }))).state
      state = JSON.parse(core.start_work(JSON.stringify({ state, offer_id: 'offer_01', mode: 'contract' }))).state
      state.company.week = 1
      const work = state.works[0]
      for (const item of [...work.common.items, ...work.episodes.flatMap((episode) => episode.stages.flatMap((stage) => stage.items))]) {
        item.work_done = item.work_total
        item.deliver_at = 1000
      }
      JSON.parse(core.deliver_work(JSON.stringify({ state, work_id: work.id })))
      return { version: 4, savedAt: new Date().toISOString(), rules_version: 'v4', state }
    })
    await putSave(page, ready)
    await page.getByRole('button', { name: '读取存档', exact: true }).click()
    await page.getByRole('button', { name: '确认读取并替换', exact: true }).click()
    await page.getByText('已读取本地存档。', { exact: true }).waitFor()
    await page.getByRole('button', { name: /交付作品/ }).click()
    await page.getByRole('button', { name: '委员会与 Archive', exact: true }).click()
    const archive = page.locator('.v4-archive-card').first()
    try {
      await archive.waitFor({ timeout: 10000 })
    } catch (error) {
      throw new Error(`交付失败：${await page.locator('.v4-feedback').allTextContents()}`, { cause: error })
    }
    assert.match(await archive.textContent(), /completed/)
    assert.ok(Number((await archive.locator('dd').nth(4).textContent()).replace(/[^\d-]/g, '')) > 0)
  } finally { await context.close() }
})

test('v4 浏览器：中止项目必须二次确认并写入 Archive', async () => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  try {
    const page = await context.newPage()
    await open(page, 23)
    await startOffer(page, 0, false)
    await page.getByRole('button', { name: '中止项目', exact: true }).click()
    assert.match(await page.locator('.v4-abort-confirm').textContent(), /违约金/)
    await page.getByRole('button', { name: '确认中止', exact: true }).click()
    await page.getByRole('button', { name: '委员会与 Archive', exact: true }).click()
    const archive = page.locator('.v4-archive-card').first()
    await archive.waitFor()
    assert.match(await archive.textContent(), /aborted/)
  } finally { await context.close() }
})

test('v4 浏览器：375px 工作台无横向溢出且键盘可达', async () => {
  const context = await browser.newContext({ viewport: { width: 375, height: 900 }, reducedMotion: 'reduce' })
  try {
    const page = await context.newPage()
    await open(page, 13)
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
    await page.keyboard.press('Tab')
    assert.ok(await page.evaluate(() => document.activeElement?.tagName === 'BUTTON'))
    await startOffer(page, 0)
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
    await page.screenshot({ path: resolve(screenshots, 'v4-production-375.png'), fullPage: true })
    await page.getByRole('button', { name: '公司账本', exact: true }).click()
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
  } finally { await context.close() }
})
