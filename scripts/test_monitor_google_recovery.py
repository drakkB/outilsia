#!/usr/bin/env python3

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from monitor_google_recovery import recovery_percent, recovery_status


class GoogleRecoveryTests(unittest.TestCase):
    def test_trough_is_zero_percent(self):
        self.assertEqual(recovery_percent(20, 20, 100), 0.0)

    def test_baseline_is_one_hundred_percent(self):
        self.assertEqual(recovery_percent(100, 20, 100), 100.0)

    def test_below_trough_is_negative(self):
        self.assertEqual(recovery_percent(12, 20, 100), -10.0)

    def test_partial_recovery(self):
        self.assertEqual(recovery_percent(60, 20, 100), 50.0)

    def test_status_boundaries(self):
        self.assertEqual(recovery_status(-11)[0], "aggravation")
        self.assertEqual(recovery_status(0)[0], "point bas")
        self.assertEqual(recovery_status(25)[0], "reprise fragile")
        self.assertEqual(recovery_status(70)[0], "reprise nette")
        self.assertEqual(recovery_status(100)[0], "niveau retrouve")


if __name__ == "__main__":
    unittest.main()
