"""一次性脚本：从 db 重新生成 activities.json，跳过 GPX 扫描。

原 db_updater.py 跑 sync_from_data_dir(GPX_FOLDER) 会重扫 555 个 GPX，
而 GPX_OUT 没动，没必要重扫。直接 load() + dump json 即可。
"""
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))
sys.path.insert(0, str(PROJECT_ROOT / "run_page"))

from generator import Generator
from config import SQL_FILE, JSON_FILE


if __name__ == "__main__":
    g = Generator(str(SQL_FILE))
    activities = g.load()
    with open(JSON_FILE, "w") as f:
        import json
        json.dump(activities, f)
    print(f"✅ 写 {len(activities)} 条到 {JSON_FILE}")