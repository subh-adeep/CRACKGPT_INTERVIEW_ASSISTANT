import os
import re
import time


def main() -> None:
    here = os.path.dirname(__file__)
    feedback_dir = os.path.normpath(os.path.join(here, "..", "static", "feedback"))
    if not os.path.isdir(feedback_dir):
        print(f"Feedback directory not found: {feedback_dir}")
        return

    pattern_epoch = re.compile(r"^feedback_(\d+)\.txt$")
    pattern_dt = re.compile(r"^feedback_(\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2})\.txt$")

    files = sorted(os.listdir(feedback_dir))
    changed = 0
    for name in files:
        if pattern_dt.match(name):
            continue
        m = pattern_epoch.match(name)
        if not m:
            continue
        ts = int(m.group(1))
        dt_str = time.strftime("%Y-%m-%d_%H-%M-%S", time.localtime(ts))
        target = f"feedback_{dt_str}.txt"

        src = os.path.join(feedback_dir, name)
        dst = os.path.join(feedback_dir, target)
        if os.path.exists(dst):
            i = 1
            while True:
                alt = os.path.join(feedback_dir, f"feedback_{dt_str}_{i}.txt")
                if not os.path.exists(alt):
                    dst = alt
                    break
                i += 1
        os.rename(src, dst)
        print(f"Renamed {name} -> {os.path.basename(dst)}")
        changed += 1

    print(f"Done. {changed} file(s) renamed.")


if __name__ == "__main__":
    main()