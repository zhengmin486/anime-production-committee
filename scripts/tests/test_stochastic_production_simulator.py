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

    def test_expected_dimension_probabilities_match_random_draw_mean(self):
        person = self.people[0]
        probabilities = sim.expected_dimension_probabilities("storyboard", person)
        self.assertEqual(set(probabilities), set(sim.STAGE_DIMENSIONS["storyboard"]))
        self.assertTrue(all(0 < value < 1 for value in probabilities.values()))
        self.assertGreater(sum(probabilities.values()), 1.0)
        self.assertLess(sum(probabilities.values()), 1.45)

    def test_quality_randomness_does_not_change_work_random_stream(self):
        work = sim.run_once(self.people, "pair_specialist", 60, 14, "work_only", 314)
        both = sim.run_once(self.people, "pair_specialist", 60, 14, "work_and_quality", 314)
        self.assertEqual(work["weeks"], both["weeks"])
        self.assertEqual(work["total_work"], both["total_work"])

    def test_quality_dimensions_are_bounded_and_randomized(self):
        results = [
            sim.run_once(self.people, "all_staff", 30, 14, "work_and_quality", seed)
            for seed in range(20, 60)
        ]
        self.assertEqual(set(results[0]["quality"]), set(sim.DIMENSIONS))
        for result in results:
            for value in result["quality"].values():
                self.assertGreaterEqual(value, 0)
                self.assertLessEqual(value, 100)
        self.assertGreater(len({r["quality"]["art"] for r in results}), 1)

if __name__ == "__main__":
    unittest.main()
