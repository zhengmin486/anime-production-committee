#!/usr/bin/env python3
"""Experimental deterministic staff scheduler. Input: apc.staff_templates/0.1 JSON."""
import argparse, csv, json
from dataclasses import asdict, dataclass
from pathlib import Path

STAGES=[("script","planning",30),("storyboard","direction",30),("key_animation","drawing",30),("animation_check","animation",30),("postproduction","postproduction",30)]
# Coefficients copied from packages/game-core/include/game_rules.hpp.
BASE_SPEED,SPECIALTY_FIT,NONSPECIALTY_FIT=9,1200,800
MORALE_BASE,MORALE_SCALE,FATIGUE_PENALTY=600,4,4
FATIGUE_WORK,FATIGUE_REST,REST_MORALE,OVERTIME_MORALE=4,8,10,6
CARRY_OVER_PERMILLE,CARRY_OVER_OFFSET=600,40
POLICIES={"balanced":(1000,-2),"deadline":(1300,-4)}
STRATEGIES=("solo_specialist","all_staff","pair_specialist","trio_specialist","dynamic_pair","dynamic_trio","all_staff_deadline","dynamic_pair_deadline")

@dataclass
class Result:
    strategy:str; completed:bool; outcome:str; weeks_used:int; deadline_weeks:int
    total_work:int; final_quality:float; stage_weeks:dict; stage_quality:dict
    staff_fatigue:dict; staff_morale:dict; staff_usage_weeks:dict

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

def speed(p,ability,morale,fatigue):
    fit=SPECIALTY_FIT if p["specialty"]==ability else NONSPECIALTY_FIT
    raw=scaled(BASE_SPEED*p["abilities"][ability]*10,fit)
    return scaled(raw,MORALE_BASE+MORALE_SCALE*morale)*(1000-FATIGUE_PENALTY*fatigue)//1000000

def choose(strategy,ability,people,morale,fatigue):
    ranked=sorted(people,key=lambda p:(speed(p,ability,morale[p["id"]],fatigue[p["id"]]),p["id"]),reverse=True)
    if strategy=="solo_specialist": return ranked[:1]
    if strategy in ("all_staff","all_staff_deadline"): return ranked
    return ranked[:(3 if strategy in ("trio_specialist","dynamic_trio") else 2)]

def simulate(strategy,people,workloads,deadline):
    overtime=strategy.endswith("_deadline"); policy_speed,policy_morale=POLICIES["deadline" if overtime else "balanced"]
    fatigue={p["id"]:int(p.get("fatigue",0)) for p in people}; morale={p["id"]:int(p.get("morale",80)) for p in people}
    usage={p["id"]:0 for p in people}; stage_weeks={}; stage_quality={}; total=weeks=0
    for ix,(stage,ability,default) in enumerate(STAGES):
        remaining=int(workloads.get(stage,default)); qsum=0; qwork=0; start=weeks
        # Fixed strategies lock a team for the whole stage; dynamic strategies re-rank weekly.
        fixed_team=None if strategy in ("dynamic_pair","dynamic_trio") else choose(strategy,ability,people,morale,fatigue)
        while remaining>0 and weeks<deadline:
            workers=choose(strategy,ability,people,morale,fatigue) if fixed_team is None else fixed_team
            ids={p["id"] for p in workers}; work=quality=0
            for p in workers:
                points=speed(p,ability,morale[p["id"]],fatigue[p["id"]])*policy_speed//1000
                fit=SPECIALTY_FIT if p["specialty"]==ability else NONSPECIALTY_FIT
                item_q=max(0,min(100,scaled(p["abilities"][ability],fit)))
                work+=points; quality+=points*item_q; usage[p["id"]]+=1
            gain=min(remaining,work)
            if gain and work: qsum+=gain*quality/work; qwork+=gain; remaining-=gain; total+=gain
            for p in people:
                pid=p["id"]
                if pid in ids:
                    fatigue[pid]=min(100,fatigue[pid]+FATIGUE_WORK)
                    morale[pid]=max(0,min(100,morale[pid]+policy_morale-(OVERTIME_MORALE if overtime else 0)))
                else:
                    fatigue[pid]=max(0,fatigue[pid]-FATIGUE_REST); morale[pid]=max(0,min(100,morale[pid]+REST_MORALE))
            weeks+=1
            if work<=0: break
        stage_weeks[stage]=weeks-start; q=qsum/max(1,qwork)
        if ix: q=min(q,stage_quality[STAGES[ix-1][0]]*CARRY_OVER_PERMILLE/1000+CARRY_OVER_OFFSET)
        stage_quality[stage]=round(q,2)
        if remaining>0: break
    target=sum(int(workloads.get(s,w)) for s,_,w in STAGES)
    done=total==target and len(stage_quality)==len(STAGES)
    avg=sum(stage_quality.get(s,0)*int(workloads.get(s,w)) for s,_,w in STAGES)/max(1,target)
    outcome="normal" if done else ("low" if total>=target*.5 else "breach")
    return Result(strategy,done,outcome,weeks,deadline,total,round(avg,2),stage_weeks,stage_quality,fatigue,morale,usage)

def main():
    ap=argparse.ArgumentParser(); ap.add_argument("--staff-file",type=Path,default=Path("scripts/fixtures/staff_templates.json"))
    ap.add_argument("--deadline",type=int,default=14); ap.add_argument("--workload",type=int,default=30)
    ap.add_argument("--out",type=Path,default=Path("simulation-output/staff-scheduling")); a=ap.parse_args()
    people=load_staff(a.staff_file); workloads={s:a.workload for s,_,_ in STAGES}
    results=[simulate(s,people,workloads,a.deadline) for s in STRATEGIES]; a.out.mkdir(parents=True,exist_ok=True)
    payload={"model":"staff-scheduling-v0.1","staff_source":str(a.staff_file),"staff_count":len(people),
      "staff_ids":[p["id"] for p in people],"notice":"Experimental scheduling model; not formal game balance.",
      "assumptions":{"workload_per_stage":a.workload,"deadline_weeks":a.deadline,"no_parallel_stages":True,
      "traits_and_potential_not_applied":True,"temporary_staff_fees_not_in_cashflow":True},"results":[asdict(x) for x in results]}
    (a.out/"summary.json").write_text(json.dumps(payload,ensure_ascii=False,indent=2),encoding="utf-8")
    with (a.out/"summary.csv").open("w",newline="",encoding="utf-8-sig") as f:
        cols=["strategy","completed","outcome","weeks_used","total_work","final_quality"]; w=csv.DictWriter(f,fieldnames=cols); w.writeheader()
        for r in results: w.writerow({k:getattr(r,k) for k in cols})
    print(json.dumps(payload,ensure_ascii=False,indent=2))
if __name__=="__main__": main()
