"""C1 对照实验：配信时代窗口模型 + 制作费/成本恒等式

不是生产模拟器。只回答一个问题：把 §2.5 / §2.6 的修正加上之后，
承制与委员会各档投资比例的经济结果会落在什么区间。

修正项（对应提案编号）：
  C1-a  生产成本 = 制作费 × cost_ratio（默认 0.87），制作方毛利 13%。
  C1-b  窗口清单补齐配信与海外，按 AJA 2024 真实占比重排：商品化 > 配信 > BD。
        配信拆两段：立项预付（按企划与声望定价，与最终成绩无关）+ 后端分成。
  C1-c  删除 committee_investment_multiple = 2.0。委员会总盘子 = 制作费 + 宣伝费 + 事务局费。
  C1-d  元金优先回収：配当亏损上限为已出资本金。
  C1-e  承制不参与任何窗口分成，只拿制作费毛利 + 达标成功奖励。

会计口径（公司视角，制作方与投资方分开算）：
  制作方：收入 制作费 1.00×B，成本 0.87×B，毛利 0.13×B，与投资比例无关。
  投资方：出资 1.20×B×pct，结算拿到 pct×(窗口合计 − 1.20×B)，亏损以本金为限。

用法：python scripts/sim_window_experiment.py
"""

from __future__ import annotations

import random
import statistics
from dataclasses import dataclass

CFG = {
    "seed": 20261124,
    "trials": 500,
    "weeks": 520,
    "initial_cash": 50_000_000.0,
    "weekly_fixed_cost": 200_000.0,

    "cost_ratio": 0.87,
    "committee_promo_ratio": 0.15,
    "committee_admin_ratio": 0.05,

    "project_types": [
        {"name": "short", "budget":  80_000_000.0, "weeks": 12, "target_quality": 58, "weight": 3},
        {"name": "tv",    "budget": 300_000_000.0, "weeks": 30, "target_quality": 68, "weight": 5},
        {"name": "long",  "budget": 560_000_000.0, "weeks": 54, "target_quality": 72, "weight": 2},
    ],

    "prepaid_base": 0.42,
    "prepaid_reputation_gain": 0.0015,
    "prepaid_sd": 0.10,
    "prepaid_floor": 0.15,
    "prepaid_cap": 0.85,

    "windows": {
        "streaming": {"D": 0.05, "C": 0.10, "B": 0.20, "A": 0.35, "S": 0.60},
        "merch":     {"D": 0.05, "C": 0.15, "B": 0.40, "A": 1.20, "S": 3.00},
        "overseas":  {"D": 0.05, "C": 0.15, "B": 0.35, "A": 0.70, "S": 1.50},
        "broadcast": {"D": 0.10, "C": 0.12, "B": 0.15, "A": 0.18, "S": 0.22},
        "disc":      {"D": 0.03, "C": 0.06, "B": 0.12, "A": 0.25, "S": 0.50},
    },

    "score_reputation_gain": 0.3,
    "score_sd": 9.0,
    "band_cuts": [40, 55, 70, 85],

    "contract_bonus_ratio": 0.10,
    "contract_bonus_score": 70.0,

    "breach_probability": 0.06,
    "breach_penalty_ratio": 0.30,

    "rep_start": 60.0,
    "rep_by_band": {"D": -8.0, "C": -3.0, "B": 0.0, "A": 3.0, "S": 7.0},
    "rep_decay": 0.02,
}

TOTAL_RATIO = 1.0 + CFG["committee_promo_ratio"] + CFG["committee_admin_ratio"]


def cost_band(score: float) -> str:
    for cut, band in zip(CFG["band_cuts"], ["D", "C", "B", "A"]):
        if score < cut:
            return band
    return "S"


def draw_project(rng: random.Random) -> dict:
    types = CFG["project_types"]
    total = sum(t["weight"] for t in types)
    pick = rng.uniform(0.0, total)
    acc = 0.0
    for t in types:
        acc += t["weight"]
        if pick <= acc:
            return dict(t)
    return dict(types[-1])


def prepaid_ratio(rng: random.Random, reputation: float) -> float:
    mean = CFG["prepaid_base"] + CFG["prepaid_reputation_gain"] * (reputation - CFG["rep_start"])
    value = rng.gauss(mean, CFG["prepaid_sd"])
    return min(CFG["prepaid_cap"], max(CFG["prepaid_floor"], value))


@dataclass
class Trial:
    strategy: str
    bankrupt: bool
    final_cash: float
    delivered: int
    reputation: float
    project_profit: float


def run_trial(name: str, pct: int, seed: int, initial_cash: float) -> Trial:
    rng = random.Random(seed)
    cash = initial_cash
    reputation = CFG["rep_start"]
    week = delivered = 0
    project_profit = 0.0
    bankrupt = False

    while week < CFG["weeks"]:
        offers = [draw_project(rng) for _ in range(4)]
        affordable = [p for p in offers if cash >= p["budget"] * TOTAL_RATIO * pct / 100.0]
        if not affordable:
            if cash < CFG["weekly_fixed_cost"]:
                bankrupt = True
                break
            cash -= CFG["weekly_fixed_cost"]
            week += 1
            continue

        project = max(affordable, key=lambda p: p["budget"])
        budget, weeks = project["budget"], project["weeks"]
        investment = budget * TOTAL_RATIO * pct / 100.0
        before = cash

        cash += budget                      # 制作方收到制作费
        prepaid = budget * prepaid_ratio(rng, reputation)
        if pct > 0:                         # 投资方出资 + 配信预付先分
            cash -= investment
            cash += prepaid * pct / 100.0

        weekly_cost = budget * CFG["cost_ratio"] / weeks + CFG["weekly_fixed_cost"]
        for _ in range(weeks):
            if cash < weekly_cost:
                bankrupt = True
                break
            cash -= weekly_cost
            week += 1
            if week >= CFG["weeks"]:
                break
        if bankrupt:
            break
        if week >= CFG["weeks"]:
            continue

        delivered += 1
        breach = rng.random() < CFG["breach_probability"]
        if breach:
            cash -= budget * CFG["breach_penalty_ratio"]
            if cash < 0:
                bankrupt = True
                break
            score, band = 0.0, "D"
        else:
            score = rng.gauss(
                project["target_quality"] + (reputation - CFG["rep_start"]) * CFG["score_reputation_gain"],
                CFG["score_sd"],
            )
            band = cost_band(score)

        if pct == 0:
            if not breach and score >= CFG["contract_bonus_score"]:
                cash += budget * CFG["contract_bonus_ratio"]
        else:
            windows_total = sum(w[band] for w in CFG["windows"].values()) * budget
            pool = windows_total - prepaid - budget * (TOTAL_RATIO - 1.0)
            pool = max(pool, -budget * TOTAL_RATIO)
            cash += pool * pct / 100.0

        reputation = max(0.0, reputation + CFG["rep_by_band"][band] - CFG["rep_decay"] * reputation)
        project_profit += cash - before

    return Trial(name, bankrupt, cash, delivered, reputation, project_profit)


def mixed_trial(seed: int, initial_cash: float) -> Trial:
    """先承制积累，现金够两倍保证金且企划目标质量 ≥65 时吃 50% 席位。"""
    rng = random.Random(seed)
    cash = initial_cash
    reputation = CFG["rep_start"]
    week = delivered = 0
    project_profit = 0.0
    bankrupt = False

    while week < CFG["weeks"]:
        offers = [draw_project(rng) for _ in range(4)]
        offers.sort(key=lambda p: p["budget"], reverse=True)
        chosen, pct = offers[0], 0
        for p in offers:
            need = p["budget"] * TOTAL_RATIO * 0.50
            if cash >= need * 2.5 and p["target_quality"] >= 65:
                chosen, pct = p, 50
                break

        budget, weeks = chosen["budget"], chosen["weeks"]
        investment = budget * TOTAL_RATIO * pct / 100.0
        before = cash

        cash += budget
        prepaid = budget * prepaid_ratio(rng, reputation)
        if pct > 0:
            cash -= investment
            cash += prepaid * pct / 100.0

        weekly_cost = budget * CFG["cost_ratio"] / weeks + CFG["weekly_fixed_cost"]
        for _ in range(weeks):
            if cash < weekly_cost:
                bankrupt = True
                break
            cash -= weekly_cost
            week += 1
            if week >= CFG["weeks"]:
                break
        if bankrupt:
            break
        if week >= CFG["weeks"]:
            continue

        delivered += 1
        breach = rng.random() < CFG["breach_probability"]
        if breach:
            cash -= budget * CFG["breach_penalty_ratio"]
            if cash < 0:
                bankrupt = True
                break
            score, band = 0.0, "D"
        else:
            score = rng.gauss(
                chosen["target_quality"] + (reputation - CFG["rep_start"]) * CFG["score_reputation_gain"],
                CFG["score_sd"],
            )
            band = cost_band(score)

        if pct == 0:
            if not breach and score >= CFG["contract_bonus_score"]:
                cash += budget * CFG["contract_bonus_ratio"]
        else:
            windows_total = sum(w[band] for w in CFG["windows"].values()) * budget
            pool = windows_total - prepaid - budget * (TOTAL_RATIO - 1.0)
            pool = max(pool, -budget * TOTAL_RATIO)
            cash += pool * pct / 100.0

        reputation = max(0.0, reputation + CFG["rep_by_band"][band] - CFG["rep_decay"] * reputation)
        project_profit += cash - before

    return Trial("混合经营（承制为主，条件满足吃 50%）", bankrupt, cash, delivered, reputation, project_profit)


def pack(name: str, rows: list[Trial]) -> dict:
    cash = sorted(r.final_cash for r in rows)
    n = len(cash)
    return {
        "strategy": name,
        "bankruptcy_rate": sum(r.bankrupt for r in rows) / n,
        "median_cash": statistics.median(cash),
        "p10": cash[int(n * 0.10)],
        "p90": cash[int(n * 0.90)],
        "delivered": statistics.mean(r.delivered for r in rows),
        "reputation": statistics.mean(r.reputation for r in rows),
        "profit_per_work": statistics.mean(
            [r.project_profit / r.delivered for r in rows if r.delivered] or [0.0]
        ),
    }


def summarize(name: str, pct: int, cash0: float) -> dict:
    return pack(name, [run_trial(name, pct, CFG["seed"] + i, cash0) for i in range(CFG["trials"])])


def summarize_mixed(cash0: float) -> dict:
    return pack("混合经营（承制为主，条件满足吃 50%）",
                [mixed_trial(CFG["seed"] + i, cash0) for i in range(CFG["trials"])])


def print_panel(title: str, results: list[dict]) -> None:
    print(title)
    print(f"{'策略':<30}{'破产率':>8}{'期末现金中位':>14}{'P10–P90':>24}{'交付':>7}{'声望':>7}{'单部利润':>10}")
    print("-" * 100)
    for r in results:
        print(
            f"{r['strategy']:<30}"
            f"{r['bankruptcy_rate']:>7.1%}"
            f"{r['median_cash'] / 1e6:>12,.0f}M"
            f"{r['p10'] / 1e6:>9,.0f}–{r['p90'] / 1e6:<12,.0f}M"
            f"{r['delivered']:>7.2f}"
            f"{r['reputation']:>7.1f}"
            f"{r['profit_per_work'] / 1e6:>8,.1f}M"
        )
    print()


def band_economics() -> None:
    """单部作品在各商业档位下的净收益，单位为制作费的倍数。"""
    print("【档位经济】公司净收益 / 制作费，按商业档位")
    print(f"{'档位':<6}{'窗口合计':>10}{'承制':>9}{'委员会10%':>11}{'委员会50%':>11}{'委员会100%':>12}")
    print("-" * 60)
    for band in ["D", "C", "B", "A", "S"]:
        windows = sum(w[band] for w in CFG["windows"].values())
        pool = windows - CFG["prepaid_base"] - (TOTAL_RATIO - 1.0)
        pool = max(pool, -TOTAL_RATIO)
        margin = 1.0 - CFG["cost_ratio"]
        cells = [margin + pool * pct / 100.0 for pct in (0, 10, 50, 100)]
        print(f"{band:<6}{windows:>10.2f}"
              f"{cells[0]:>+9.2f}{cells[1]:>+11.2f}{cells[2]:>+11.2f}{cells[3]:>+12.2f}")
    print("  （承制一列不含达标成功奖励，含奖励约 +0.13 ~ +0.23）\n")


def main() -> None:
    print(f"试验 {CFG['trials']} 次/策略，周期 {CFG['weeks']} 周，成本比 {CFG['cost_ratio']:.2f}"
          f"（制作方毛利 {1 - CFG['cost_ratio']:.0%}）")
    print(f"委员会总盘子 = 制作费 × {TOTAL_RATIO:.2f}"
          f"（宣伝 {CFG['committee_promo_ratio']:.0%} + 事务局 {CFG['committee_admin_ratio']:.0%}）\n")
    band_economics()

    fixed = [("全部承制", 0), ("委员会10%", 10), ("委员会50%", 50), ("委员会100%", 100)]
    small = [summarize(n, p, CFG["initial_cash"]) for n, p in fixed]
    print_panel("【面板 A】小公司，初始现金 50M", small)

    mid = [summarize(n, p, 500_000_000.0) for n, p in fixed]
    print_panel("【面板 B】中型公司，初始现金 500M", mid)

    dyn = [summarize_mixed(CFG["initial_cash"]), summarize_mixed(500_000_000.0)]
    print_panel("【面板 C】动态策略（C=50M，D=500M）", dyn)

    print("—— 收敛性检查 ——")
    for label, panel in (("面板 A", small), ("面板 B", mid)):
        vals = [r["median_cash"] for r in panel[:3] if r["median_cash"] > 1e6]
        if len(vals) >= 2:
            print(f"{label}：承制 / 10% / 50% 期末现金中位数倍差 "
                  f"{max(vals) / min(vals):,.1f}×（旧模型 18.1×）")
        else:
            print(f"{label}：50% 档中位数为 0，按极端值处理，不计倍差")
    dead = [r["strategy"] for r in small if r["median_cash"] <= 0]
    if dead:
        print(f"面板 A 结构性不可行（初始资金不够保证金）：{', '.join(dead)}")
    print(f"面板 B 四档极差 {max(r['median_cash'] for r in mid) / min(r['median_cash'] for r in mid):,.1f}×"
          f"（旧模型 15,019×）")


if __name__ == "__main__":
    main()
