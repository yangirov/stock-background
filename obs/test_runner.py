import os
from pathlib import Path
import subprocess
import sys
import tempfile
import time
import unittest

RUNNER = Path(__file__).with_name('runner.py')


def wait_for(predicate):
    deadline = time.monotonic() + 8
    while time.monotonic() < deadline:
        if predicate():
            return
        time.sleep(0.05)
    raise AssertionError('Timed out waiting for process state')


class RunnerTest(unittest.TestCase):
    def test_single_instance_and_cleanup_when_obs_exits(self):
        self.assertTrue(RUNNER.exists(), 'OBS runner has not been implemented')
        with tempfile.TemporaryDirectory() as tmp:
            project = Path(tmp)
            npm = project / 'npm'
            npm.write_text('#!/bin/sh\necho "$PWD:$*" >> starts\n'
                           'exec /bin/sleep 60\n')
            npm.chmod(0o755)
            owner = subprocess.Popen(['/bin/sleep', '60'])
            command = [sys.executable, str(RUNNER), '--project', tmp,
                       '--node-bin', tmp, '--owner-pid', str(owner.pid)]
            runner = subprocess.Popen(command)
            try:
                wait_for(lambda: (project / 'starts').exists())
                duplicate = subprocess.run(command, timeout=5)
                self.assertEqual(duplicate.returncode, 0)
                self.assertEqual((project / 'starts').read_text(), f'{project.resolve()}:start\n')
                pid = int((project / 'logs/obs-autostart.pid').read_text())
                owner.terminate()
                owner.wait(timeout=5)
                self.assertEqual(runner.wait(timeout=8), 0)
                with self.assertRaises(ProcessLookupError):
                    os.kill(pid, 0)
            finally:
                owner.terminate() if owner.poll() is None else None
                owner.wait()
                runner.terminate() if runner.poll() is None else None
                runner.wait(timeout=8)


if __name__ == '__main__':
    unittest.main()
