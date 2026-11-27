import { test } from 'node:test'
import assert from 'node:assert/strict'
import { performance } from 'node:perf_hooks'

const factory = (await import('../build/v4/v4.mjs')).default
const core = await factory()

const call = (name, payload) => JSON.parse(core[name](JSON.stringify(payload)))
const ok = (name, payload) => {
  const result = call(name, payload)
  if (result.error) throw new Error(`${name} week=${payload.state?.company?.week}: ${result.error.code} ${result.error.message}`)
  return result
}

function workItem(state, workId, itemId) {
  const work = state.works.find((entry) => entry.id === workId)
  assert.ok(work, `missing work ${workId}`)
  const items = [...work.common.items]
  for (const episode of work.episodes) for (const stage of episode.stages) items.push(...stage.items)
  const item = items.find((entry) => entry.id === itemId)
  assert.ok(item, `missing item ${itemId}`)
  return item
}

function assertInvariants(state) {
  const ledger = state.finance.entries.reduce((sum, entry) => sum + entry.amount, 0)
  assert.equal(state.finance.opening_funds + ledger, state.finance.balance, 'finance ledger identity')
  assert.ok(state.finance.balance >= 0, 'nonnegative company cash')
  assert.ok(state.company.week <= 520, 'week bound')

  const works = new Map(state.works.map((work) => [work.id, work]))
  const supervisors = new Set()
  for (const work of state.works) {
    if (work.status !== 'producing') continue
    assert.ok(work.supervisor_staff_id, `missing supervisor on ${work.id}`)
    assert.ok(!supervisors.has(work.supervisor_staff_id), `duplicate supervisor ${work.supervisor_staff_id}`)
    supervisors.add(work.supervisor_staff_id)
    const supervisor = state.staff.find((member) => member.id === work.supervisor_staff_id)
    assert.equal(supervisor?.assignment_work_id, work.id, `supervisor ownership on ${work.id} at week ${state.company.week}`)
  }
  for (const member of state.staff) {
    if (member.assignment_work_id === null) continue
    assert.ok(works.has(member.assignment_work_id), `dangling staff assignment ${member.id}`)
    if (member.employment === 'temporary') {
      assert.equal(member.temporary_contract.work_id, member.assignment_work_id, `temporary contract ownership ${member.id}`)
    }
  }
  for (const pending of state.events.pending) assert.ok(works.has(pending.work_id), `dangling event ${pending.event_id}`)

  for (const supplier of state.suppliers) {
    const reserved = state.contracts
      .filter((contract) => contract.status === 'active' && contract.supplier_id === supplier.id)
      .reduce((sum, contract) => sum + contract.weekly_cap, 0)
    assert.ok(reserved <= supplier.capacity_per_week, `supplier capacity ${supplier.id}`)
  }
  for (const contract of state.contracts.filter((entry) => entry.status === 'active')) {
    assert.ok(works.has(contract.work_id), `dangling contract work ${contract.id}`)
    assert.equal(workItem(state, contract.work_id, contract.item_id).id, contract.item_id, `contract item ${contract.id}`)
    assert.ok(state.suppliers.some((supplier) => supplier.id === contract.supplier_id), `dangling supplier ${contract.id}`)
  }
}

function signDrawingContract(state, work, amount) {
  const supplier = state.suppliers.find((entry) => entry.id === 'supplier_genga')
  const all = work.common.items.concat(work.episodes.flatMap((episode) => episode.stages.flatMap((stage) => stage.items)))
  const byId = new Map(all.map((item) => [item.id, item]))
  const item = all.find((entry) => entry.outsourceable && !entry.is_gate && entry.ability === 'drawing' &&
    entry.work_done < entry.work_total && entry.deps.every((id) => {
      const dependency = byId.get(id)
      return dependency && dependency.work_done * 1000 >= dependency.deliver_at * dependency.work_total
    }))
  if (!item) return { state, signed: false }
  const reserved = state.contracts
    .filter((entry) => entry.status === 'active' && entry.supplier_id === supplier.id)
    .reduce((sum, entry) => sum + entry.weekly_cap, 0)
  const outstanding = state.contracts
    .filter((entry) => entry.status === 'active' && entry.item_id === item.id)
    .reduce((sum, entry) => sum + entry.work_total - entry.work_done, 0)
  const room = item.work_total - item.work_done - outstanding
  const total = Math.min(amount, room, supplier.capacity_per_week - reserved)
  if (total <= 0) return { state, signed: false }
  const result = ok('sign_outsourcing', {
    state, work_id: work.id, item_id: item.id, supplier_id: supplier.id, work_total: total, mode: 'normal'
  })
  return { state: result.state, signed: true }
}

test('M3/M4：真实命令双项目 520 周压力、存档重放与终局不变量', async () => {
  // 注资只用于隔离长局状态不变量，不作为经济平衡证据。
  let state = ok('initialize', { seed: 3 }).state
  state.finance.opening_funds = 500000000
  state.finance.balance = 500000000
  state = ok('start_work', {
    state, offer_id: 'offer_01', mode: 'committee', percent: 50,
    committee_partner_ids: ['partner_tv', 'partner_stream']
  }).state
  const temporarySupervisor = state.recruitment.pool.find((entry) =>
    entry.origin === 'temporary' && ['director', 'animation_director', 'production_manager', '监督'].includes(entry.staff.role))
  assert.ok(temporarySupervisor, 'seed 3 must provide a temporary supervisor')
  state = ok('hire_temporary', {
    state, work_id: 'work_01', candidate_id: temporarySupervisor.staff.id
  }).state
  state = ok('assign_staff', { state, staff_id: 'staff_dir', work_id: null }).state
  state = ok('dismiss_staff', { state, staff_id: 'staff_dir' }).state
  const supervisor = state.recruitment.pool.find((entry) =>
    entry.origin === 'regular' && ['director', 'animation_director', 'production_manager', '监督'].includes(entry.staff.role))
  assert.ok(supervisor)
  state = ok('hire_core', { state, staff_id: supervisor.staff.id }).state
  state = ok('start_work', { state, offer_id: 'offer_02', mode: 'contract' }).state
  state = ok('assign_staff', { state, staff_id: 'staff_ka', work_id: 'work_01' }).state
  state = ok('assign_staff', { state, staff_id: 'staff_anim', work_id: 'work_02' }).state
  let contracts = 0
  for (const work of state.works) {
    const signed = signDrawingContract(state, work, 60)
    state = signed.state
    if (signed.signed) contracts++
  }
  assertInvariants(state)

  const started = performance.now()
  let resolved = 0
  let starts = 2
  let saveReplayVerified = false
  while (state.company.status === 'running') {
    for (const pending of [...state.events.pending]) {
      assert.ok(pending.options.length > 0, `missing event option ${pending.event_id}`)
      state = ok('resolve_event', {
        state, work_id: pending.work_id, event_id: pending.event_id, option_id: pending.options[0].id
      }).state
      resolved++
    }
    if (state.company.week === 260) {
      const restored = JSON.parse(JSON.stringify(state))
      assert.deepEqual(restored, state)
      const originalAdvance = ok('advance_week', { state })
      const restoredAdvance = ok('advance_week', { state: restored })
      assert.deepEqual(restoredAdvance.report, originalAdvance.report)
      assert.equal(ok('hash_state', { state: restoredAdvance.state }).hash,
        ok('hash_state', { state: originalAdvance.state }).hash)
      state = originalAdvance.state
      saveReplayVerified = true
    } else {
      state = ok('advance_week', { state }).state
    }
    assertInvariants(state)
    if (state.company.status !== 'running') break

    if (state.works.length < 2) {
      const offers = state.market.slots
        .filter((offer) => offer.allowed_modes.includes('contract') && state.company.reputation >= offer.min_reputation)
        .slice(0, 2 - state.works.length)
      for (const offer of offers) {
        const result = call('start_work', { state, offer_id: offer.id, mode: 'contract' })
        if (result.error) {
          assert.match(result.error.message, /INV-27/, `replacement project rejected: ${result.error.code} ${result.error.message}`)
          continue
        }
        state = result.state
        starts++
      }
      const free = state.staff.filter((member) => member.assignment_work_id === null
        && !state.works.some((work) => work.supervisor_staff_id === member.id))
      for (let index = 0; index < free.length && index < state.works.length; index++) {
        state = ok('assign_staff', { state, staff_id: free[index].id, work_id: state.works[index].id }).state
      }
      for (const work of state.works) {
        const signed = signDrawingContract(state, work, 60)
        state = signed.state
        if (signed.signed) contracts++
      }
      assertInvariants(state)
    }
    if (state.company.week % 52 === 0) {
      console.log(`week=${state.company.week} works=${state.works.length} archive=${state.archive.works.length} cash=${state.finance.balance}`)
    }
  }

  assert.equal(state.company.week, 520)
  assert.ok(state.company.status === 'closing' || state.company.status === 'ended')
  assert.equal(state.company.end_reason, 'time_limit')
  while (state.works.length > 0) {
    state = ok('finalize_delivery', { state, work_id: state.works[0].id }).state
    assertInvariants(state)
  }
  const outcome = ok('finalize_company', { state })
  state = outcome.state
  assertInvariants(state)
  assert.equal(state.company.status, 'ended')
  assert.equal(outcome.result.reason, 'time_limit')
  assert.equal(outcome.result.weeks, 520)
  assert.equal(outcome.result.total_projects, starts)
  assert.equal(state.archive.works.length, starts)
  assert.equal(state.archive.company_result.total_projects, starts)
  assert.ok(starts > 2, 'replacement projects were started')
  assert.ok(contracts > 2, 'shared supplier contracts were reused')
  assert.ok(resolved > 0, 'events were resolved through commands')
  assert.ok(state.archive.works.some((work) => work.mode === 'committee'), 'committee settlement was archived')
  assert.ok(state.archive.works.some((work) => work.mode === 'contract'), 'contract settlement was archived')
  assert.ok(state.archive.works.some((work) => work.source === 'market' && work.commercial_revenue > 0),
    'generated market offers produced commercial revenue')
  assert.ok(saveReplayVerified, 'JSON save round-trip replayed deterministically')
  assert.equal(state.contracts.filter((contract) => contract.status === 'active').length, 0, 'no active contracts remain at terminal')

  console.log(JSON.stringify({
    week: state.company.week,
    reason: outcome.result.reason,
    starts,
    contracts,
    resolved,
    saveReplayVerified,
    archive: state.archive.works.length,
    seconds: Number(((performance.now() - started) / 1000).toFixed(2))
  }, null, 2))
})
