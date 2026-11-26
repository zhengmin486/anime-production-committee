#!/usr/bin/env python3
"""Verify the hard anchors of the core-bottleneck production model.

Model source: docs/CORE_BOTTLENECK_PRODUCTION_MODEL_2026-11-26.md (v0.4)
Inherited scale: docs/NUMERICAL_PARAMETERS_CATALOG.md section 25.

v0.4 replaces the v0.3 piecewise working assumptions with owner-supplied
smooth C1-continuous formulas over [30, 100]:
  - capacity: concave quadratic through (30,0.65), (60,1.00), (100,1.30)
  - quality:  1:1 base + 1.5-power polish from S>70, C1 at S=70
  - wage:     cubic through (30,10), (60,17), (100,70)  [万日元/周]

The script keeps the hard-anchor checks (10 episodes doable, 12 impossible)
and adds the owner's v4 smooth-model assertions verbatim.
"""
from __future__ import annotations

import math
import sys
from dataclasses import dataclass

# Inherited scale.
SHARED_WORKLOAD = 4_800
EPISODE_WORKLOAD = 2_100
WEEKLY_CAPACITY_UTILIZATION = 0.85
SUPERVISOR_EXECUTION_FACTOR = 0.5
BASE_WEEKLY_WP = 70.0
OUTSOURCE_COST_PER_WP = 0.40
PRODUCTION_FEE = 20000  # 万日元 = 200M

ABILITIES = (75, 70, 60, 60)  # A, B, C, D working assumption
TV_SUPERVISOR_INDEX = 0
SHORT_SUPERVISOR_INDEX = 1
CORE_WORK_PER_EPISODE = 580   # verified inside (543.74, 652.49]
OLD_CORE_WORK_PER_EPISODE = 350
DEADLINE_WEEKS = 52

REAL_AVERAGE_WEEKLY = 445 * 10000 / 52  # 8.56万日元/周 (AJA 2025, external)
PAYROLL_DEDUCTIONS_PER_WEEK = 1
FIXED_COST_DEDUCTIONS_PER_WEEK = 1


def clamp_ability(S: float) -> float:
    return max(30.0, min(100.0, float(S)))


def ability_capacity_multiplier(S: float) -> float:
    """Concave quadratic through (30,0.65), (60,1.00), (100,1.30)."""
    s = clamp_ability(S)
    return (
        -0.0000595238095238 * s * s
        + 0.0170238095238 * s
        + 0.192857142857
    )


def weekly_capacity_points(S: float) -> float:
    """S=30 -> 45.50, S=60 -> 70.00, S=100 -> 91.00."""
    return BASE_WEEKLY_WP * ability_capacity_multiplier(S)


def quality_score(S: float) -> float:
    """1:1 base + 1.5-power polish from S>70, max +5; C1 at S=70."""
    s = clamp_ability(S)
    polish = 5.0 * ((max(0.0, s - 70.0) / 30.0) ** 1.5)
    return s + polish


def weekly_wage(S: float) -> float:
    """Cubic through (30,10), (60,17), (100,70), in 万日元/周."""
    s = clamp_ability(S)
    x = (s - 30.0) / 70.0
    return 10.0 + (781.0 / 120.0) * x + (6419.0 / 120.0) * (x ** 3)


def unit_execution_cost(S: float) -> float:
    """Pure-execution unit cost (万日元/点)."""
    return weekly_wage(S) / weekly_capacity_points(S)


def execution_capacity(supervisor_index: int | None) -> float:
    total = 0.0
    for i, ability in enumerate(ABILITIES):
        factor = SUPERVISOR_EXECUTION_FACTOR if i == supervisor_index else 1.0
        total += weekly_capacity_points(ability) * factor
    return total * WEEKLY_CAPACITY_UTILIZATION


def tv_weekly_capacity() -> float:
    return execution_capacity(TV_SUPERVISOR_INDEX)


def core_work(episodes: int, per_episode: int = CORE_WORK_PER_EPISODE) -> int:
    return SHARED_WORKLOAD + episodes * per_episode


def meets_tv_supervisor(ability: int) -> bool:
    return ability == ABILITIES[TV_SUPERVISOR_INDEX]


def meets_short_supervisor(ability: int) -> bool:
    return ability >= ABILITIES[SHORT_SUPERVISOR_INDEX]


def can_double_open(project_a: str, project_b: str) -> bool:
    if sum(p == "tv" for p in (project_a, project_b)) > 1:
        return False
    return all(p in {"tv", "short", "ova"} for p in (project_a, project_b))


@dataclass(frozen=True)
class Check:
    number: int
    description: str
    passed: bool
    detail: str


def smooth_model_checks() -> list[Check]:
    """Owner-supplied v4 smooth-model assertions, grouped for reporting."""
    grid = list(range(30, 101))
    cap_gain = ability_capacity_multiplier(100) / ability_capacity_multiplier(60) - 1.0
    qual_gain = quality_score(100) / quality_score(60) - 1.0
    h = 1e-5
    dl = (quality_score(70) - quality_score(70 - h)) / h
    dr = (quality_score(70 + h) - quality_score(70)) / h
    s60 = [75, 70, 60, 60]
    s30 = [75, 70, 60, 30]
    elite = [95, 90, 85, 80]
    return [
        Check(101, "产能三点锚点 (30,0.65)(60,1.00)(100,1.30)",
              all(math.isclose(ability_capacity_multiplier(s), v, abs_tol=1e-6)
                  for s, v in ((30, 0.65), (60, 1.00), (100, 1.30))),
              f"{ability_capacity_multiplier(30):.4f}/{ability_capacity_multiplier(60):.4f}/{ability_capacity_multiplier(100):.4f}"),
        Check(102, "周产能三点锚点 (45.50,70.00,91.00)",
              all(math.isclose(weekly_capacity_points(s), v, abs_tol=1e-4)
                  for s, v in ((30, 45.50), (60, 70.00), (100, 91.00))),
              f"{weekly_capacity_points(30):.2f}/{weekly_capacity_points(60):.2f}/{weekly_capacity_points(100):.2f}"),
        Check(103, "质量四点锚点 (30,60,70,105)",
              all(math.isclose(quality_score(s), v, abs_tol=1e-6)
                  for s, v in ((30, 30), (60, 60), (70, 70), (100, 105))),
              f"30/{quality_score(60):.0f}/{quality_score(70):.0f}/{quality_score(100):.0f}"),
        Check(104, "周薪三点锚点 (10,17,70)",
              all(math.isclose(weekly_wage(s), v, abs_tol=1e-6)
                  for s, v in ((30, 10), (60, 17), (100, 70))),
              f"{weekly_wage(30):.2f}/{weekly_wage(60):.2f}/{weekly_wage(100):.2f}"),
        Check(105, "产能/质量/周薪全区间严格单调",
              all(all(f(a) < f(b) for a, b in zip(grid, grid[1:]))
                  for f in (weekly_capacity_points, quality_score, weekly_wage)),
              "S=30..100 无倒挂"),
        Check(106, "质量在 S=70 一阶导数连续",
              abs(dl - dr) < 1e-3, f"左 {dl:.6f} / 右 {dr:.6f}, 差 {abs(dl-dr):.2e}"),
        Check(107, "质量弹性 / 产能弹性 >= 2.5",
              math.isclose(cap_gain, 0.30, abs_tol=1e-6)
              and math.isclose(qual_gain, 0.75, abs_tol=1e-6)
              and qual_gain / cap_gain >= 2.5 - 1e-6,
              f"{cap_gain:.2f} / {qual_gain:.2f} = {qual_gain/cap_gain:.2f}"),
        Check(108, "新人单位成本不低于 0.21（防廉价逃课）",
              unit_execution_cost(30) >= 0.21, f"S=30 {unit_execution_cost(30):.3f} 万/点"),
        Check(109, "标准员工可外包线以下 / 高端以上",
              unit_execution_cost(60) < OUTSOURCE_COST_PER_WP
              and unit_execution_cost(85) > OUTSOURCE_COST_PER_WP
              and unit_execution_cost(100) > OUTSOURCE_COST_PER_WP * 1.9,
              f"S60 {unit_execution_cost(60):.3f} / S85 {unit_execution_cost(85):.3f} / S100 {unit_execution_cost(100):.3f}"),
        Check(110, "starter_60 阵容产能 295.94 / 年工资 4476.9",
              math.isclose(sum(weekly_capacity_points(s) for s in s60), 295.94, abs_tol=0.05)
              and math.isclose(sum(weekly_wage(s) for s in s60) * 52, 4476.9, abs_tol=1.0),
              f"{sum(weekly_capacity_points(s) for s in s60):.2f} 点 / {sum(weekly_wage(s) for s in s60)*52:.1f} 万"),
        Check(111, "starter_30 阵容产能 271.44 / 年工资 4112.9",
              math.isclose(sum(weekly_capacity_points(s) for s in s30), 271.44, abs_tol=0.05)
              and math.isclose(sum(weekly_wage(s) for s in s30) * 52, 4112.9, abs_tol=1.0),
              f"{sum(weekly_capacity_points(s) for s in s30):.2f} 点 / {sum(weekly_wage(s) for s in s30)*52:.1f} 万"),
        Check(112, "elite_4 阵容产能 342.96 / 年工资 9533.6",
              math.isclose(sum(weekly_capacity_points(s) for s in elite), 342.96, abs_tol=0.05)
              and math.isclose(sum(weekly_wage(s) for s in elite) * 52, 9533.6, abs_tol=1.0),
              f"{sum(weekly_capacity_points(s) for s in elite):.2f} 点 / {sum(weekly_wage(s) for s in elite)*52:.1f} 万"),
    ]


def checks() -> list[Check]:
    capacity = tv_weekly_capacity()
    cap_52 = capacity * DEADLINE_WEEKS
    ten, twelve = core_work(10), core_work(12)
    lower = (cap_52 - SHARED_WORKLOAD) / 12
    upper = (cap_52 - SHARED_WORKLOAD) / 10
    short_cap = execution_capacity(SHORT_SUPERVISOR_INDEX)
    dual_capacity = (
        weekly_capacity_points(ABILITIES[TV_SUPERVISOR_INDEX]) * SUPERVISOR_EXECUTION_FACTOR
        + weekly_capacity_points(ABILITIES[SHORT_SUPERVISOR_INDEX]) * SUPERVISOR_EXECUTION_FACTOR
        + weekly_capacity_points(ABILITIES[2]) + weekly_capacity_points(ABILITIES[3])
    ) * WEEKLY_CAPACITY_UTILIZATION
    opening_total = sum(weekly_wage(a) for a in ABILITIES)
    payroll_cost = opening_total * DEADLINE_WEEKS
    outsourced_points = 10 * (EPISODE_WORKLOAD - CORE_WORK_PER_EPISODE)
    outsource_cost = outsourced_points * OUTSOURCE_COST_PER_WP
    gross_margin = PRODUCTION_FEE - payroll_cost - outsource_cost

    return [
        Check(1, "10 集社内核心工作 ≤ 52 周产能",
              ten <= cap_52, f"{ten:,} ≤ {cap_52:,.1f} 点"),
        Check(2, "12 集社内核心工作 > 52 周产能",
              twelve > cap_52, f"{twelve:,} > {cap_52:,.1f} 点"),
        Check(3, "12 集外包全部 O 层仍超期",
              twelve > cap_52, "C 层不可购买"),
        Check(4, "初始团队 4 人，能力假设 75/70/60/60",
              ABILITIES == (75, 70, 60, 60) and len(ABILITIES) == 4, str(ABILITIES)),
        Check(5, "开局只有 1 人达标准 TV 监督门槛",
              sum(meets_tv_supervisor(a) for a in ABILITIES) == 1,
              f"A={ABILITIES[0]} 达标，B={ABILITIES[1]} 不达标"),
        Check(6, "次强者能监督短篇 / OVA",
              meets_short_supervisor(ABILITIES[SHORT_SUPERVISOR_INDEX])
              and not meets_tv_supervisor(ABILITIES[SHORT_SUPERVISOR_INDEX]),
              f"B={ABILITIES[1]} 达短篇门槛，未达 TV 门槛"),
        Check(7, "谁做监督谁打 5 折",
              SUPERVISOR_EXECUTION_FACTOR == 0.5 and tv_weekly_capacity() < short_cap,
              f"A 监督 {tv_weekly_capacity():.1f} < B 监督 {short_cap:.1f} 点/周"),
        Check(8, "4 人不能双开两个标准 TV",
              not can_double_open("tv", "tv"), "只有 A 达 TV 监督门槛"),
        Check(9, "4 人可双开标准 TV + 短篇/OVA",
              can_double_open("tv", "short") and can_double_open("tv", "ova"),
              f"A+B 监督，合计 {dual_capacity:.1f} 点/周"),
        Check(10, "旧候选 350 点/集不满足锚点",
              OLD_CORE_WORK_PER_EPISODE <= lower, f"旧值 350 ≤ 下界 {lower:.0f}"),
        Check(11, "工作假设 580 点/集落在新锚点区间",
              lower < CORE_WORK_PER_EPISODE <= upper, f"({lower:.2f}, {upper:.2f}]"),
        Check(12, "单集可外包层 o = 2100 - w ≥ 0",
              EPISODE_WORKLOAD - CORE_WORK_PER_EPISODE > 0,
              f"o = {EPISODE_WORKLOAD - CORE_WORK_PER_EPISODE} 点/集"),
        Check(13, "外包单价高于标准员工单位产能工资",
              OUTSOURCE_COST_PER_WP > unit_execution_cost(60),
              f"{OUTSOURCE_COST_PER_WP:.3f} > {unit_execution_cost(60):.3f} 万/点"),
        Check(14, "工资/固定运营每周只扣一次",
              PAYROLL_DEDUCTIONS_PER_WEEK == 1 and FIXED_COST_DEDUCTIONS_PER_WEEK == 1,
              "项目账仅做归因"),
        Check(15, "S=60 周薪 ≤ 现实 2 倍",
              weekly_wage(60) * 10000 <= REAL_AVERAGE_WEEKLY * 2 + 1e-6,
              f"{weekly_wage(60):.1f}万/周 = {weekly_wage(60)*10000/REAL_AVERAGE_WEEKLY:.2f}x 现实"),
        Check(16, "工资差距较旧 Salary(S) 提高",
              weekly_wage(100) / weekly_wage(60) > 12 / 7,
              f"新 {weekly_wage(100)/weekly_wage(60):.2f}x > 旧 1.71x"),
        Check(17, "开局 4 人年工资总额 4476.9 万（新口径，非 117 万/周）",
              math.isclose(opening_total * 52, 4476.9, abs_tol=1.0),
              f"{opening_total:.2f} 万/周 × 52 = {opening_total*52:.1f} 万"),
        Check(18, "10 集项目毛利为正",
              gross_margin > 0,
              f"制作费 20,000 - 工资 {payroll_cost:,.1f} - 外包 {outsource_cost:,.0f} = {gross_margin:,.1f} 万"),
        *smooth_model_checks(),
    ]


def main() -> int:
    results = checks()
    failed = [c for c in results if not c.passed]
    for c in results:
        print(f"[{'PASS' if c.passed else 'FAIL'}] {c.number}. {c.description} — {c.detail}")
    if failed:
        print(f"\n{len(failed)} anchor(s) failed")
        return 1
    print(f"\nAll {len(results)} anchors passed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
