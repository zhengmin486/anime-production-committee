#!/usr/bin/env python3
"""Experimental staff scheduler with legacy and multi-ability models."""
import argparse, csv, json
from dataclasses import asdict, dataclass
from pathlib import Path

STAGES=[
    ("script","planning",30),
    ("storyboard","direction",30),
    ("key_animation","drawing",30),
    ("animation_check","animation",30),
    ("postproduction","postproduction",30),
]
# Per-mille weights. The primary skill remains the stage's core craft;
# management contributes where coordination is part of the work.
STAGE_WEIGHTS={
    "script":{"planning":700,"management":300},
    "storyboard":{"direction":800,"management":200},
    "key_animation":{"drawing":800,"animation":200},
    "animation_check":{"animation":700,"drawing":200,"management":100},
    "postproduction":{"postproduction":850,"direction":150},
}
BASE_SPEED,SPECIALTY_FIT,NONSPECIALTY_FIT=9,1200,800
MORALE_BASE,MORALE_SCALE,FATIGUE_PENALTY=600,4,4
FATIGUE_WORK,FATIGUE_REST,REST_MORALE,OVERTIME_MORALE=4,8,10,6
CARRY_OVER_PERMILLE,CARRY_OVER_OFFSET=600,40
QUALITY_WEIGHTS=(150,200,250,200,200)
POLICIES={"balanced":{"speed":1000,"quality":1000,"morale":-2},"deadline":{"speed":1300,"quality":800,"morale":-4}}
STRATEGIES=("solo_specialist","all_staff","pair_specialist","trio_specialist","dynamic_pair","dynamic_trio","all_staff_deadline","dynamic_pair_deadline")
DYNAMIC={"dynamic_pair","dynamic_trio","dynamic_pair_deadline"}
ABILITY_MODELS=("legacy","multi")

def scaled(v,p): return v*p//1000

def load_staff(path):
    data=json.loads(Path(path).read_text(encoding="utf-8"))
    if data.get("schema")!="apc.staff_templates/0.1": raise ValueError("unsupported staff template schema")
    people=[]
    for row in data["staff"]:
        p=dict(row["staff"]); p["specialty"]=row.get("meta",{}).get("specialty")
        if not p["specialty"]: raise ValueError(f"missing meta.specialty for {p['id']}")
        if len(p["abilities"])!=6: raise ValueError(f"invalid abilities for {p['id']}")
        people.append(p)
    if len({p["id"] for p in people})!=len(people): raise ValueError("duplicate staff id")
    return people

def effective_ability(p,stage,primary,ability_model):
    if ability_model=="legacy": return int(p["abilities"][primary])
    weights=STAGE_WEIGHTS[stage]
    return sum(int(p["abilities"][key])*weight for key,weight in weights.items())//1000

def coordination_factor(workers):
    """Team coordination: +/-10% around management 50, only for teams."""
    if len(workers)<2: return 1000
    avg=sum(int(p["abilities"]["management"]) for p in workers)//len(workers)
    return max(900,min(1100,1000+(avg-50)*2))

def production_points(p,ability,morale,fatigue,policy_speed=1000,stage=None,ability_model="legacy",coordination=1000):
    skill=effective_ability(p,stage,ability,ability_model) if stage else int(p["abilities"][ability])
    fit=SPECIALTY_FIT if p["specialty"]==ability else NONSPECIALTY_FIT
    speed=BASE_SPEED*skill*10
    speed=scaled(speed,fit)
    speed=scaled(speed,policy_speed)
    speed=scaled(speed,MORALE_BASE+MORALE_SCALE*morale)
    speed=scaled(speed,1000-FATIGUE_PENALTY*fatigue)
    speed=scaled(speed,coordination)
    return speed//1000

def choose(strategy,stage,ability,people,morale,fatigue,policy_speed=1000,ability_model="legacy"):
    ranked=sorted(people,key=lambda p:(production_points(p,ability,morale[p["id"]],fatigue[p["id"]],policy_speed,stage,ability_model),p["id"]),reverse=True)
    count=1 if strategy=="solo_specialist" else len(ranked) if strategy in ("all_staff","all_staff_deadline") else 3 if strategy in ("trio_specialist","dynamic_trio") else 2
    return ranked[:count]

@dataclass
class Result:
    strategy:str; ability_model:str; completed:bool; outcome:str; weeks_used:int; deadline_weeks:int
    total_work:int; final_quality:int; stage_weeks:dict; stage_quality:dict
    staff_fatigue:dict; staff_morale:dict; staff_usage_weeks:dict
    stage_worker_changes:dict; weekly_assignments:dict

def simulate(strategy,people,workloads,deadline,ability_model="legacy"):
    if strategy not in STRATEGIES: raise ValueError(f"unknown strategy: {strategy}")
    if ability_model not in ABILITY_MODELS: raise ValueError(f"unknown ability model: {ability_model}")
    overtime=strategy.endswith("_deadline")
    policy=POLICIES["deadline" if overtime else "balanced"]
    fatigue={p["id"]:int(p.get("fatigue",0)) for p in people}
    morale={p["id"]:int(p.get("morale",80)) for p in people}
    usage={p["id"]:0 for p in people}
    stage_weeks={}; stage_quality={}; stage_changes={}; logs={}; total=weeks=0
    for ix,(stage,ability,default) in enumerate(STAGES):
        remaining=int(workloads.get(stage,default)); done=quality_value=0
        start=weeks; changes=0; previous_team=None; logs[stage]=[]
        fixed=None if strategy in DYNAMIC else choose(strategy,stage,ability,people,morale,fatigue,policy["speed"],ability_model)
        while remaining>0 and weeks<deadline:
            workers=choose(strategy,stage,ability,people,morale,fatigue,policy["speed"],ability_model) if fixed is None else fixed
            ids=[p["id"] for p in workers]; idset=set(ids)
            if previous_team is not None and idset!=previous_team: changes+=1
            previous_team=idset; logs[stage].append(ids)
            work=qsum=0
            coordination=coordination_factor(workers) if ability_model=="multi" else 1000
            for p in workers:
                pid=p["id"]
                points=production_points(p,ability,morale[pid],fatigue[pid],policy["speed"],stage,ability_model,coordination)
                skill=effective_ability(p,stage,ability,ability_model)
                fit=SPECIALTY_FIT if p["specialty"]==ability else NONSPECIALTY_FIT
                item_q=max(0,min(100,scaled(scaled(skill,fit),policy["quality"])))
                work+=points; qsum+=points*item_q; usage[pid]+=1
            gain=min(remaining,work)
            if gain>0 and work>0:
                weekly_q=qsum//work
                quality_value=(quality_value*done+gain*weekly_q)//(done+gain)
                done+=gain; remaining-=gain; total+=gain
                if ix>0:
                    prev=stage_quality[STAGES[ix-1][0]]
                    quality_value=min(quality_value,prev*CARRY_OVER_PERMILLE//1000+CARRY_OVER_OFFSET)
            for p in people:
                pid=p["id"]
                if pid in idset:
                    fatigue[pid]=min(100,fatigue[pid]+FATIGUE_WORK)
                    morale[pid]=max(0,min(100,morale[pid]+policy["morale"]-(OVERTIME_MORALE if overtime else 0)))
                else:
                    fatigue[pid]=max(0,fatigue[pid]-FATIGUE_REST)
                    morale[pid]=max(0,min(100,morale[pid]+REST_MORALE))
            weeks+=1
            if work<=0: break
        stage_weeks[stage]=weeks-start; stage_changes[stage]=changes; stage_quality[stage]=quality_value
        if remaining>0: break
    target=sum(int(workloads.get(s,w)) for s,_,w in STAGES)
    completed=total==target and len(stage_quality)==len(STAGES)
    final_quality=sum(stage_quality.get(s,0)*weight for (s,_,_),weight in zip(STAGES,QUALITY_WEIGHTS))//1000
    outcome="normal" if completed else ("low" if total>=target*.5 else "breach")
    return Result(strategy,ability_model,completed,outcome,weeks,deadline,total,final_quality,stage_weeks,stage_quality,fatigue,morale,usage,stage_changes,logs)

def main():
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--staff-file",type=Path,default=Path("scripts/fixtures/staff_templates.json"))
    ap.add_argument("--deadline",type=int,default=14)
    ap.add_argument("--workloads",default="30,60,90,120")
    ap.add_argument("--ability-model",choices=ABILITY_MODELS,default="both")
    ap.add_argument("--out",type=Path,default=Path("simulation-output/staff-scheduling"))
    a=ap.parse_args(); people=load_staff(a.staff_file)
    values=[int(x) for x in a.workloads.split(",") if x.strip()]
    if not values or any(x<1 for x in values): ap.error("--workloads must contain positive integers")
    models=ABILITY_MODELS if a.ability_model=="both" else (a.ability_model,)
    a.out.mkdir(parents=True,exist_ok=True); experiments=[]
    for model in models:
        for workload in values:
            workloads={s:workload for s,_,_ in STAGES}
            experiments.append({"ability_model":model,"workload_per_stage":workload,
                "results":[asdict(simulate(s,people,workloads,a.deadline,model)) for s in STRATEGIES]})
    payload={"model":"staff-scheduling-v0.3","staff_source":str(a.staff_file),"staff_count":len(people),
      "staff_ids":[p["id"] for p in people],"notice":"Experimental scheduling model; not formal game balance.",
      "ability_models":{"legacy":"single primary ability; retained as control","multi":"stage weighted abilities plus team management coordination"},
      "stage_weights":STAGE_WEIGHTS,
      "assumptions":{"deadline_weeks":a.deadline,"no_parallel_stages":True,"traits_and_potential_not_applied":True,
      "temporary_staff_fees_not_in_cashflow":True,"weekly_assignments_recorded":True,
      "management_coordination":"team average management; 0.9x-1.1x speed multiplier; solo teams receive no coordination modifier"},
      "experiments":experiments}
    (a.out/"summary.json").write_text(json.dumps(payload,ensure_ascii=False,indent=2),encoding="utf-8")
    with (a.out/"summary.csv").open("w",newline="",encoding="utf-8-sig") as f:
        cols=["ability_model","workload_per_stage","strategy","completed","weeks_used","total_work","final_quality","total_worker_changes"]
        w=csv.DictWriter(f,fieldnames=cols); w.writeheader()
        for e in experiments:
            for r in e["results"]:
                w.writerow({"ability_model":e["ability_model"],"workload_per_stage":e["workload_per_stage"],"strategy":r["strategy"],"completed":r["completed"],
                  "weeks_used":r["weeks_used"],"total_work":r["total_work"],"final_quality":r["final_quality"],
                  "total_worker_changes":sum(r["stage_worker_changes"].values())})
    print(json.dumps(payload,ensure_ascii=False,indent=2))
if __name__=="__main__": main()
