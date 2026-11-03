"""Run one npm updater per project, for the lifetime of the owning OBS process."""

import argparse
import fcntl
import os
from pathlib import Path
import signal
import subprocess
import time


def process_exists(pid):
    try:
        os.kill(pid, 0)
        return True
    except ProcessLookupError:
        return False


def run(project, node_bin, owner_pid):
    logs = project / 'logs'
    logs.mkdir(exist_ok=True)
    # Keep the same lock inode: removing a lock file introduces a race.
    with (logs / 'obs-autostart.lock').open('a') as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            return
        if not process_exists(owner_pid):
            return
        environment = dict(os.environ)
        environment['PATH'] = str(node_bin) + os.pathsep + environment.get('PATH', '/usr/bin:/bin')
        with (logs / 'obs-autostart.log').open('a', buffering=1) as log:
            log.write(f'[{time.ctime()}] Starting npm start (OBS {owner_pid})\n')
            child = subprocess.Popen(
                [str(node_bin / 'npm'), 'start'], cwd=project, env=environment,
                stdin=subprocess.DEVNULL, stdout=log, stderr=log, start_new_session=True,
            )
            pid_file = logs / 'obs-autostart.pid'
            pid_file.write_text(str(child.pid))
            stopping = False

            def request_stop(signum, frame):
                nonlocal stopping
                stopping = True

            signal.signal(signal.SIGTERM, request_stop)
            signal.signal(signal.SIGINT, request_stop)
            try:
                while not stopping and process_exists(owner_pid) and child.poll() is None:
                    time.sleep(0.5)
            finally:
                try:
                    os.killpg(child.pid, signal.SIGTERM)
                except ProcessLookupError:
                    pass
                try:
                    child.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    os.killpg(child.pid, signal.SIGKILL)
                    child.wait()
                pid_file.unlink(missing_ok=True)
                log.write(f'[{time.ctime()}] Updater stopped (exit {child.returncode})\n')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--project', required=True, type=Path)
    parser.add_argument('--node-bin', required=True, type=Path)
    parser.add_argument('--owner-pid', required=True, type=int)
    args = parser.parse_args()
    if args.owner_pid <= 1:
        parser.error('owner-pid must identify the OBS process')
    run(args.project, args.node_bin, args.owner_pid)
