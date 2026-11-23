#!/usr/bin/env python3
"""Monte Carlo prototype for stochastic production work and six quality dimensions.

Experimental only. It imports the existing scheduling model and does not alter
formal game rules or the baseline scheduler.
"""
import argparse
import json
import random
import statistics
from pathlib import Path

import staff_scheduling_simulator as base

DIMENSIONS = ("story", "direction", "art", "animation", "sound", "postproduction")
STAGE_DIMENSIONS = {
    "script": ("story", "direction"),
    "storyboard": ("direction", "story", "art", "animation"),
    "key_animation": ("art", "animation", "direction"),
    "animation_check": ("animation", "art", "direction"),
    "postproduction": ("postproduction", "sound", "direction"),
}
DIMENSION_ABILITY = {
    "story": "planning",
    "direction": "direction",
    "art": "drawing",
    "animation": "animation",
    "sound": "postproduction",  # No dedicated sound ability exists in the current Staff contract.
    "postproduction": "postproduction",
}

def performance_parameters(skill):
    """Higher skill raises the mean multiplier and narrows its range."""
    skill = int(skill)
    mean = 1.0 + (skill - 50) * 0.001
    spread = max(0.10, 0.40 - skill * 0.003)
    return mean, spread

def work_multiplier(skill, rng):
    mean, spread = performance_parameters(skill)
    return rng.uniform(mean - spread, mean + spread)

def quality_gain(skill, rng, stochastic):
    """Higher skill raises average quality contribution and narrows its spread."""
    mean, spread = performance_parameters(skill)
    mean_gain = 2.5 + int(skill) / 50
    if not stochastic:
        return mean_gain
    return max(0.25, rng.uniform(mean_gain * (1 - spread), mean_gain * (1 + spread)))

def pick_dimensions(stage, person, rng):
    dimensions = STAGE_DIMENSIONS[stage]
    skill_weights = [
        max(1, int(person["abilities"][DIMENSION_ABILITY[dim]]))
        for dim in dimensions
    ]
    count = 1 + int(rng.random() < 0.45)
    chosen = []
    for _ in range(count):
        dim = rng.choices(dimensions, weights=skill_weights, k=1)[0]
        if dim not in chosen:
            chosen.append(dim)
    return chosen

def run_once(people, strategy, workload, deadline, mode, seed, ability_model="multi"):
    rng = random.Random(seed)
    overtime = strategy.endswith("_deadline")
    policy = base.POLICIES["deadline" if overtime else "balanced"]
    fatigue = {p["id"]: int(p.get("fatigue", 0)) for p in people}
    morale = {p["id"]: int(p.get("morale", 80)) for p in people}
    quality = {d: 0.0 for d in DIMENSIONS}
    total_work = weeks = 0
    stage_weeks = {}
    assignments = {}

    for stage, ability, _ in base.STAGES:
        remaining = workload
        used = 0
        fixed = None if strategy in base.DYNAMIC else base.choose(
            strategy, stage, ability, people, morale, fatigue,
            policy["speed"], ability_model
        )
        while remaining > 0 and weeks < deadline:
            workers = base.choose(
                strategy, stage, ability, people, morale, fatigue,
                policy["speed"], ability_model
            ) if fixed is None else fixed
            ids = [p["id"] for p in workers]
            assignments.setdefault(stage, []).append(ids)
            coordination = base.coordination_factor(workers) if ability_model == "multi" else 1000

            worker_rows = []
            weekly_work_float = 0.0
            for p in workers:
                pid = p["id"]
                skill = base.effective_ability(p, stage, ability, ability_model)
                points = base.production_points(
                    p, ability, morale[pid], fatigue[pid], policy["speed"],
                    stage, ability_model, coordination
                )
                if mode in ("work_only", "work_and_quality"):
                    points_float = points * work_multiplier(skill, rng)
                else:
                    points_float = float(points)
                weekly_work_float += points_float
                worker_rows.append((p, points_float))

            weekly_work = max(0, round(weekly_work_float))
            quality_delta = {d: 0.0 for d in DIMENSIONS}
            if weekly_work_float > 0:
                for p, points_float in worker_rows:
                    share = points_float / weekly_work_float
                    if mode == "work_and_quality":
                        selected = pick_dimensions(stage, p, rng)
                    else:
                        # Control groups apply the expected contribution to every
                        # dimension available in the current stage, without RNG.
                        selected = list(STAGE_DIMENSIONS[stage])
                    for dim in selected:
                        dim_skill = int(p["abilities"][DIMENSION_ABILITY[dim]])
                        quality_delta[dim] += share * quality_gain(
                            dim_skill, rng, mode == "work_and_quality"
                        )
                for dim, delta in quality_delta.items():
                    quality[dim] = min(100.0, quality[dim] + delta)

            gain = min(remaining, weekly_work)
            remaining -= gain
            total_work += gain
            assigned_ids = set(ids)
            for p in people:
                pid = p["id"]
                if pid in assigned_ids:
                    fatigue[pid] = min(100, fatigue[pid] + base.FATIGUE_WORK)
                    morale[pid] = max(0, min(100, morale[pid] + policy["morale"] -
                        (base.OVERTIME_MORALE if overtime else 0)))
                else:
                    fatigue[pid] = max(0, fatigue[pid] - base.FATIGUE_REST)
                    morale[pid] = max(0, min(100, morale[pid] + base.REST_MORALE))
            weeks += 1
            used += 1
            if weekly_work <= 0:
                break
        stage_weeks[stage] = used
        if remaining > 0:
            break

    completed = len(stage_weeks) == len(base.STAGES) and all(
        stage_weeks.get(s, 0) > 0 for s, _, _ in base.STAGES
    ) and total_work >= workload * len(base.STAGES)
    quality = {k: round(v, 2) for k, v in quality.items()}
    return {
        "completed": completed,
        "weeks": weeks,
        "total_work": total_work,
        "quality": quality,
        "final_quality": round(statistics.mean(quality.values()), 2),
        "stage_weeks": stage_weeks,
        "assignments": assignments,
    }

def percentile(values, pct):
    ordered = sorted(values)
    if not ordered:
        return None
    index = round((len(ordered) - 1) * pct)
    return ordered[index]

def summarize(results):
    fields = ["weeks", "total_work", "final_quality", *DIMENSIONS]
    summary = {
        "runs": len(results),
        "completion_rate": round(sum(r["completed"] for r in results) / len(results), 4),
    }
    for field in fields:
        values = [r["quality"][field] if field in DIMENSIONS else r[field] for r in results]
        summary[field] = {
            "mean": round(statistics.mean(values), 2),
            "stdev": round(statistics.pstdev(values), 2),
            "p10": percentile(values, 0.10),
            "p50": percentile(values, 0.50),
            "p90": percentile(values, 0.90),
            "min": min(values),
            "max": max(values),
        }
    return summary

def experiment(people, strategies, workloads, runs, deadline, seed, ability_model):
    output = {
        "model": "stochastic-production-v0.1",
        "notice": "Experimental prototype only; parameters and quality dimensions are not formal game rules.",
        "seed": seed,
        "runs_per_case": runs,
        "deadline_weeks": deadline,
        "quality_dimensions": list(DIMENSIONS),
        "stage_dimensions": STAGE_DIMENSIONS,
        "sound_note": "Sound uses postproduction ability as a temporary proxy because Staff has no sound ability.",
        "ability_model": ability_model,
        "modes": {},
    }
    for mode in ("fixed", "work_only", "work_and_quality"):
        output["modes"][mode] = {}
        for strategy in strategies:
            for workload in workloads:
                key = f"{strategy}|workload={workload}"
                results = [
                    run_once(people, strategy, workload, deadline, mode,
                             seed + i, ability_model)
                    for i in range(runs)
                ]
                output["modes"][mode][key] = summarize(results)
    return output

def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--staff-file", type=Path, default=Path("scripts/fixtures/staff_templates.json"))
    ap.add_argument("--workloads", default="30,60,90")
    ap.add_argument("--strategies", default="all_staff,pair_specialist,dynamic_pair")
    ap.add_argument("--runs", type=int, default=200)
    ap.add_argument("--deadline", type=int, default=14)
    ap.add_argument("--seed", type=int, default=20261123)
    ap.add_argument("--ability-model", choices=base.ABILITY_MODELS, default="multi")
    ap.add_argument("--out", type=Path, default=Path("simulation-output/stochastic-production.json"))
    args = ap.parse_args()
    if args.runs < 1 or args.deadline < 1:
        ap.error("--runs and --deadline must be positive")
    people = base.load_staff(args.staff_file)
    payload = experiment(
        people, [s.strip() for s in args.strategies.split(",") if s.strip()],
        [int(x) for x in args.workloads.split(",") if x.strip()],
        args.runs, args.deadline, args.seed, args.ability_model
    )
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(payload, ensure_ascii=False, indent=2))

if __name__ == "__main__":
    main()
