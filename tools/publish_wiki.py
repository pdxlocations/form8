"""Publish the tracked wiki pages to Form8's separate GitHub wiki repository."""
import argparse
import pathlib
import shutil
import subprocess
import tempfile

root = pathlib.Path(__file__).resolve().parents[1]
source = root / 'wiki'
remote = 'https://github.com/pdxlocations/form8.wiki.git'
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--dry-run', action='store_true', help='Clone and show changes without committing or pushing.')
args = parser.parse_args()
pages = sorted(source.glob('*.md'))
if not pages or not (source / 'Home.md').is_file():
    raise SystemExit('No wiki pages found. Expected wiki/Home.md in the project.')

def git(*arguments, cwd=root, capture=False):
    return subprocess.run(['git', *arguments], cwd=cwd, check=True, text=True,
                          stdout=subprocess.PIPE if capture else None)

try:
    with tempfile.TemporaryDirectory(prefix='form8-wiki-') as temporary:
        checkout = pathlib.Path(temporary) / 'wiki'
        git('clone', remote, str(checkout))
        for page in pages:
            shutil.copyfile(page, checkout / page.name)
        git('add', '--', *(page.name for page in pages), cwd=checkout)
        changes = git('diff', '--cached', '--name-only', cwd=checkout, capture=True).stdout.strip()
        if not changes:
            print('The GitHub wiki is already up to date.')
        elif args.dry_run:
            git('diff', '--cached', '--stat', cwd=checkout)
            print('Dry run complete; nothing was committed or published.')
        else:
            name = git('config', 'user.name', capture=True).stdout.strip()
            email = git('config', 'user.email', capture=True).stdout.strip()
            if not name or not email:
                raise SystemExit('Configure Git user.name and user.email in the project before publishing.')
            git('-c', f'user.name={name}', '-c', f'user.email={email}',
                'commit', '-m', 'Update Form8 documentation', cwd=checkout)
            git('push', 'origin', 'HEAD', cwd=checkout)
            print('Published: https://github.com/pdxlocations/form8/wiki')
except subprocess.CalledProcessError:
    raise SystemExit('Wiki publishing failed. Create the initial Home page in GitHub first, '
                     'check access with gh auth login / gh auth setup-git, and retry. '
                     'No force push was performed.')
