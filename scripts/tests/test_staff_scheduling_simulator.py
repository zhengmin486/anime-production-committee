import sys, unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import staff_scheduling_simulator as sim
STAFF_FILE=Path("scripts/fixtures/staff_templates.json")
class SchedulingTests(unittest.TestCase):
 @classmethod
 def setUpClass(cls): cls.people=sim.load_staff(STAFF_FILE)
 def test_loads_all_15_templates(self): self.assertEqual(len(self.people),15); self.assertIn("temp_01",{p["id"] for p in self.people})
 def test_all_strategies_respect_deadline(self):
  for s in sim.STRATEGIES:
   r=sim.simulate(s,self.people,{},14); self.assertLessEqual(r.weeks_used,14); self.assertGreaterEqual(r.final_quality,0); self.assertLessEqual(r.final_quality,100)
 def test_dynamic_pair_reselects_after_fatigue(self):
  m={p["id"]:80 for p in self.people}; f={p["id"]:0 for p in self.people}; tired=dict(f); tired["temp_01"]=100
  before=[p["id"] for p in sim.choose("dynamic_pair","drawing",self.people,m,f)]
  after=[p["id"] for p in sim.choose("dynamic_pair","drawing",self.people,m,tired)]
  self.assertNotEqual(before,after)
 def test_temporary_staff_have_project_fees(self):
  for p in self.people:
   if p["employment"]=="temporary": self.assertEqual(p["weekly_salary"],0); self.assertGreater(p["project_fee"],0)
 def test_zero_deadline_does_no_work(self):
  r=sim.simulate("all_staff",self.people,{},0); self.assertEqual(r.weeks_used,0); self.assertFalse(r.completed)
if __name__=="__main__": unittest.main()
