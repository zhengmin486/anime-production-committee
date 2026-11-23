import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
import staff_scheduling_simulator as base
import stochastic_production_simulator as sim

STAFF_FILE = ROOT / "fixtures" / "staff_templates.json"

class StochasticProductionTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.people = base.load_staff(STAFF_FILE)

    def test_high_skill_has_higher_mean_multiplier(self):
        low, _ = sim.performance_parameters(25)
        high, _ = sim.performance_parameters(85)
        self.assertGreater(high, low)

    def test_high_skill_has_narrower_work_range(self):
        _, low_spread = sim.performance_parameters(25)
        _, high_spread = sim.performance_parameters(85)
        self.assertLess(high_spread, low_spread)

    def test_fixed_mode_is_reproducible(self):
        a = sim.run_once(self.people, "all_staff", 30, 14, "fixed", 123)
        b = sim.run_once(self.people, "all_staff", 30, 14, "fixed", 999)
        self.assertEqual(a, b)

    def test_random_modes_are_seed_reproducible(self):
        a = sim.run_once(self.people, "pair_specialist", 60, 14, "work_and_quality", 123)
        b = sim.run_once(self.people, "pair_specialist", 60, 14, "work_and_quality", 123)
        self.assertEqual(a, b)

    def test_random_work_produces_multiple_outcomes(self):
        values = {
            sim.run_once(self.people, "pair_specialist", 120, 4, "work_only", seed)["total_work"]
            for seed in range(100, 140)
        }
        self.assertGreater(len(values), 1)

    def test_quality_dimensions_are_bounded(self):
        result = sim.run_once(self.people, "all_staff", 60, 14, "work_and_quality", 42)
        self.assertEqual(set(result["quality"]), set(sim.DIMENSIONS))
        for value in result["quality"].values():
            self.assertGreaterEqual(value, 0)
            self.assertLessEqual(value, 100)

if __name__ == "__main__":
    unittest.main()
