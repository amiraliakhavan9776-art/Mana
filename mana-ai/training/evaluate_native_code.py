"""Measure actual MANA checkpoint code output against independent sandbox tests.

No reference code, expected results or benchmark inputs are passed to the model.
This writes candidates, never imports or executes them in this Python process.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess

from mana_byte_rnn import (load_checkpoint, load_corpus, generate, strict_json,
                           read_regular, private_directory)


def benchmark_tasks(file, manifest):
    raw = read_regular(file, 256000)
    benchmark = strict_json(raw.decode('utf-8'))
    if not isinstance(benchmark, dict) or set(benchmark) != {'schema', 'scope', 'tasks'} or benchmark['schema'] != 'MANA_NATIVE_CODE_BENCHMARK_V1':
        raise ValueError('Versioned trusted benchmark required')
    tasks = benchmark['tasks']
    if not isinstance(tasks, list) or not 1 <= len(tasks) <= 32:
        raise ValueError('Benchmark task bound')
    ids, groups = set(), set()
    for task in tasks:
        if not isinstance(task, dict) or set(task) != {'id', 'group', 'request', 'functionName', 'tests'}:
            raise ValueError('Invalid task contract')
        if not isinstance(task['id'], str) or not re.fullmatch(r'[a-z][a-z0-9_-]{0,59}', task['id']) or task['id'] in ids:
            raise ValueError('Unique bounded task IDs required')
        ids.add(task['id'])
        if manifest['groups'].get(task['group']) != 'test':
            raise ValueError('Benchmark must use held-out test families only')
        groups.add(task['group'])
        if not isinstance(task['request'], str) or not 10 <= len(task['request']) <= 4000 or not isinstance(task['functionName'], str) or not re.fullmatch(r'[a-z][a-z0-9_]{0,39}', task['functionName']):
            raise ValueError('Bounded request/function required')
        if not isinstance(task['tests'], list) or not 3 <= len(task['tests']) <= 32:
            raise ValueError('Independent test cases required')
        for case in task['tests']:
            if not isinstance(case, dict) or set(case) != {'input', 'expected'} or len(json.dumps(case).encode()) > 8192:
                raise ValueError('Bounded input/expected pair required')
    expected_groups = {group for group, split in manifest['groups'].items() if split == 'test'}
    if groups != expected_groups:
        raise ValueError('Incomplete held-out family coverage')
    return tasks, hashlib.sha256(raw).hexdigest()


def run_verifier(candidate, benchmark, node='node'):
    script = Path(__file__).resolve().parents[1] / 'evaluate-code-file.cjs'
    result = subprocess.run([node, str(script), str(candidate.resolve()), str(benchmark.resolve())],
                            capture_output=True, text=True, timeout=180)
    if result.returncode != 0 or len(result.stdout.encode()) > 100000:
        raise ValueError('Independent sandbox verifier unavailable/refused')
    return strict_json(result.stdout)


def evaluate_checkpoint(checkpoint, corpus, benchmark, output, count=500, seed=73, node='node'):
    if not 1 <= count <= 1000 or not isinstance(seed, int):
        raise ValueError('Generation budget')
    _, _, _, metadata = load_checkpoint(checkpoint)
    _, manifest = load_corpus(corpus)
    if metadata['manifest'] != manifest:
        raise ValueError('Checkpoint corpus provenance mismatch')
    tasks, benchmark_sha = benchmark_tasks(benchmark, manifest)
    root = private_directory(output)
    lock = root / 'evaluation.lock'
    lock.mkdir(mode=0o700)
    report_file = root / 'evaluation.json'
    try:
        if report_file.exists():
            raise ValueError('Immutable report exists; use a new evaluation directory')
        report = {'schema': 'MANA_NATIVE_CODING_EVALUATION_V1',
                  'checkpoint_weights_sha256': metadata['weights_sha256'],
                  'checkpoint_step': metadata['step'], 'benchmark_sha256': benchmark_sha,
                  'corpus_sha256': manifest['corpus_sha256'], 'generation_seed': seed,
                  'maximum_generated_bytes': count, 'provider': 'MANA_RANDOM_INITIALIZED_BYTE_RNN',
                  'pretrained_weights': False, 'attempts_per_task': 1, 'tasks': [],
                  'status': 'EVALUATION_INCOMPLETE', 'general_coding_acceptance': False,
                  'production_deployment_allowed': False}
        for index, task in enumerate(tasks):
            # Only the request enters generation, never answers or test cases.
            source = generate(checkpoint, task['request'], count=count, seed=seed + index)
            candidate = root / (task['id'] + '.py')
            fd = os.open(candidate, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
            try:
                os.write(fd, source.encode('utf-8'))
                os.fsync(fd)
            finally:
                os.close(fd)
            case_file = root / (task['id'] + '.benchmark.json')
            with case_file.open('x') as stream:
                json.dump({key: task[key] for key in ['functionName', 'tests']}, stream, ensure_ascii=False)
            case_file.chmod(0o600)
            receipt = run_verifier(candidate, case_file, node=node)
            if receipt.get('status') == 'SANDBOX_UNAVAILABLE':
                report['status'] = 'EVALUATION_BLOCKED_SANDBOX'
                break
            expected_hash = hashlib.sha256(candidate.read_bytes()).hexdigest()
            if receipt.get('candidateSha256') != expected_hash or receipt.get('total') != len(task['tests']) or not isinstance(receipt.get('results'), list) or len(receipt['results']) != len(task['tests']) or receipt.get('passed') != sum(case.get('pass') is True for case in receipt['results']):
                raise ValueError('Candidate/verifier receipt mismatch')
            passed = receipt['status'] == 'BENCHMARK_PASSED_AWAITING_REVIEW' and receipt['passed'] == receipt['total']
            report['tasks'].append({'id': task['id'], 'group': task['group'],
                                    'candidate_sha256': expected_hash, 'passed': passed, 'receipt': receipt})
        measured = len(report['tasks'])
        passed = sum(task['passed'] for task in report['tasks'])
        report.update({'measured_tasks': measured, 'required_tasks': len(tasks), 'passed_tasks': passed,
                       'pass_at_1': passed / measured if measured == len(tasks) else None})
        if measured == len(tasks):
            report['status'] = 'EVALUATION_COMPLETED'
        with report_file.open('x') as stream:
            json.dump(report, stream, indent=2, ensure_ascii=False, allow_nan=False)
            stream.write('\n')
            stream.flush()
            os.fsync(stream.fileno())
        report_file.chmod(0o600)
        return report, report_file
    finally:
        lock.rmdir()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for argument in ['checkpoint', 'corpus', 'benchmark', 'output']:
        parser.add_argument('--' + argument, required=True)
    parser.add_argument('--count', type=int, default=500)
    parser.add_argument('--seed', type=int, default=73)
    parser.add_argument('--node', default='node')
    args = vars(parser.parse_args())
    report, file = evaluate_checkpoint(**args)
    print(json.dumps({'status': report['status'], 'passed_tasks': report['passed_tasks'],
                      'measured_tasks': report['measured_tasks'], 'required_tasks': report['required_tasks'],
                      'pass_at_1': report['pass_at_1'], 'report': str(file),
                      'general_coding_acceptance': False}, ensure_ascii=False))
    if report['status'] != 'EVALUATION_COMPLETED':
        raise SystemExit(2)


if __name__ == '__main__':
    main()
