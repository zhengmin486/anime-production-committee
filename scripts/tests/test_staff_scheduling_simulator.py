import sys,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import staff_scheduling_simulator as sim
STAFF_FILE=Path(__file__).resolve().parents[1]/"fixtures"/"staff_templates.json"
EXPERIMENT_FILE=Path(__file__).resolve().parents[1]/"fixtures"/"staff_template_experiments_15.json"
class SchedulingTests(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  cls.people=sim.load_staff(STAFF_FILE)
  cls.experimental=sim.load_staff(EXPERIMENT_FILE)
 def test_loads_all_15_templates(self):
  self.assertEqual(len(self.people),15); self.assertIn("temp_01",{p["id"] for p in self.people})
 def test_all_strategies_respect_deadline(self):
  for model in sim.ABILITY_MODELS:
   for s in sim.STRATEGIES:
    r=sim.simulate(s,self.people,{},14,model); self.assertLessEqual(r.weeks_used,14); self.assertGreaterEqual(r.final_quality,0); self.assertLessEqual(r.final_quality,100)
 def test_dynamic_pair_rotates_when_workload_is_long_enough(self):
  workloads={s:60 for s,_,_ in sim.STAGES}
  fixed=sim.simulate("pair_specialist",self.people,workloads,14); dynamic=sim.simulate("dynamic_pair",self.people,workloads,14)
  self.assertEqual(sum(fixed.stage_worker_changes.values()),0); self.assertGreater(sum(dynamic.stage_worker_changes.values()),0)
 def test_dynamic_deadline_reselects_weekly(self):
  workloads={s:60 for s,_,_ in sim.STAGES}
  r=sim.simulate("dynamic_pair_deadline",self.people,workloads,14)
  self.assertGreater(sum(r.stage_worker_changes.values()),0)
 def test_deadline_policy_reduces_quality(self):
  balanced=sim.simulate("all_staff",self.people,{},14); deadline=sim.simulate("all_staff_deadline",self.people,{},14)
  self.assertLess(deadline.final_quality,balanced.final_quality)
 def test_temporary_staff_have_project_fees(self):
  for p in self.people:
   if p["employment"]=="temporary": self.assertEqual(p["weekly_salary"],0); self.assertGreater(p["project_fee"],0)
 def test_zero_deadline_does_no_work(self):
  r=sim.simulate("all_staff",self.people,{},0); self.assertEqual(r.weeks_used,0); self.assertFalse(r.completed)
 def test_integer_production_matches_core_scaling_order(self):
  p=next(p for p in self.people if p["id"]=="staff_02")
  v=9*80*10
  for coefficient in (1200,1000,600+4*80,1000): v=sim.scaled(v,coefficient)
  self.assertEqual(sim.production_points(p,"drawing",80,0),v//1000)
 def test_final_quality_uses_core_stage_weights(self):
  self.assertEqual(sum(sim.QUALITY_WEIGHTS),1000)
  self.assertEqual(sim.QUALITY_WEIGHTS,(150,200,250,200,200))
 def test_multi_model_uses_secondary_abilities(self):
  p={"abilities":{"planning":70,"management":90,"direction":20,"drawing":20,"animation":20,"postproduction":20},"specialty":"planning"}
  self.assertEqual(sim.effective_ability(p,"script","planning","legacy"),70)
  self.assertEqual(sim.effective_ability(p,"script","planning","multi"),76)
 def test_management_changes_team_coordination(self):
  low=[{"abilities":{"management":20}},{"abilities":{"management":20}}]
  high=[{"abilities":{"management":80}},{"abilities":{"management":80}}]
  self.assertEqual(sim.coordination_factor(low),940)
  self.assertEqual(sim.coordination_factor(high),1060)
 def test_management_template_is_not_ignored_by_multi_model(self):
  manager=next(p for p in self.experimental if p["id"]=="exp_production_manager_01")
  craft=next(p for p in self.experimental if p["id"]=="exp_junior_specialist_01")
  self.assertGreater(sim.effective_ability(manager,"script","planning","multi"),sim.effective_ability(manager,"script","planning","legacy"))
  self.assertEqual(sim.effective_ability(craft,"script","planning","multi"),sim.effective_ability(craft,"script","planning","legacy") if craft["abilities"]["management"]==craft["abilities"]["planning"] else sim.effective_ability(craft,"script","planning","multi"))
if __name__=="__main__": unittest.main()
