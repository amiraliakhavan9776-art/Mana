"""Local schematic DXF proof, reusing MANA's existing bounded CAD provider.

This is a fixed seven-zone template, not architectural design or construction approval.
No model, network, server deployment, or external commands supplied by a user.
"""
import argparse
import hashlib
import json
import math
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile

from artifact_worker import design

LIMITATIONS = [
    'Fixed rectangular seven-zone template; room program is not configurable.',
    'Schematic zero-thickness wall centerlines and opening markers only.',
    'Not for construction: no structural, MEP, local code, egress or permit validation.',
    'DXF labels are ASCII identifiers; Persian text rendering is not claimed.',
]


def validate_brief(brief):
    if type(brief) is not dict or set(brief) != {'widthM', 'depthM', 'wallHeightM'}:
        raise ValueError('brief_requires_exact_widthM_depthM_wallHeightM')
    for key, lower, upper in [('widthM', 8, 30), ('depthM', 10, 40), ('wallHeightM', 2.4, 4.5)]:
        value = brief[key]
        if type(value) not in (int, float) or not math.isfinite(value) or not lower <= value <= upper:
            raise ValueError('unsupported_' + key)
    return brief


def generate_schematic(brief, output):
    """Create a fresh verified directory; never replace an existing output.

    Input: {widthM:8..30, depthM:10..40, wallHeightM:2.4..4.5}, metres.
    Output: receipt with artifact hashes and explicit limited verification scope.
    """
    validate_brief(brief)
    target = Path(output).absolute()
    if target.exists() or target.is_symlink():
        raise ValueError('output_already_exists')
    if not target.parent.is_dir() or target.parent.resolve() != target.parent:
        raise ValueError('output_parent_must_exist_without_symlinks')
    # Reserve the output name exclusively; concurrent requests cannot overwrite it.
    target.mkdir(mode=0o700)
    stage = Path(tempfile.mkdtemp(prefix='.mana-schematic-', dir=target.parent))
    try:
        design({'width': brief['widthM'], 'length': brief['depthM'],
                'wallHeight': brief['wallHeightM'], 'revision': 1}, stage)
        verifier = Path(__file__).with_name('verify_artifacts.py')
        checked = subprocess.run([sys.executable, str(verifier), str(stage)],
                                 capture_output=True, text=True, timeout=30)
        if checked.returncode != 0:
            raise ValueError('independent_geometry_verification_failed')
        verification = json.loads(checked.stdout)
        if verification != {'plans': 2, 'status': 'independent_geometry_checks_passed'}:
            raise ValueError('unexpected_verification_result')
        artifacts = [{'name': p.name, 'bytes': p.stat().st_size,
                      'sha256': hashlib.sha256(p.read_bytes()).hexdigest()}
                     for p in sorted(stage.iterdir())]
        receipt = {'schema': 'MANA_SCHEMATIC_DXF_PROOF_V1', 'status': 'SCHEMATIC_VERIFIED',
                   'input': brief, 'unit': 'metres', 'template': 'rectangular-seven-zone-v1',
                   'artifacts': artifacts, 'verification': verification,
                   'sourceSha256': {name: hashlib.sha256(Path(__file__).with_name(name).read_bytes()).hexdigest()
                                    for name in ['schematic_plan.py', 'artifact_worker.py',
                                                 'architecture_geometry.py', 'verify_artifacts.py']},
                   'limitations': LIMITATIONS, 'constructionApproved': False}
        (stage / 'receipt.json').write_text(json.dumps(receipt, indent=2) + '\n', encoding='utf8')
        # Destination is our reserved empty directory, not an arbitrary existing folder.
        os.replace(stage, target)
        return receipt
    except BaseException:
        if target.is_dir() and not any(target.iterdir()):
            target.rmdir()
        raise
    finally:
        if stage.exists():
            shutil.rmtree(stage)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--brief', required=True, type=Path)
    parser.add_argument('--output', required=True, type=Path)
    args = parser.parse_args()
    try:
        if args.brief.is_symlink() or not args.brief.is_file() or args.brief.stat().st_size > 4096:
            raise ValueError('brief_requires_regular_small_json_file')
        def unique_pairs(items):
            result = {}
            for key, value in items:
                if key in result:
                    raise ValueError('duplicate_brief_key')
                result[key] = value
            return result
        brief = json.loads(args.brief.read_text(encoding='utf8'), object_pairs_hook=unique_pairs)
        print(json.dumps(generate_schematic(brief, args.output)))
    except (ValueError, OSError, subprocess.SubprocessError) as error:
        print('schematic_plan_failed: ' + str(error), file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
