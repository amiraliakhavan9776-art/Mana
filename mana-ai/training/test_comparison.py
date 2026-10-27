import json
from pathlib import Path
import tempfile
import unittest

from compare_coding_reports import compare


def report(outcomes, weights):
    tasks = []
    for index, cases in enumerate(outcomes):
        passed = all(cases)
        tasks.append({'id': str(index), 'group': str(index), 'candidate_sha256': 'c'*64,
                      'passed': passed, 'receipt': {'candidateSha256': 'c'*64,
                      'status': 'BENCHMARK_PASSED_AWAITING_REVIEW' if passed else 'BENCHMARK_FAILED',
                      'policy': 'fixture-policy', 'filterSha256': 'd'*64,
                      'total': len(cases), 'passed': sum(cases),
                      'results': [{'index': i, 'pass': value} for i, value in enumerate(cases)]}})
    return {'schema': 'MANA_NATIVE_CODING_EVALUATION_V1', 'status': 'EVALUATION_COMPLETED',
            'tasks': tasks, 'required_tasks': len(tasks), 'measured_tasks': len(tasks),
            'passed_tasks': sum(task['passed'] for task in tasks), 'checkpoint_weights_sha256': weights,
            'benchmark_sha256': 'a'*64, 'corpus_sha256': 'b'*64, 'generation_seed': 73,
            'maximum_generated_bytes': 500, 'attempts_per_task': 1}


class ComparisonTests(unittest.TestCase):
    def run_comparison(self, old, new):
        with tempfile.TemporaryDirectory() as directory:
            paths = [Path(directory)/'old.json', Path(directory)/'new.json']
            for file, value in zip(paths, [old, new]):
                file.write_text(json.dumps(value))
            return compare(*paths)

    def test_gain_requires_review_and_never_deletes(self):
        result = self.run_comparison(report([[False]*3], '1'*64), report([[True]*3], '2'*64))
        self.assertEqual(result['status'], 'IMPROVED_REQUIRES_REVIEW')
        self.assertFalse(result['deletion_allowed'])
        self.assertFalse(result['promotion_allowed'])

    def test_partial_case_loss_blocks_other_task_gain(self):
        old = report([[True, False, False], [False]*3], '1'*64)
        new = report([[False]*3, [True]*3], '2'*64)
        result = self.run_comparison(old, new)
        self.assertEqual(result['status'], 'REGRESSION_REJECTED')
        self.assertEqual(result['case_regressions'], [{'task': '0', 'index': 0}])

    def test_unmeasured_different_policy_and_forged_indexes_refused(self):
        old = report([[False]*3], '1'*64)
        for mutation in ['incomplete', 'policy', 'index']:
            new = report([[True]*3], '2'*64)
            if mutation == 'incomplete':
                new['status'] = 'EVALUATION_BLOCKED_SANDBOX'
            elif mutation == 'policy':
                new['tasks'][0]['receipt']['policy'] = 'other'
            else:
                new['tasks'][0]['receipt']['results'][0]['index'] = 1
            with self.assertRaises(ValueError):
                self.run_comparison(old, new)

    def test_same_weights_and_changed_benchmark_refused(self):
        old = report([[False]*3], '1'*64)
        with self.assertRaises(ValueError):
            self.run_comparison(old, report([[True]*3], '1'*64))
        new = report([[True]*3], '2'*64)
        new['benchmark_sha256'] = 'e'*64
        with self.assertRaises(ValueError):
            self.run_comparison(old, new)


if __name__ == '__main__':
    unittest.main()
