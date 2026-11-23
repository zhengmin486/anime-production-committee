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
    mean = 1.0 + (int(skill) - 50) * 0.001
    spread = max(0.10, 0.40 - int(skill) * 0.003)
    return mean, spread

def work_multiplier(skill, rng):
    mean, spread = performance_parameters(skill)
    return rng.uniform(mean - spread, mean + spread)

def quality_gain(skill, rng, stochastic):
    """Per selected dimension, return an experimental positive increment."""
    if stochastic:
        base_gain = rng.randint(1, 4)
    else:
        base_gain = 2.5
    return max(1, round(base_gain * (0.65 + int(skill) / 100)))

def pick_dimensions(stage, workers, rng, stochastic, tick):
    dimensions = STAGE_DIMENSIONS[stage]
    if not stochastic:
        # Deterministic round-robin control: no random selection or random gain.
        return [dimensions[tick % len(dimensions)]]
    # One dimension is guaranteed; a second may also receive an improvement.
    count = 1 + int(rng.random() < 0.45)
    # Pool weights are derived from the assigned team's relevant abilities.
    weights = []
    for dim in dimensions:
        ability = DIMENSION_ABILITY[dim]
        weights.append(max(1, sum(int(p["abilities"][ability]) for p in workers)))
    chosen = []
    for _ in range(count):
        dim = rng.choices(dimensions, weights=weights, k=1)[0]
        if dim not in chosen:
            chosen.append(dim)
    return chosen

def run_once(people, strategy, workload, deadline, mode, seed, ability_model="multi"):
    rng = random.Random(seed)
    overtime = strategy.endswith("_deadline")
    policy = base.POLICIES["deadline" if overtime else "balanced"]
    fatigue = {p["id"]: int(p.get("fatigue", 0)) for p in people}
    morale = {p["id"]: int(p.get("morale", 80)) for p in people}
    quality = {d: 0 for d in DIMENSIONS}
    total_work = weeks = 0
    stage_weeks = {}
    assignments = {}
    tick = 0

    for stage, ability, _ in base.STAGES:
        remaining = workload
        used = 0
        previous_team = None
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
            previous_team = ids
            coordination = base.coordination_factor(workers) if ability_model == "multi" else 1000
            weekly_work = 0
            for p in workers:
                pid = p["id"]
                skill = base.effective_ability(p, stage, ability, ability_model)
                points = base.production_points(
                    p, ability, morale[pid], fatigue[pid], policy["speed"],
                    stage, ability_model, coordination
                )
                if mode in ("work_only", "work_and_quality"):
                    points = max(0, round(points * work_multiplier(skill, rng)))
                weekly_work += points

                if mode == "work_and_quality":
                    selected = pick_dimensions(stage, workers, rng, True, tick)
                else:
                    selected = pick_dimensions(stage, workers, rng, False, tick)
                for dim in selected:
                    dim_skill = int(p["abilities"][DIMENSION_ABILITY[dim]])
                    # A worker's personal contribution is accumulated independently.
                    quality[dim] = min(100, quality[dim] + quality_gain(
                        dim_skill, rng, mode == "work_and_quality"
                    ))

            gain = min(remaining, weekly_work)
            remaining -= gain
            total_work += gain
            for p in people:
                pid = p["id"]
                if pid in set(ids):
                    fatigue[pid] = min(100, fatigue[pid] + base.FATIGUE_WORK)
                    morale[pid] = max(0, min(100, morale[pid] + policy["morale"] -
                        (base.OVERTIME_MORALE if overtime else 0)))
                else:
                    fatigue[pid] = max(0, fatigue[pid] - base.FATIGUE_REST)
                    morale[pid] = max(0, min(100, morale[pid] + base.REST_MORALE))
            weeks += 1
            used += 1
            tick += 1
            if weekly_work <= 0:
                break
        stage_weeks[stage] = used
        if remaining > 0:
            break

    completed = len(stage_weeks) == len(base.STAGES) and all(
        stage_weeks.get(s, 0) > 0 for s, _, _ in base.STAGES
    ) and total_work >= workload * len(base.STAGES)
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
