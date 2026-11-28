import assert from 'node:assert/strict'
import { before, after, test } from 'node:test'
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
  await readFile(resolve(output, 'wasm/game-core.wasm'))
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
async function ready(page) { await page.getByRole('status').filter({ hasText: 'C++ / WASM 已就绪' }).waitFor() }
async function textEquals(locator, value) {
  await locator.filter({ hasText: value }).waitFor()
  assert.equal(await locator.textContent(), value)
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
async function clickSave(page) {
  await page.getByRole('button', { name: '保存进度', exact: true }).click()
  // 单槽首次写入直接成功；已占用时须等确认入口出现，再带 overwrite 重试。
  await page.waitForFunction(() => [...document.querySelectorAll('button')].some((node) => node.textContent.includes('确认覆盖本地存档'))
    || [...document.querySelectorAll('[role="status"]')].some((node) => node.textContent.includes('已保存到此浏览器')))
  const confirm = page.getByRole('button', { name: '确认覆盖本地存档', exact: true })
  if (await confirm.count() > 0) {
    await confirm.click()
    await page.getByText('已保存到此浏览器。', { exact: true }).waitFor()
  }
}
async function savedState(page) {
  await clickSave(page)
  return readSave(page)
}
async function newProject(page, seed = 12345) {
  await page.goto(`${baseUrl}/?seed=${seed}`)
  await ready(page)
  await page.getByRole('button', { name: '开始经营', exact: true }).click()
  await page.getByRole('button', { name: '接手：放学后的第七帧', exact: true }).click()
  await page.getByRole('button', { name: '锁定阶段方案', exact: true }).waitFor()
}
async function lockStage(page) {
  await page.getByRole('button', { name: '锁定阶段方案', exact: true }).click()
  await page.getByRole('button', { name: '推进本周', exact: true }).waitFor()
}
async function advanceUi(page) {
  const previous = await page.getByTestId('week').textContent()
  await page.getByRole('button', { name: '推进本周', exact: true }).click()
  await page.waitForFunction((previous) => document.querySelector('[data-testid="week"]')?.textContent !== previous
    || [...document.querySelectorAll('button')].some((button) => button.textContent.includes('结算项目')), previous)
}
async function finishUi(page) {
  for (let step = 0; step < 100; step++) {
    const settlement = page.getByRole('button', { name: '结算项目', exact: true })
    if (await settlement.isVisible()) {
      await settlement.click()
      await page.getByTestId('project-result').waitFor()
      return
    }
    const configure = page.getByRole('button', { name: '锁定阶段方案', exact: true })
    if (await configure.isVisible()) await lockStage(page)
    else await advanceUi(page)
  }
  assert.fail('100 步内未到达项目结算')
}
async function realCoreFixture(page) {
  return page.evaluate(async () => {
    const { default: create } = await import('/wasm/game-core.mjs')
    const core = await create()
    const initial = JSON.parse(core.initialize_game(JSON.stringify({ seed: 12345 }))).state
    const started = JSON.parse(core.start_project(JSON.stringify({ state: initial, offer_id: 'proj_ova_01', mode: 'contract', investment_percent: 0 }))).state
    const configuration = started.project.stages.script.recommended_configuration
    return JSON.parse(core.apply_decision(JSON.stringify({ state: started, decision: { type: 'configure_stage', stage: 'script', configuration } }))).state
  })
}

test('浏览器真实 WASM 新游戏→阶段配置→周推进→违约结算→返回市场，且同种子完整重放一致', async () => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  try {
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', (error) => errors.push(error.message))
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()) })
    const wasmResponse = page.waitForResponse((response) => response.url().endsWith('/wasm/game-core.wasm'))
    await page.goto(`${baseUrl}/?seed=12345`)
    await ready(page)
    const response = await wasmResponse
    assert.match(response.headers()['content-type'], /application\/wasm/)
    assert.deepEqual([...((await response.body()).subarray(0, 4))], [0, 97, 115, 109])
    await page.screenshot({ path: resolve(screenshots, 'home-desktop.png'), fullPage: true, animations: 'disabled' })
    await page.getByRole('button', { name: '开始经营', exact: true }).click()
    await textEquals(page.getByTestId('funds'), '¥2,000,000')
    await textEquals(page.getByTestId('week'), '0')
    const offers = page.getByRole('region', { name: '企划报价' })
    assert.equal(await offers.getByRole('button').count(), 4)
    await page.getByRole('button', { name: '接手：放学后的第七帧', exact: true }).click()
    await textEquals(page.getByTestId('funds'), '¥6,000,000')
    await textEquals(page.getByTestId('progress-script'), '0%')
    assert.equal(await page.getByRole('combobox', { name: '制作方针', exact: true }).inputValue(), 'balanced')
    await lockStage(page)
    await advanceUi(page)
    await textEquals(page.getByTestId('funds'), '¥5,790,000')
    await textEquals(page.getByTestId('week'), '1')
    await textEquals(page.getByTestId('progress-script'), '33%')
    assert.match(await page.getByTestId('week-report').textContent(), /-210,000/)
    await page.screenshot({ path: resolve(screenshots, 'studio-desktop.png'), fullPage: true, animations: 'disabled' })
    await finishUi(page)
    const receipt = await page.getByTestId('project-result').textContent()
    assert.match(receipt, /截止违约交付/)
    assert.match(receipt, /58/)
    assert.match(receipt, /855,000/)
    assert.match(receipt, /\+260,000/)
    assert.match(receipt, /800,000/)
    await textEquals(page.getByTestId('funds'), '¥2,260,000')
    await page.screenshot({ path: resolve(screenshots, 'settlement-desktop.png'), fullPage: true, animations: 'disabled' })
    const first = await savedState(page)
    assert.equal(first.version, 3)
    assert.equal(first.state.company.week, 14)
    assert.equal(first.state.phase, 'project_settled')
    assert.equal(first.state.seed, 12345)
    assert.equal(first.state.history.length, 1)
    await page.getByRole('button', { name: '回到企划市场', exact: true }).click()
    await page.getByRole('button', { name: '接手：便利屋手记', exact: true }).waitFor()
    assert.equal((await savedState(page)).state.seed, 87628868)
    await newProject(page)
    await finishUi(page)
    assert.equal(await page.getByTestId('project-result').textContent(), receipt)
    assert.deepEqual((await savedState(page)).state, first.state)
    await page.getByRole('button', { name: '回到企划市场', exact: true }).click()
    await page.getByRole('button', { name: '接手：便利屋手记', exact: true }).click()
    const next = await savedState(page)
    assert.equal(next.state.project.start_week, 14)
    assert.equal(next.state.project.deadline_week, 25)
    assert.equal(next.state.company.funds, 5460000)
    assert.deepEqual(errors, [])
  } finally { await context.close() }
})

async function advanceWeeks(page, weeks) {
  for (let step = 0; step < weeks; step++) {
    const configure = page.getByRole('button', { name: '锁定阶段方案', exact: true })
    if (await configure.isVisible()) await lockStage(page)
    await advanceUi(page)
  }
}

test('IndexedDB 保存、刷新恢复、无存档提示与继续经营', async () => {
  const context = await browser.newContext()
  try {
    const page = await context.newPage()
    await page.goto(baseUrl); await ready(page)
    await page.getByRole('button', { name: '读取本地存档' }).click()
    await page.getByText('此浏览器还没有存档。', { exact: true }).waitFor()
    await newProject(page)
    await lockStage(page)
    await advanceUi(page)
    const saved = await savedState(page)
    assert.equal(saved.version, 3)
    await advanceUi(page)
    await page.getByRole('button', { name: '返回首页', exact: true }).click()
    await page.getByRole('button', { name: '继续经营', exact: true }).click()
    await textEquals(page.getByTestId('funds'), '¥5,580,000')
    await page.reload(); await ready(page)
    await page.getByRole('button', { name: '读取本地存档' }).click()
    await textEquals(page.getByTestId('funds'), '¥5,790,000')
    assert.deepEqual((await savedState(page)).state, saved.state)
  } finally { await context.close() }
})

test('读取检查点存档后继续推进，与不中断运行的完整状态逐字段一致', async () => {
  const context = await browser.newContext()
  try {
    const page = await context.newPage()
    await newProject(page)
    await lockStage(page)
    await advanceWeeks(page, 2)
    const checkpoint = await savedState(page)
    assert.equal(checkpoint.version, 3)
    assert.equal(checkpoint.state.company.week, 2)
    assert.equal(checkpoint.state.phase, 'producing')
    await advanceWeeks(page, 2)
    const uninterrupted = await savedState(page)
    assert.equal(uninterrupted.state.company.week, 4)
    assert.equal(uninterrupted.state.phase, 'producing')
    await putSave(page, checkpoint)
    await page.getByRole('button', { name: '读取存档', exact: true }).click()
    await page.getByText('已读取本地存档。', { exact: true }).waitFor()
    await textEquals(page.getByTestId('week'), '2')
    assert.deepEqual((await readSave(page)).state, checkpoint.state)
    await advanceWeeks(page, 2)
    const resumed = await savedState(page)
    assert.equal(resumed.state.company.week, 4)
    assert.equal(resumed.state.seed, checkpoint.state.seed)
    assert.deepEqual(resumed.state, uninterrupted.state)
  } finally { await context.close() }
})

test('单槽覆盖需明确确认，未确认时旧存档原样保留', async () => {
  const context = await browser.newContext()
  try {
    const page = await context.newPage()
    await newProject(page)
    await lockStage(page)
    await advanceUi(page)
    const first = await savedState(page)
    assert.equal(await page.getByRole('button', { name: '确认覆盖本地存档', exact: true }).count(), 0)
    await advanceUi(page)
    await page.getByRole('button', { name: '保存进度', exact: true }).click()
    const confirm = page.getByRole('button', { name: '确认覆盖本地存档', exact: true })
    await confirm.waitFor()
    await page.getByText('此浏览器已有存档，覆盖后旧存档不可恢复。', { exact: true }).waitFor()
    assert.deepEqual(await readSave(page), first)
    await page.getByRole('button', { name: '取消覆盖', exact: true }).click()
    assert.equal(await confirm.count(), 0)
    assert.equal(await page.getByText('已保存到此浏览器。', { exact: true }).count(), 0)
    assert.deepEqual(await readSave(page), first)
    await clickSave(page)
    const second = await readSave(page)
    assert.equal(first.state.company.week, 1)
    assert.equal(second.state.company.week, 2)
    assert.equal(second.version, 3)
  } finally { await context.close() }
})

for (const asset of ['mjs', 'wasm']) {
  test(`${asset} 加载失败禁止新建，恢复资源后重试并真实推进`, async () => {
    const context = await browser.newContext()
    try {
      const page = await context.newPage()
      const pattern = `**/wasm/game-core.${asset}*`
      await page.route(pattern, (route) => route.abort('failed'))
      await page.goto(`${baseUrl}/?seed=12345`)
      await page.getByRole('alert').filter({ hasText: '游戏核心加载失败' }).waitFor()
      assert.equal(await page.getByRole('button', { name: '开始经营', exact: true }).isDisabled(), true)
      await page.unroute(pattern)
      await page.getByRole('button', { name: '重试加载' }).click()
      await ready(page)
      await page.getByRole('button', { name: '开始经营', exact: true }).click()
      await page.getByRole('button', { name: '接手：放学后的第七帧', exact: true }).click()
      await lockStage(page)
      await advanceUi(page)
      await textEquals(page.getByTestId('funds'), '¥5,790,000')
    } finally { await context.close() }
  })
}

test('周支出预检破产零变化、经营总结与损坏/旧版存档拒绝', async () => {
  const context = await browser.newContext()
  try {
    const page = await context.newPage()
    await page.goto(baseUrl); await ready(page)
    const state = await realCoreFixture(page)
    const poor = { ...state, company: { ...state.company, funds: 179999 } }
    await putSave(page, { version: 3, state: poor, savedAt: new Date().toISOString() })
    await page.getByRole('button', { name: '读取本地存档' }).click()
    await textEquals(page.getByTestId('funds'), '¥179,999')
    await page.getByRole('button', { name: '推进本周', exact: true }).click()
    await page.getByText('资金破产，公司进入结束流程。', { exact: true }).waitFor()
    await textEquals(page.getByTestId('funds'), '¥179,999')
    assert.match(await page.getByTestId('week-report').textContent(), /¥0/)
    await page.getByRole('button', { name: '结算项目', exact: true }).click()
    await page.getByTestId('project-result').waitFor()
    assert.match(await page.getByTestId('project-result').textContent(), /公司关闭交付/)
    assert.match(await page.getByTestId('project-result').textContent(), /400,000/)
    await textEquals(page.getByTestId('funds'), '¥-220,001')
    await page.getByRole('button', { name: '生成经营总结', exact: true }).click()
    const summary = page.getByTestId('company-result')
    await summary.waitFor()
    assert.match(await summary.textContent(), /资金破产/)
    assert.match(await summary.textContent(), /-220,001/)
    const settled = await savedState(page)
    assert.equal(settled.state.phase, 'company_ended')
    assert.equal(settled.state.company.status, 'ended')
    for (const record of [
      { version: 99, state: {} },
      { version: 2, savedAt: new Date().toISOString(), state: { version: 2, day: 3, funds: 100000, seed: 1 } },
      { version: 1, savedAt: new Date().toISOString(), state: { budget: 100000, progress: 20, seed: 1 } },
    ]) {
      await putSave(page, record)
      await page.getByRole('button', { name: '读取存档', exact: true }).click()
      await page.getByRole('alert').waitFor()
      assert.match(await page.getByRole('alert').textContent(), record.version === 99 ? /存档损坏/ : new RegExp(`v${record.version} 存档不兼容周制经营 v3`))
      assert.deepEqual((await savedState(page)).state, settled.state)
    }
  } finally { await context.close() }
})

test('读取临近截止的合法边界存档并强制违约交付结算', async () => {
  const context = await browser.newContext()
  try {
    const page = await context.newPage()
    await page.goto(baseUrl); await ready(page)
    const state = await realCoreFixture(page)
    // 校验器要求 deadline_week == start_week + offer.duration_weeks，只改截止周会造出非法存档。
    state.project.offer.duration_weeks = 1
    state.project.deadline_week = 1
    await putSave(page, { version: 3, state, savedAt: new Date().toISOString() })
    await page.getByRole('button', { name: '读取本地存档' }).click()
    await advanceUi(page)
    await page.getByRole('button', { name: '结算项目', exact: true }).click()
    await page.getByTestId('project-result').waitFor()
    assert.match(await page.getByTestId('project-result').textContent(), /截止违约交付/)
    assert.match(await page.getByTestId('project-result').textContent(), /800,000/)
    await textEquals(page.getByTestId('funds'), '¥4,990,000')
    assert.equal((await savedState(page)).state.phase, 'project_settled')
  } finally { await context.close() }
})

async function readyPrototype(page) {
  await page.goto(`${baseUrl}/?view=prototype`)
  await page.getByRole('heading', { name: /新动画工作室/ }).waitFor()
  await page.getByRole('button', { name: '查看公司现金', exact: true }).filter({ hasText: '¥2,000,000' }).waitFor()
}

async function openPrototypeScene(page, name) {
  const navigation = page.getByRole('navigation', { name: '场景切换' })
  await navigation.getByRole('button', { name: new RegExp(name) }).click()
  await page.getByRole('heading', { name, exact: true }).waitFor()
}

async function openPrototypeAction(page, label) {
  await page.getByRole('region', { name: '场景交互选项' }).getByRole('button', { name: new RegExp(label) }).click()
}

async function waitForPrototypeWeek(page, week) {
  await page.getByRole('button', { name: '查看经营周', exact: true })
    .filter({ hasText: new RegExp(`经营周\\s*${week}(?:\\D|$)`) }).waitFor()
}

test('四场景入口加载真实 v4 WASM，侧栏切换不推进周次且无资源错误', async () => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  try {
    const page = await context.newPage()
    const errors = []
    const failedResponses = []
    page.on('pageerror', (error) => errors.push(error.message))
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()) })
    page.on('response', (response) => { if (response.status() >= 400) failedResponses.push(`${response.status()} ${response.url()}`) })
    const wasmResponse = page.waitForResponse((response) => response.url().endsWith('/wasm/v4.wasm'))
    await readyPrototype(page)
    const response = await wasmResponse
    assert.match(response.headers()['content-type'], /application\/wasm/)
    assert.deepEqual([...((await response.body()).subarray(0, 4))], [0, 97, 115, 109])

    const navigation = page.getByRole('navigation', { name: '场景切换' })
    for (const name of ['办公室', '制作现场', '会议室', '发行与市场']) {
      const trigger = navigation.getByRole('button', { name: new RegExp(name) })
      await trigger.click()
      await page.getByRole('heading', { name, exact: true }).waitFor()
      assert.equal(await trigger.getAttribute('aria-current'), 'page')
      const frame = page.getByRole('region', { name: `${name}画面` })
      await frame.getByRole('img').first().waitFor({ state: 'visible' })
      assert.equal(await frame.getByRole('button').count(), 0)
      assert.match(await page.getByRole('button', { name: '查看经营周', exact: true }).textContent(), /经营周\s*0/)
    }
    await page.screenshot({ path: resolve(screenshots, 'prototype-v4-scenes.png'), fullPage: true, animations: 'disabled' })
    assert.deepEqual(errors, [])
    assert.deepEqual(failedResponses, [])
  } finally { await context.close() }
})

test('真实 v4 招聘、锁定承接、周推进与事件确认均提交核心状态', async () => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  try {
    const page = await context.newPage()
    const errors = []
    const failedResponses = []
    page.on('pageerror', (error) => errors.push(error.message))
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()) })
    page.on('response', (response) => { if (response.status() >= 400) failedResponses.push(`${response.status()} ${response.url()}`) })
    await readyPrototype(page)

    await openPrototypeScene(page, '办公室')
    await openPrototypeAction(page, '查看员工与设施')
    let drawer = page.getByRole('dialog', { name: '公司详情' })
    const beforeCandidates = await drawer.getByRole('button', { name: '签约核心' }).count()
    await drawer.getByRole('button', { name: '本周招募' }).click()
    await page.waitForFunction((count) => [...document.querySelectorAll('button')].filter((button) => button.textContent === '签约核心').length === count + 1, beforeCandidates)
    await drawer.getByRole('button', { name: '签约核心' }).first().click()
    await page.waitForFunction((count) => [...document.querySelectorAll('button')].filter((button) => button.textContent === '签约核心').length === count, beforeCandidates)
    const hired = drawer.getByRole('button', { name: /查看员工/ }).last()
    const hiredName = (await hired.getAttribute('aria-label')).replace('查看员工 ', '')
    await hired.click()
    await drawer.getByRole('button', { name: '解雇核心员工' }).click()
    await drawer.getByRole('button', { name: '再次点击确认解雇' }).click()
    await drawer.getByRole('button', { name: `查看员工 ${hiredName}` }).waitFor({ state: 'hidden' })
    await drawer.getByRole('button', { name: '关闭详情' }).click()

    await openPrototypeScene(page, '发行与市场')
    await openPrototypeAction(page, '企划承接')
    drawer = page.getByRole('dialog', { name: '市场企划' })
    await drawer.getByRole('button', { name: '锁定企划（核心）' }).click()
    await drawer.getByRole('button', { name: '企划已锁定' }).waitFor({ state: 'visible' })
    assert.equal(await drawer.getByRole('button', { name: '企划已锁定' }).isDisabled(), true)
    await drawer.getByRole('button', { name: '承接企划（核心）' }).click()
    await page.getByRole('button', { name: '查看在制作品', exact: true }).filter({ hasText: '1' }).waitFor()
    await drawer.getByRole('button', { name: '关闭详情' }).click()

    await openPrototypeScene(page, '会议室')
    await openPrototypeAction(page, '打开周经营')
    drawer = page.getByRole('dialog', { name: '每周经营' })
    for (let week = 1; week <= 6; week += 1) {
      await drawer.getByRole('button', { name: '推进本周', exact: true }).click()
      await waitForPrototypeWeek(page, week)
    }
    await drawer.getByRole('heading', { name: /电视台探班/ }).waitFor()
    const advance = drawer.getByRole('button', { name: '推进本周', exact: true })
    const option = drawer.getByRole('radio', { name: '选择婉拒，专注制作' })
    assert.equal(await advance.isDisabled(), true)
    assert.equal(await option.isDisabled(), true)
    const cash = await page.getByRole('button', { name: '查看公司现金', exact: true }).textContent()
    await drawer.getByRole('button', { name: '查看事件（核心）' }).click()
    await page.waitForFunction(() => [...document.querySelectorAll('input[type="radio"]')].some((input) => !input.disabled))
    assert.equal(await page.getByRole('button', { name: '查看公司现金', exact: true }).textContent(), cash)
    assert.equal(await advance.isEnabled(), true)
    await option.check()
    await drawer.getByRole('button', { name: '确认处理（核心）' }).click()
    await drawer.getByRole('heading', { name: /电视台探班/ }).waitFor({ state: 'hidden' })
    assert.equal(await page.getByRole('button', { name: '查看公司现金', exact: true }).textContent(), cash)
    await waitForPrototypeWeek(page, 6)
    await page.screenshot({ path: resolve(screenshots, 'prototype-v4-event.png'), fullPage: true, animations: 'disabled' })
    assert.deepEqual(errors, [])
    assert.deepEqual(failedResponses, [])
  } finally { await context.close() }
})

test('v4 WASM 加载失败不显示 Mock，恢复资源后重载可真实初始化', async () => {
  const context = await browser.newContext()
  try {
    const page = await context.newPage()
    const pattern = '**/wasm/v4.mjs*'
    await page.route(pattern, (route) => route.abort('failed'))
    await page.goto(`${baseUrl}/?view=prototype`)
    await page.getByRole('alert').filter({ hasText: 'LOAD_FAILED：v4 规则核心加载失败' }).waitFor()
    assert.equal(await page.getByRole('heading', { name: /新动画工作室/ }).count(), 0)
    await page.unroute(pattern)
    await page.reload()
    await page.getByRole('heading', { name: /新动画工作室/ }).waitFor()
    await page.getByRole('button', { name: '查看公司现金', exact: true }).filter({ hasText: '¥2,000,000' }).waitFor()
  } finally { await context.close() }
})

test('真实空 Archive、发行与业绩面板只读核心数据，375px 四场景无横向溢出', async () => {
  const context = await browser.newContext({ viewport: { width: 375, height: 1000 } })
  try {
    const page = await context.newPage()
    await readyPrototype(page)
    await openPrototypeScene(page, '发行与市场')
    await openPrototypeAction(page, '查看公司作品墙')
    let drawer = page.getByRole('dialog', { name: '作品 Archive' })
    await drawer.getByText(/Archive 尚为空/).waitFor()
    await drawer.getByRole('button', { name: '关闭详情' }).click()
    await openPrototypeAction(page, '作品发行')
    drawer = page.getByRole('dialog', { name: '作品发行' })
    await drawer.getByText(/当前筛选下没有作品/).waitFor()
    await drawer.getByRole('button', { name: '关闭详情' }).click()
    await openPrototypeAction(page, '查看业绩看板')
    drawer = page.getByRole('dialog', { name: '业绩与历史' })
    await drawer.getByRole('region', { name: '收入、声望与历史成绩' }).waitFor()
    assert.match(await drawer.getByRole('region', { name: '收入、声望与历史成绩' }).textContent(), /核心流水流入/)
    await drawer.getByRole('button', { name: '关闭详情' }).click()
    for (const name of ['办公室', '制作现场', '会议室', '发行与市场']) {
      await openPrototypeScene(page, name)
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
    }
    await page.screenshot({ path: resolve(screenshots, 'prototype-v4-market-375.png'), fullPage: true, animations: 'disabled' })
  } finally { await context.close() }
})

for (const width of [375, 768]) {
  test(`${width}px 首页、报价、阶段配置、制作、结算无横向溢出，控件可操作`, async () => {
    const context = await browser.newContext({ viewport: { width, height: 1000 }, reducedMotion: 'reduce' })
    try {
      const page = await context.newPage()
      const noOverflow = async () => assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
      await page.goto(`${baseUrl}/?seed=13`); await ready(page)
      await noOverflow()
      await page.screenshot({ path: resolve(screenshots, `home-${width}.png`), fullPage: true, animations: 'disabled' })
      await page.getByRole('button', { name: '开始经营', exact: true }).click()
      await page.getByRole('button', { name: '接手：放学后的第七帧', exact: true }).waitFor()
      await noOverflow()
      await page.getByRole('button', { name: '接手：放学后的第七帧', exact: true }).click()
      await page.getByRole('combobox', { name: '制作方针', exact: true }).waitFor()
      await noOverflow()
      await page.screenshot({ path: resolve(screenshots, `config-${width}.png`), fullPage: true, animations: 'disabled' })
      await page.getByRole('combobox', { name: '制作方针', exact: true }).selectOption('quality')
      await page.getByRole('combobox', { name: '制作方针', exact: true }).selectOption('balanced')
      await page.getByRole('combobox', { name: '林导演专注', exact: true }).selectOption('planning')
      await page.getByRole('combobox', { name: '林导演专注', exact: true }).selectOption('direction')
      await lockStage(page)
      await advanceUi(page)
      await noOverflow()
      await page.screenshot({ path: resolve(screenshots, `studio-${width}.png`), fullPage: true, animations: 'disabled' })
      await finishUi(page)
      await noOverflow()
      await page.screenshot({ path: resolve(screenshots, `settlement-${width}.png`), fullPage: true, animations: 'disabled' })
    } finally { await context.close() }
  })
}
