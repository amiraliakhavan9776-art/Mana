import contextlib
import hashlib
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from mana_byte_rnn import load_corpus, train
from evaluate_native_code import benchmark_tasks, evaluate_checkpoint

ROOT = Path(__file__).resolve().parent
CORPUS = ROOT / 'research-corpus.jsonl'
BENCHMARK = ROOT / 'native-code-benchmark.json'


class CodingEvaluationTests(unittest.TestCase):
    def test_only_complete_held_out_families_are_accepted(self):
        _, manifest = load_corpus(CORPUS)
        tasks, _ = benchmark_tasks(BENCHMARK, manifest)
        self.assertEqual({task['group'] for task in tasks}, {'unique', 'clamp', 'even'})
        with tempfile.TemporaryDirectory() as directory:
            file = Path(directory) / 'wrong.json'
            data = json.loads(BENCHMARK.read_text())
            data['tasks'][0]['group'] = 'remaining'
            file.write_text(json.dumps(data))
            with self.assertRaisesRegex(ValueError, 'held-out'):
                benchmark_tasks(file, manifest)
            data = json.loads(BENCHMARK.read_text())
            data['tasks'].pop()
            file.write_text(json.dumps(data))
            with self.assertRaisesRegex(ValueError, 'Incomplete'):
                benchmark_tasks(file, manifest)

    def test_actual_generation_context_excludes_test_answers_and_report_counts_failures(self):
        with tempfile.TemporaryDirectory() as directory, contextlib.redirect_stdout(io.StringIO()):
            root = Path(directory)
            checkpoint, _ = train(CORPUS, root/'train', steps=1, hidden=8, sequence=16)
            requests = []
            def model(checkpoint, request, **kwargs):
                requests.append(request)
                self.assertNotIn('expected', request)
                self.assertNotIn('tests', request)
                return 'def incorrect(x): return 0\n'
            def verifier(candidate, benchmark, **kwargs):
                cases = json.loads(benchmark.read_text())['tests']
                return {'status': 'BENCHMARK_FAILED', 'candidateSha256': hashlib.sha256(candidate.read_bytes()).hexdigest(),
                        'passed': 0, 'total': len(cases), 'results': [{'index': i, 'pass': False} for i in range(len(cases))]}
            # Explicit fixture verifier, not actual OS acceptance evidence.
            with patch('evaluate_native_code.generate', side_effect=model), patch('evaluate_native_code.run_verifier', side_effect=verifier):
                report, file = evaluate_checkpoint(checkpoint, CORPUS, BENCHMARK, root/'evaluation')
            self.assertEqual(report['status'], 'EVALUATION_COMPLETED')
            self.assertEqual(report['passed_tasks'], 0)
            self.assertEqual(report['pass_at_1'], 0)
            self.assertEqual(len(requests), 3)
            self.assertTrue(file.exists())
            self.assertFalse(report['general_coding_acceptance'])

    def test_missing_sandbox_is_blocked_not_a_zero_score_or_claimed_execution(self):
        with tempfile.TemporaryDirectory() as directory, contextlib.redirect_stdout(io.StringIO()):
            root = Path(directory)
            checkpoint, _ = train(CORPUS, root/'train', steps=1, hidden=8, sequence=16)
            with patch('evaluate_native_code.run_verifier', return_value={'status': 'SANDBOX_UNAVAILABLE', 'candidateExecuted': False}):
                report, _ = evaluate_checkpoint(checkpoint, CORPUS, BENCHMARK, root/'evaluation', count=30)
            self.assertEqual(report['status'], 'EVALUATION_BLOCKED_SANDBOX')
            self.assertEqual(report['measured_tasks'], 0)
            self.assertIsNone(report['pass_at_1'])


if __name__ == '__main__':
    unittest.main()
