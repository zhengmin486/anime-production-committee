#!/usr/bin/env python3
"""Verify the hard anchors of the core-bottleneck production model.

Model source: docs/CORE_BOTTLENECK_PRODUCTION_MODEL_2026-11-26.md (v0.5)
Inherited scale: docs/NUMERICAL_PARAMETERS_CATALOG.md section 25.

v0.5 keeps the owner-supplied smooth C1 curves for capacity and quality, and
replaces the v0.4 cubic wage with:
  - nominal unit cost: c30 + A*x + B*x^5 through (30,10)(60,17)(100,70)
  - rework loss: effective rate 80% at S=30 rising linearly to 100% at S=60
  - effective unit cost: U-shaped, minimum near S=59.1
  - quality upper bound 105 and quality_factor(105) = 1040 permille
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

QUALITY_SCORE_MAX = 105
QUALITY_FACTOR_MAX = 1040
REWORK_RATE_FLOOR = 0.80
REWORK_RATE_RAMP_END = 60.0

# Nominal unit-cost curve constants (v0.5).
_C30 = 10.0 / 45.50
_C60 = 17.0 / 70.00
_C100 = 70.0 / 91.00
_R5 = (3.0 / 7.0) ** 5
_A_WAGE = ((_C60 - _C30) - (_C100 - _C30) * _R5) / ((3.0 / 7.0) - _R5)
_B_WAGE = (_C100 - _C30) - _A_WAGE


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
    """Gross weekly points: S=30 -> 45.50, S=60 -> 70.00, S=100 -> 91.00."""
    return BASE_WEEKLY_WP * ability_capacity_multiplier(S)


def gross_capacity_points(S: float) -> float:
    return weekly_capacity_points(S)


def effective_rate(S: float) -> float:
    """Rework-free rate: 80% at S=30, linearly to 100% at S>=60."""
    s = clamp_ability(S)
    if s >= REWORK_RATE_RAMP_END:
        return 1.0
    return 1.0 - (1.0 - REWORK_RATE_FLOOR) * ((REWORK_RATE_RAMP_END - s) / 30.0)


def effective_capacity_points(S: float) -> float:
    return weekly_capacity_points(S) * effective_rate(S)


def nominal_unit_cost(S: float) -> float:
    """Monotone nominal cost per gross point, in 万日元/点."""
    s = clamp_ability(S)
    x = (s - 30.0) / 70.0
    return _C30 + _A_WAGE * x + _B_WAGE * (x ** 5)


def weekly_wage(S: float) -> float:
    """Book wage in 万日元/周; anchors (30,10), (60,17), (100,70)."""
    s = clamp_ability(S)
    return weekly_capacity_points(s) * nominal_unit_cost(s)


def nominal_execution_cost(S: float) -> float:
    return weekly_wage(S) / weekly_capacity_points(S)


def effective_execution_cost(S: float) -> float:
    return weekly_wage(S) / effective_capacity_points(S)


# Backward-compatible alias: v0.5 cost checks use the effective definition.
unit_execution_cost = effective_execution_cost


def quality_score(S: float) -> float:
    """1:1 base + 1.5-power polish from S>70; max 105 after owner ruling."""
    s = clamp_ability(S)
    polish = 5.0 * ((max(0.0, s - 70.0) / 30.0) ** 1.5)
    return s + polish


def quality_factor(mean: int) -> int:
    """Mirror of runtime.cpp: 200 + mean*8, capped at 1040."""
    return max(200, min(QUALITY_FACTOR_MAX, 200 + mean * 8))


def execution_capacity(supervisor_index: int | None) -> float:
    total = 0.0
    for i, ability in enumerate(ABILITIES):
        factor = SUPERVISOR_EXECUTION_FACTOR if i == supervisor_index else 1.0
        total += effective_capacity_points(ability) * factor
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
    """Owner-supplied smooth-model assertions, grouped for reporting."""
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
        Check(102, "毛产能三点锚点 (45.50,70.00,91.00)",
              all(math.isclose(weekly_capacity_points(s), v, abs_tol=1e-4)
                  for s, v in ((30, 45.50), (60, 70.00), (100, 91.00))),
              f"{weekly_capacity_points(30):.2f}/{weekly_capacity_points(60):.2f}/{weekly_capacity_points(100):.2f}"),
        Check(103, "质量四点锚点 (30,60,70,105)",
              all(math.isclose(quality_score(s), v, abs_tol=1e-6)
                  for s, v in ((30, 30), (60, 60), (70, 70), (100, 105))),
              f"30/{quality_score(60):.0f}/{quality_score(70):.0f}/{quality_score(100):.0f}"),
        Check(104, "账面周薪三点锚点 (10,17,70)",
              all(math.isclose(weekly_wage(s), v, abs_tol=1e-6)
                  for s, v in ((30, 10), (60, 17), (100, 70))),
              f"{weekly_wage(30):.2f}/{weekly_wage(60):.2f}/{weekly_wage(100):.2f}"),
        Check(105, "毛产能/质量/账面周薪全区间严格单调",
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
        Check(108, "新人有效单价不低于 0.27（防廉价逃课）",
              effective_execution_cost(30) >= 0.27, f"S=30 {effective_execution_cost(30):.3f} 万/点"),
        Check(109, "有效单价：标准员工低于外包线 / 高端高于外包线",
              effective_execution_cost(60) < OUTSOURCE_COST_PER_WP
              and effective_execution_cost(85) > OUTSOURCE_COST_PER_WP
              and effective_execution_cost(100) > OUTSOURCE_COST_PER_WP * 1.9,
              f"S60 {effective_execution_cost(60):.3f} / S85 {effective_execution_cost(85):.3f} / S100 {effective_execution_cost(100):.3f}"),
        Check(110, "starter_60 有效产能 295.94 / 年工资 4087.2",
              math.isclose(sum(effective_capacity_points(s) for s in s60), 295.94, abs_tol=0.05)
              and math.isclose(sum(weekly_capacity_points(s) for s in s60), 295.94, abs_tol=0.05)
              and math.isclose(sum(weekly_wage(s) for s in s60) * 52, 4087.2, abs_tol=1.0),
              f"{sum(effective_capacity_points(s) for s in s60):.2f} 点 / {sum(weekly_wage(s) for s in s60)*52:.1f} 万"),
        Check(111, "starter_30 有效产能 262.34 / 年工资 3723.2",
              math.isclose(sum(weekly_capacity_points(s) for s in s30), 271.44, abs_tol=0.05)
              and math.isclose(sum(effective_capacity_points(s) for s in s30), 262.34, abs_tol=0.05)
              and math.isclose(sum(weekly_wage(s) for s in s30) * 52, 3723.2, abs_tol=1.0),
              f"{sum(effective_capacity_points(s) for s in s30):.2f} 点 / {sum(weekly_wage(s) for s in s30)*52:.1f} 万"),
        Check(112, "elite_4 有效产能 342.96 / 年工资 8254.5",
              math.isclose(sum(effective_capacity_points(s) for s in elite), 342.96, abs_tol=0.05)
              and math.isclose(sum(weekly_wage(s) for s in elite) * 52, 8254.5, abs_tol=1.0),
              f"{sum(effective_capacity_points(s) for s in elite):.2f} 点 / {sum(weekly_wage(s) for s in elite)*52:.1f} 万"),
    ]


def v05_curve_checks() -> list[Check]:
    """v0.5 nominal-cost + rework-loss combination checks."""
    nom_grid = list(range(30, 101))
    rate_grid = list(range(30, 101))
    fine = [(s / 1000.0, effective_execution_cost(s / 1000.0))
            for s in range(30000, 60001)]
    min_s, min_cost = min(fine, key=lambda t: t[1])
    opening_total = sum(weekly_wage(a) for a in ABILITIES)
    payroll_cost = opening_total * DEADLINE_WEEKS
    outsourced_points = 10 * (EPISODE_WORKLOAD - CORE_WORK_PER_EPISODE)
    outsource_cost = outsourced_points * OUTSOURCE_COST_PER_WP
    gross_margin = PRODUCTION_FEE - payroll_cost - outsource_cost
    return [
        Check(113, "名义单位成本三点锚点且全区间单调",
              all(math.isclose(nominal_unit_cost(s), v, abs_tol=1e-6)
                  for s, v in ((30, _C30), (60, _C60), (100, _C100)))
              and all(nominal_unit_cost(a) < nominal_unit_cost(b)
                      for a, b in zip(nom_grid, nom_grid[1:])),
              f"{nominal_unit_cost(30):.4f}/{nominal_unit_cost(60):.4f}/{nominal_unit_cost(100):.4f}"),
        Check(114, "有效率锚点 80%→100% 且非递减",
              math.isclose(effective_rate(30), 0.80, abs_tol=1e-9)
              and math.isclose(effective_rate(60), 1.00, abs_tol=1e-9)
              and math.isclose(effective_rate(100), 1.00, abs_tol=1e-9)
              and all(effective_rate(a) <= effective_rate(b)
                      for a, b in zip(rate_grid, rate_grid[1:])),
              f"S30 {effective_rate(30):.1%} / S60 {effective_rate(60):.1%}"),
        Check(115, "有效产能三点锚点 (36.40,70.00,91.00)",
              all(math.isclose(effective_capacity_points(s), v, abs_tol=1e-4)
                  for s, v in ((30, 36.40), (60, 70.00), (100, 91.00))),
              f"{effective_capacity_points(30):.2f}/{effective_capacity_points(60):.2f}/{effective_capacity_points(100):.2f}"),
        Check(116, "有效单价 U 型：S30 高于 S60 至少 10%",
              effective_execution_cost(30) >= 0.27
              and effective_execution_cost(30) >= effective_execution_cost(60) * 1.10,
              f"S30 {effective_execution_cost(30):.4f} / S60 {effective_execution_cost(60):.4f} / 比 {effective_execution_cost(30)/effective_execution_cost(60):.2f}x"),
        Check(117, "有效单价谷底落在 S≈59.1 且不超过 0.2430",
              58.5 <= min_s <= 60.5 and min_cost <= 0.2430,
              f"min S={min_s:.3f}, cost={min_cost:.6f} 万/点"),
        Check(118, "有效单价跨越外包线：S60<0.40<S85，S100>0.76",
              effective_execution_cost(60) < OUTSOURCE_COST_PER_WP
              < effective_execution_cost(85)
              and effective_execution_cost(100) > 0.76,
              f"S60 {effective_execution_cost(60):.4f} / S85 {effective_execution_cost(85):.4f} / S100 {effective_execution_cost(100):.4f}"),
        Check(119, "质量上限 105 映射 quality_factor 1040‰",
              math.isclose(quality_score(100), QUALITY_SCORE_MAX, abs_tol=1e-6)
              and quality_factor(100) == 1000
              and quality_factor(105) == QUALITY_FACTOR_MAX,
              f"quality(100)={quality_score(100):.0f}, qf(100)={quality_factor(100)}, qf(105)={quality_factor(105)}"),
        Check(120, "开局周薪 78.60 万 / 10 集毛利 9832.8 万（49.2%）",
              math.isclose(opening_total, 78.60, abs_tol=0.02)
              and math.isclose(gross_margin, 9832.8, abs_tol=1.0)
              and math.isclose(gross_margin / PRODUCTION_FEE, 0.492, abs_tol=0.001),
              f"{opening_total:.2f} 万/周, 毛利 {gross_margin:,.1f} 万 ({gross_margin/PRODUCTION_FEE:.1%})"),
    ]


def checks() -> list[Check]:
    capacity = tv_weekly_capacity()
    cap_52 = capacity * DEADLINE_WEEKS
    ten, twelve = core_work(10), core_work(12)
    lower = (cap_52 - SHARED_WORKLOAD) / 12
    upper = (cap_52 - SHARED_WORKLOAD) / 10
    short_cap = execution_capacity(SHORT_SUPERVISOR_INDEX)
    dual_capacity = (
        effective_capacity_points(ABILITIES[TV_SUPERVISOR_INDEX]) * SUPERVISOR_EXECUTION_FACTOR
        + effective_capacity_points(ABILITIES[SHORT_SUPERVISOR_INDEX]) * SUPERVISOR_EXECUTION_FACTOR
        + effective_capacity_points(ABILITIES[2]) + effective_capacity_points(ABILITIES[3])
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
        Check(13, "外包单价高于标准员工有效单位成本",
              OUTSOURCE_COST_PER_WP > effective_execution_cost(60),
              f"{OUTSOURCE_COST_PER_WP:.3f} > {effective_execution_cost(60):.3f} 万/点"),
        Check(14, "工资/固定运营每周只扣一次",
              PAYROLL_DEDUCTIONS_PER_WEEK == 1 and FIXED_COST_DEDUCTIONS_PER_WEEK == 1,
              "项目账仅做归因"),
        Check(15, "S=60 周薪 ≤ 现实 2 倍",
              weekly_wage(60) * 10000 <= REAL_AVERAGE_WEEKLY * 2 + 1e-6,
              f"{weekly_wage(60):.1f}万/周 = {weekly_wage(60)*10000/REAL_AVERAGE_WEEKLY:.2f}x 现实"),
        Check(16, "工资差距较旧 Salary(S) 提高",
              weekly_wage(100) / weekly_wage(60) > 12 / 7,
              f"新 {weekly_wage(100)/weekly_wage(60):.2f}x > 旧 1.71x"),
        Check(17, "开局 4 人年工资总额 4087.2 万（v0.5 口径）",
              math.isclose(opening_total * 52, 4087.2, abs_tol=1.0),
              f"{opening_total:.2f} 万/周 × 52 = {opening_total*52:.1f} 万"),
        Check(18, "10 集项目毛利为正",
              gross_margin > 0,
              f"制作费 20,000 - 工资 {payroll_cost:,.1f} - 外包 {outsource_cost:,.0f} = {gross_margin:,.1f} 万"),
        *smooth_model_checks(),
        *v05_curve_checks(),
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
