import contextlib
import io
import json
import subprocess
from pathlib import Path
import tempfile
import unittest

import numpy as np
from mana_byte_rnn import (initialize, loss_gradient, train, load_checkpoint,
                           load_corpus, generate)

CORPUS = Path(__file__).with_name('research-corpus.jsonl')


class TrainingTests(unittest.TestCase):
    def test_reviewed_feedback_export_reaches_real_trainer(self):
        # Synthetic host authority fixture only; never an approval of company data.
        root = Path(__file__).resolve().parents[2]
        script = """
const fs=require('node:fs');
const {createTrainingFeedbackExporter}=require('./mana-ai/src/native/training-feedback.cjs');
const {payloadDigest}=require('./mana-ai/src/approval-store.cjs');
const rows=fs.readFileSync('./mana-ai/training/research-corpus.jsonl','utf8').trim().split('\\n').map(JSON.parse);
const records=rows.map(r=>({id:r.id,group:r.group,request:r.request,code:r.code,organizationId:'fixture-org',projectId:'fixture-project',requesterId:'fixture-requester',reviewerId:'fixture-reviewer',consentId:'synthetic-consent',reviewId:'synthetic-review',privacyReviewId:'synthetic-privacy',rightsRef:r.source}));
const trusted=new Set(records.map(payloadDigest));
const exporter=createTrainingFeedbackExporter({authorize:()=>true,verifyReview:({digest})=>trusted.has(digest)});
process.stdout.write(exporter.export({principal:{id:'fixture-exporter',orgId:'fixture-org',role:'analyst',projectIds:['fixture-project'],capabilityIds:['native.training.export']},project:{id:'fixture-project',orgId:'fixture-org'},records}).jsonl);
"""
        result = subprocess.run(['node', '-e', script], cwd=root, capture_output=True, text=True, check=True, timeout=10)
        with tempfile.TemporaryDirectory() as directory, contextlib.redirect_stdout(io.StringIO()):
            corpus = Path(directory)/'reviewed.jsonl'
            corpus.write_text(result.stdout)
            _, manifest = load_corpus(corpus)
            self.assertEqual(manifest['records'], 36)
            checkpoint, report = train(corpus, Path(directory)/'run', steps=3, hidden=8, sequence=16)
            self.assertTrue(checkpoint.is_dir())
            self.assertEqual(report['step'], 3)
            self.assertFalse(report['general_coding_acceptance'])

    def test_gradients_against_finite_differences(self):
        params, _, _ = initialize(8, 1)
        inputs, targets = [1, 7, 1, 2], [7, 1, 2, 3]
        _, grads = loss_gradient(params, inputs, targets)
        for name, index in [('xh', (2, 1)), ('hh', (1, 2)), ('hy', (3, 2)), ('bh', (2,)), ('by', (3,))]:
            original = params[name][index]
            params[name][index] = original + 1e-5
            plus = loss_gradient(params, inputs, targets, False)
            params[name][index] = original - 1e-5
            minus = loss_gradient(params, inputs, targets, False)
            params[name][index] = original
            self.assertAlmostEqual(grads[name][index], (plus - minus) / 2e-5, places=7)

    def test_group_split_rights_and_cross_family_duplicates(self):
        _, manifest = load_corpus(CORPUS)
        self.assertEqual(set(manifest['groups'].values()), {'train', 'validation', 'test'})
        self.assertEqual(manifest['records'], 36)
        with tempfile.TemporaryDirectory() as directory:
            file = Path(directory) / 'bad.jsonl'
            rows = [json.loads(line) for line in CORPUS.read_text().splitlines()]
            rows[0]['training_allowed'] = False
            file.write_text('\n'.join(map(json.dumps, rows)))
            with self.assertRaises(ValueError):
                load_corpus(file)
            rows[0]['training_allowed'] = True
            rows[3]['code'] = rows[0]['code']
            file.write_text('\n'.join(map(json.dumps, rows)))
            with self.assertRaisesRegex(ValueError, 'Cross-group'):
                load_corpus(file)

    def test_real_updates_and_exact_interrupted_resume(self):
        with tempfile.TemporaryDirectory() as directory, contextlib.redirect_stdout(io.StringIO()):
            base = Path(directory)
            kwargs = dict(corpus=CORPUS, hidden=8, sequence=16, seed=4, learning_rate=.02)
            whole, _ = train(output=base/'whole', steps=8, **kwargs)
            part, _ = train(output=base/'parts', steps=3, **kwargs)
            continued, report = train(output=base/'parts', steps=5, resume=part, **kwargs)
            a, ma, ra, _ = load_checkpoint(whole)
            b, mb, rb, _ = load_checkpoint(continued)
            original, _, _ = initialize(8, 4)
            for name in a:
                np.testing.assert_array_equal(a[name], b[name])
                np.testing.assert_array_equal(ma[name], mb[name])
            self.assertNotEqual(a['xh'].tobytes(), original['xh'].tobytes())
            self.assertEqual(ra.bit_generator.state, rb.bit_generator.state)
            self.assertEqual(report['step'], 8)
            self.assertFalse(report['pretrained_weights'])
            self.assertFalse(report['general_coding_acceptance'])
            self.assertIsInstance(generate(continued, 'یک تابع بنویس', 20), str)

    def test_corruption_and_resume_configuration_refused(self):
        with tempfile.TemporaryDirectory() as directory, contextlib.redirect_stdout(io.StringIO()):
            base = Path(directory)
            checkpoint, _ = train(CORPUS, base/'run', steps=2, hidden=8, sequence=16)
            with self.assertRaisesRegex(ValueError, 'config'):
                train(CORPUS, base/'run', steps=1, hidden=8, sequence=32, resume=checkpoint)
            file = checkpoint/'weights.npz'
            data = bytearray(file.read_bytes())
            data[-8] ^= 1
            file.write_bytes(data)
            with self.assertRaisesRegex(ValueError, 'integrity'):
                load_checkpoint(checkpoint)

    def test_workspace_mode_and_concurrent_training_refused(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)/'run'
            root.mkdir(mode=0o755)
            root.chmod(0o755)  # Explicit despite restrictive caller umask.
            with self.assertRaisesRegex(ValueError, 'Private'):
                train(CORPUS, root, steps=1)
            root.chmod(0o700)
            (root/'training.lock').mkdir()
            with self.assertRaises(FileExistsError):
                train(CORPUS, root, steps=1)


if __name__ == '__main__':
    unittest.main()
