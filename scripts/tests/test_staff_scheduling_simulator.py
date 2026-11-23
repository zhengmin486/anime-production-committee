import sys,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import staff_scheduling_simulator as sim
STAFF_FILE=Path(__file__).resolve().parents[1]/"fixtures"/"staff_templates.json"
class SchedulingTests(unittest.TestCase):
 @classmethod
 def setUpClass(cls): cls.people=sim.load_staff(STAFF_FILE)
 def test_loads_all_15_templates(self):
  self.assertEqual(len(self.people),15); self.assertIn("temp_01",{p["id"] for p in self.people})
 def test_all_strategies_respect_deadline(self):
  for s in sim.STRATEGIES:
   r=sim.simulate(s,self.people,{},14); self.assertLessEqual(r.weeks_used,14); self.assertGreaterEqual(r.final_quality,0); self.assertLessEqual(r.final_quality,100)
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
if __name__=="__main__": unittest.main()
