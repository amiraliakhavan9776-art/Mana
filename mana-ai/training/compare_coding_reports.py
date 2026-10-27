"""Compare completed independent coding reports; never promotes or deletes models."""
import argparse
import json
import re
from pathlib import Path

from mana_byte_rnn import read_regular, strict_json


def compare(baseline, candidate):
    reports = [strict_json(read_regular(file, 1000000).decode()) for file in [baseline, candidate]]
    for report in reports:
        if report.get('schema') != 'MANA_NATIVE_CODING_EVALUATION_V1' or report.get('status') != 'EVALUATION_COMPLETED':
            raise ValueError('Complete independent evaluation required')
        tasks = report.get('tasks', [])
        if not tasks or len(tasks) != report.get('required_tasks') or len(tasks) != report.get('measured_tasks'):
            raise ValueError('Incomplete task coverage')
        if len({task['id'] for task in tasks}) != len(tasks):
            raise ValueError('Duplicate task IDs')
        for task in tasks:
            receipt = task['receipt']
            results = receipt['results']
            if not isinstance(task.get('passed'), bool) or not isinstance(task.get('candidate_sha256'), str) or not re.fullmatch(r'[a-f0-9]{64}', task['candidate_sha256']) or not 3 <= receipt['total'] <= 32 or [row.get('index') for row in results] != list(range(receipt['total'])) or any(type(row.get('pass')) is not bool for row in results):
                raise ValueError('Invalid case/hash contract')
            if receipt['candidateSha256'] != task['candidate_sha256'] or len(results) != receipt['total'] or receipt['passed'] != sum(row.get('pass') is True for row in results):
                raise ValueError('Invalid benchmark receipt')
            passed = receipt['status'] == 'BENCHMARK_PASSED_AWAITING_REVIEW' and receipt['passed'] == receipt['total']
            if task['passed'] is not passed:
                raise ValueError('Invalid task outcome')
        if report['passed_tasks'] != sum(task['passed'] for task in tasks):
            raise ValueError('Invalid aggregate')
    a, b = reports
    for key in ['benchmark_sha256', 'corpus_sha256', 'generation_seed', 'maximum_generated_bytes', 'attempts_per_task']:
        if a[key] != b[key]:
            raise ValueError('Noncomparable evaluation settings')
    old = {task['id']: task for task in a['tasks']}
    new = {task['id']: task for task in b['tasks']}
    if old.keys() != new.keys():
        raise ValueError('Different task sets')
    if any(old[key]['group'] != new[key]['group'] or old[key]['receipt']['total'] != new[key]['receipt']['total'] or old[key]['receipt'].get('policy') != new[key]['receipt'].get('policy') or old[key]['receipt'].get('filterSha256') != new[key]['receipt'].get('filterSha256') for key in old):
        raise ValueError('Different task/verification contract')
    case_regressions = [{'task': key, 'index': index} for key in sorted(old) for index, row in enumerate(old[key]['receipt']['results']) if row['pass'] and not new[key]['receipt']['results'][index]['pass']]
    regressions = sorted(key for key in old if old[key]['passed'] and not new[key]['passed'])
    gains = sorted(key for key in old if not old[key]['passed'] and new[key]['passed'])
    improved = bool(gains) and not case_regressions
    if improved and a['checkpoint_weights_sha256'] == b['checkpoint_weights_sha256']:
        raise ValueError('Same weights cannot establish a new model improvement')
    return {'status': 'IMPROVED_REQUIRES_REVIEW' if improved else 'REGRESSION_REJECTED' if case_regressions else 'NO_MEASURED_IMPROVEMENT',
            'gains': gains, 'regressions': regressions, 'case_regressions': case_regressions,
            'baseline_weights': a['checkpoint_weights_sha256'], 'candidate_weights': b['checkpoint_weights_sha256'],
            'general_coding_acceptance': False, 'promotion_allowed': False,
            'deletion_allowed': False, 'reason': 'Narrow benchmark comparison; retain rollback versions pending broader acceptance and owner review.'}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('baseline', type=Path)
    parser.add_argument('candidate', type=Path)
    args = parser.parse_args()
    print(json.dumps(compare(args.baseline, args.candidate), indent=2))
