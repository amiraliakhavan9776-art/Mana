"""MANA research byte-RNN: random initialization, explicit gradients, no pretrained weights.

Not a production coding model. Never executes generated text. NumPy is a numeric
dependency, not a model provider. Dataset rights declarations are operator claims.
"""
import argparse
import hashlib
import json
import math
import os
from pathlib import Path
import stat
import tempfile

import numpy as np

VOCAB = 257  # UTF-8 bytes plus record boundary.
NAMES = ('xh', 'hh', 'hy', 'bh', 'by')


def digest(data):
    return hashlib.sha256(data).hexdigest()


def strict_json(text):
    def pairs(items):
        result = {}
        for key, value in items:
            if key in result:
                raise ValueError('Duplicate JSON key')
            result[key] = value
        return result
    return json.loads(text, object_pairs_hook=pairs,
                      parse_constant=lambda _: (_ for _ in ()).throw(ValueError('Nonfinite JSON')))


def read_regular(file, limit):
    fd = os.open(file, os.O_RDONLY | os.O_NOFOLLOW)
    try:
        info = os.fstat(fd)
        if not stat.S_ISREG(info.st_mode) or info.st_size > limit:
            raise ValueError('Bounded regular file required')
        with os.fdopen(os.dup(fd), 'rb') as stream:
            return stream.read(limit + 1)
    finally:
        os.close(fd)


def load_corpus(file):
    raw = read_regular(file, 32 * 1024 * 1024)
    rows, seen, ids = [], {}, set()
    for line in raw.decode('utf-8').splitlines():
        if not line.strip():
            continue
        item = strict_json(line)
        if not isinstance(item, dict) or set(item) != {'id', 'group', 'request', 'code', 'source', 'training_allowed'}:
            raise ValueError('Explicit dataset contract required')
        if item['training_allowed'] is not True:
            raise ValueError('Training rights not declared')
        for key, maximum in [('id', 100), ('group', 100), ('request', 4000), ('code', 8000), ('source', 500)]:
            if not isinstance(item[key], str) or not 1 <= len(item[key]) <= maximum:
                raise ValueError('Invalid dataset text')
        if item['id'] in ids:
            raise ValueError('Duplicate record ID')
        ids.add(item['id'])
        # Exact code duplication across families would leak evaluation answers.
        code_hash = digest(item['code'].strip().encode())
        if code_hash in seen and seen[code_hash] != item['group']:
            raise ValueError('Cross-group duplicate code; resolve before splitting')
        seen[code_hash] = item['group']
        rows.append(item)
        if len(rows) > 10000:
            raise ValueError('Corpus record bound')
    groups = sorted({row['group'] for row in rows}, key=lambda name: digest(name.encode()))
    if len(groups) < 10:
        raise ValueError('At least ten independent task groups required')
    cut = int(len(groups) * .7)
    dev = max(1, int(len(groups) * .15))
    assignments = {group: ('train' if index < cut else 'validation' if index < cut + dev else 'test')
                   for index, group in enumerate(groups)}
    splits = {name: [] for name in ['train', 'validation', 'test']}
    for row in rows:
        text = '<request>\n' + row['request'] + '\n<code>\n' + row['code'] + '\n<end>\n'
        splits[assignments[row['group']]].append(np.array([256, *text.encode('utf-8'), 256], dtype=np.int64))
    return splits, {'corpus_sha256': digest(raw), 'records': len(rows), 'groups': assignments,
                    'split_records': {name: len(values) for name, values in splits.items()},
                    'source_declarations': sorted({row['source'] for row in rows}),
                    'rights_independently_verified': False, 'near_duplicate_detection': False}


def initialize(hidden, seed):
    if not 8 <= hidden <= 128:
        raise ValueError('Hidden size bound')
    rng = np.random.default_rng(seed)
    params = {'xh': rng.normal(0, .04, (hidden, VOCAB)),
              'hh': rng.normal(0, 1 / math.sqrt(hidden), (hidden, hidden)),
              'hy': rng.normal(0, .04, (VOCAB, hidden)),
              'bh': np.zeros(hidden), 'by': np.zeros(VOCAB)}
    memory = {name: np.zeros_like(value) for name, value in params.items()}
    return params, memory, rng


def loss_gradient(params, inputs, targets, gradients=True):
    hidden = params['hh'].shape[0]
    states, probabilities = [np.zeros(hidden)], []
    loss = 0.0
    for token, target in zip(inputs, targets):
        h = np.tanh(params['xh'][:, token] + params['hh'] @ states[-1] + params['bh'])
        logits = params['hy'] @ h + params['by']
        shifted = logits - np.max(logits)
        probs = np.exp(shifted)
        probs /= probs.sum()
        loss += -float(shifted[target]) + math.log(float(np.exp(shifted).sum()))
        states.append(h)
        probabilities.append(probs)
    if not gradients:
        return loss / len(inputs)
    grads = {name: np.zeros_like(value) for name, value in params.items()}
    dh_next = np.zeros(hidden)
    for index in reversed(range(len(inputs))):
        dy = probabilities[index].copy()
        dy[targets[index]] -= 1
        dy /= len(inputs)
        grads['hy'] += np.outer(dy, states[index + 1])
        grads['by'] += dy
        dh = params['hy'].T @ dy + dh_next
        raw = (1 - states[index + 1] ** 2) * dh
        grads['bh'] += raw
        grads['xh'][:, inputs[index]] += raw
        grads['hh'] += np.outer(raw, states[index])
        dh_next = params['hh'].T @ raw
    return loss / len(inputs), grads


def evaluate(params, sequences):
    # Fixed, bounded token-loss measurement, not a code-correctness benchmark.
    values = [loss_gradient(params, seq[:min(len(seq)-1, 256)], seq[1:min(len(seq), 257)], False)
              for seq in sequences[:64]]
    return float(np.mean(values))


def private_directory(directory):
    directory = Path(directory)
    directory.mkdir(mode=0o700, parents=True, exist_ok=True)
    info = directory.lstat()
    if not stat.S_ISDIR(info.st_mode) or stat.S_ISLNK(info.st_mode) or info.st_mode & 0o077:
        raise ValueError('Private non-symlink directory required')
    return directory


def engine_hash():
    return digest(Path(__file__).read_bytes())


def save_checkpoint(output, params, memory, rng, metadata):
    output = private_directory(output)
    destination = output / ('step-%08d' % metadata['step'])
    if destination.exists():
        raise ValueError('Checkpoint already exists')
    temporary = Path(tempfile.mkdtemp(prefix='.checkpoint-', dir=output))
    weights = temporary / 'weights.npz'
    with weights.open('xb') as stream:
        np.savez_compressed(stream, **params, **{'memory_' + key: value for key, value in memory.items()})
        stream.flush()
        os.fsync(stream.fileno())
    os.chmod(weights, 0o600)
    report = {**metadata, 'schema': 'MANA_BYTE_RNN_RESEARCH_V1', 'engine_sha256': engine_hash(),
              'numpy_version': np.__version__, 'weights_sha256': digest(weights.read_bytes()),
              'rng_state': rng.bit_generator.state, 'pretrained_weights': False,
              'general_coding_acceptance': False, 'production_ready': False}
    with (temporary / 'checkpoint.json').open('x') as stream:
        json.dump(report, stream, indent=2, ensure_ascii=False, allow_nan=False)
        stream.write('\n')
        stream.flush()
        os.fsync(stream.fileno())
    os.chmod(temporary / 'checkpoint.json', 0o600)
    os.rename(temporary, destination)
    fd = os.open(output, os.O_RDONLY)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)
    return destination, report


def load_checkpoint(directory):
    directory = Path(directory)
    report = strict_json(read_regular(directory / 'checkpoint.json', 128000).decode())
    raw = read_regular(directory / 'weights.npz', 16 * 1024 * 1024)
    if report['schema'] != 'MANA_BYTE_RNN_RESEARCH_V1' or report['engine_sha256'] != engine_hash() or digest(raw) != report['weights_sha256']:
        raise ValueError('Checkpoint integrity/version mismatch')
    import io
    hidden = report['hidden']
    params, memory, rng = initialize(hidden, report['seed'])
    with np.load(io.BytesIO(raw), allow_pickle=False) as arrays:
        if set(arrays.files) != set(NAMES) | {'memory_' + name for name in NAMES}:
            raise ValueError('Unexpected weights')
        for name in NAMES:
            for key, target in [(name, params), ('memory_' + name, memory)]:
                value = arrays[key]
                if value.shape != target[name].shape or value.dtype != np.float64 or not np.isfinite(value).all():
                    raise ValueError('Invalid weight shape/type/value')
                target[name] = value.copy()
    rng.bit_generator.state = report['rng_state']
    return params, memory, rng, report


def train(corpus, output, steps=100, hidden=48, sequence=64, learning_rate=.04, seed=27, resume=None, checkpoint_every=100):
    if not 1 <= steps <= 20000 or not 8 <= sequence <= 128 or not 0 < learning_rate <= .2 or not 1 <= checkpoint_every <= 1000:
        raise ValueError('Training budget invalid')
    splits, manifest = load_corpus(corpus)
    private_directory(output)
    lock = Path(output) / 'training.lock'
    lock.mkdir(mode=0o700)  # Stale lock needs operator inspection, never automatic deletion.
    try:
        if resume:
            params, memory, rng, previous = load_checkpoint(resume)
            if previous['manifest'] != manifest or (hidden, sequence, learning_rate, seed) != (previous['hidden'], previous['sequence'], previous['learning_rate'], previous['seed']):
                raise ValueError('Resume dataset/config mismatch')
            first = previous['step']
        else:
            params, memory, rng = initialize(hidden, seed)
            first = 0
        before = evaluate(params, splits['validation'])
        latest, report = None, None
        for step in range(first + 1, first + steps + 1):
            seq = splits['train'][int(rng.integers(len(splits['train'])))]
            start = int(rng.integers(max(1, len(seq) - sequence)))
            inputs, targets = seq[start:start+sequence], seq[start+1:start+sequence+1]
            loss, grads = loss_gradient(params, inputs, targets)
            for name in NAMES:
                grad = np.clip(grads[name], -5, 5)
                memory[name] += grad * grad
                params[name] -= learning_rate * grad / np.sqrt(memory[name] + 1e-8)
                if not np.isfinite(params[name]).all():
                    raise ValueError('Nonfinite training stopped')
            if step % checkpoint_every == 0 or step == first + steps:
                latest, report = save_checkpoint(output, params, memory, rng,
                    {'step': step, 'seed': seed, 'hidden': hidden, 'sequence': sequence,
                     'learning_rate': learning_rate, 'parameters': sum(x.size for x in params.values()),
                     'manifest': manifest, 'training_window_loss': loss,
                     'validation_loss_before_this_run': before,
                     'validation_loss': evaluate(params, splits['validation'])})
                print(json.dumps({'step': step, 'validation_loss': report['validation_loss'], 'checkpoint': str(latest)}), flush=True)
        return latest, report
    finally:
        lock.rmdir()


def generate(checkpoint, request, count=200, seed=1):
    if not 1 <= count <= 1000 or len(request) > 4000:
        raise ValueError('Generation budget')
    params, _, _, _ = load_checkpoint(checkpoint)
    rng = np.random.default_rng(seed)
    h = np.zeros(params['hh'].shape[0])
    prefix = [256, *('<request>\n' + request + '\n<code>\n').encode()]
    for token in prefix:
        h = np.tanh(params['xh'][:, token] + params['hh'] @ h + params['bh'])
    output = []
    for _ in range(count):
        logits = params['hy'] @ h + params['by']
        probs = np.exp(logits - logits.max())
        probs /= probs.sum()
        token = int(rng.choice(VOCAB, p=probs))
        if token == 256:
            break
        output.append(token)
        h = np.tanh(params['xh'][:, token] + params['hh'] @ h + params['bh'])
    return bytes(output).decode('utf-8', errors='replace')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest='command', required=True)
    run = sub.add_parser('train')
    run.add_argument('--corpus', required=True)
    run.add_argument('--output', required=True)
    run.add_argument('--steps', type=int, default=100)
    run.add_argument('--hidden', type=int, default=48)
    run.add_argument('--sequence', type=int, default=64)
    run.add_argument('--learning-rate', type=float, default=.04)
    run.add_argument('--seed', type=int, default=27)
    run.add_argument('--resume')
    run.add_argument('--checkpoint-every', type=int, default=100)
    infer = sub.add_parser('generate')
    infer.add_argument('--checkpoint', required=True)
    infer.add_argument('--request', required=True)
    infer.add_argument('--count', type=int, default=200)
    args = vars(parser.parse_args())
    command = args.pop('command')
    if command == 'train':
        train(**args)
    else:
        print(json.dumps({'status': 'UNVERIFIED_RESEARCH_TEXT', 'text': generate(**args), 'executed': False}, ensure_ascii=False))


if __name__ == '__main__':
    main()
