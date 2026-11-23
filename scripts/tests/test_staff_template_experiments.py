import json
import unittest
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
ABILITIES = {"planning", "direction", "drawing", "animation", "management", "postproduction"}

class StaffTemplateExperimentTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.data = json.loads((ROOT / "scripts/fixtures/staff_template_experiments.json").read_text(encoding="utf-8"))
        cls.rows = cls.data["staff"]

    def test_has_eight_templates_three_samples_each(self):
        counts = Counter(row["meta"]["template_id"] for row in self.rows)
        self.assertEqual(len(counts), 8)
        self.assertEqual(set(counts.values()), {3})
        self.assertEqual(len(self.rows), 24)

    def test_unique_ids_and_six_ability_fields(self):
        ids = [row["staff"]["id"] for row in self.rows]
        self.assertEqual(len(ids), len(set(ids)))
        for row in self.rows:
            self.assertEqual(set(row["staff"]["abilities"]), ABILITIES)
            self.assertEqual(set(row["staff"]["potential"]), ABILITIES)

    def test_abilities_and_potential_are_valid(self):
        for row in self.rows:
            abilities = row["staff"]["abilities"]
            potential = row["staff"]["potential"]
            for key in ABILITIES:
                self.assertGreaterEqual(abilities[key], 0)
                self.assertLessEqual(abilities[key], 100)
                self.assertGreaterEqual(potential[key], abilities[key])
                self.assertLessEqual(potential[key], 100)

    def test_rarity_metadata_matches_ability_sum(self):
        for row in self.rows:
            total = sum(row["staff"]["abilities"].values())
            expected = "N" if total < 240 else "R" if total < 320 else "SR" if total < 400 else "SSR"
            self.assertEqual(row["meta"]["rarity_band"], expected)

    def test_balanced_roster_has_same_headcount_and_all_templates(self):
        data = json.loads((ROOT / "scripts/fixtures/staff_template_experiments_15.json").read_text(encoding="utf-8"))
        self.assertEqual(len(data["staff"]), 15)
        self.assertEqual(len({row["meta"]["template_id"] for row in data["staff"]}), 8)

if __name__ == "__main__":
    unittest.main()
