import datetime
import os
import sys

import arrow
import stravalib
from gpxtrackposter import track_loader
from sqlalchemy import and_, func, or_

from polyline_processor import filter_out

from .db import Activity, init_db, update_or_create_activity

from synced_data_file_logger import save_synced_data_file_list


def _moving_time_to_seconds(moving_time) -> int:
    """moving_time 格式：'1970-01-01 HH:MM:SS' 或 timedelta 或 None
    返回总秒数，无法解析时返回 0。
    """
    if moving_time is None:
        return 0
    # datetime.timedelta
    if isinstance(moving_time, datetime.timedelta):
        return int(moving_time.total_seconds())
    # str: '1970-01-01 HH:MM:SS' 或 'HH:MM:SS'
    s = str(moving_time)
    m = s.split()[-1] if ' ' in s else s
    parts = m.split(':')
    if len(parts) == 3:
        try:
            return int(parts[0]) * 3600 + int(parts[1]) * 60 + int(float(parts[2]))
        except (ValueError, IndexError):
            return 0
    if len(parts) == 2:
        try:
            return int(parts[0]) * 60 + int(parts[1])
        except (ValueError, IndexError):
            return 0
    return 0

IGNORE_BEFORE_SAVING = os.getenv("IGNORE_BEFORE_SAVING", False)


class Generator:
    def __init__(self, db_path):
        self.client = stravalib.Client()
        self.session = init_db(db_path)

        self.client_id = ""
        self.client_secret = ""
        self.refresh_token = ""
        self.only_run = False

    def set_strava_config(self, client_id, client_secret, refresh_token):
        self.client_id = client_id
        self.client_secret = client_secret
        self.refresh_token = refresh_token

    def check_access(self):
        response = self.client.refresh_access_token(
            client_id=self.client_id,
            client_secret=self.client_secret,
            refresh_token=self.refresh_token,
        )
        # Update the authdata object
        self.access_token = response["access_token"]
        self.refresh_token = response["refresh_token"]

        self.client.access_token = response["access_token"]
        print("Access ok")

    def sync(self, force):
        """
        Sync activities means sync from strava
        TODO, better name later
        """
        self.check_access()

        print("Start syncing")
        if force:
            filters = {"before": datetime.datetime.now(datetime.timezone.utc)}
        else:
            last_activity = self.session.query(func.max(Activity.start_date)).scalar()
            if last_activity:
                last_activity_date = arrow.get(last_activity)
                last_activity_date = last_activity_date.shift(days=-7)
                filters = {"after": last_activity_date.datetime}
            else:
                filters = {"before": datetime.datetime.now(datetime.timezone.utc)}

        for activity in self.client.get_activities(**filters):
            if self.only_run and activity.type != "Run":
                continue
            if IGNORE_BEFORE_SAVING:
                if activity.map and activity.map.summary_polyline:
                    activity.map.summary_polyline = filter_out(
                        activity.map.summary_polyline
                    )
            #  strava use total_elevation_gain as elevation_gain
            activity.elevation_gain = activity.total_elevation_gain
            activity.subtype = activity.type
            created = update_or_create_activity(self.session, activity)
            if created:
                sys.stdout.write("+")
            else:
                sys.stdout.write(".")
            sys.stdout.flush()
        self.session.commit()

    def sync_from_data_dir(self, data_dir, file_suffix="gpx", activity_title_dict={}):
        loader = track_loader.TrackLoader()
        tracks = loader.load_tracks(
            data_dir, file_suffix=file_suffix, activity_title_dict=activity_title_dict
        )
        print(f"load {len(tracks)} tracks")
        if not tracks:
            print("No tracks found.")
            return

        synced_files = []

        for t in tracks:
            created = update_or_create_activity(
                self.session, t.to_namedtuple(run_from=file_suffix)
            )
            if created:
                sys.stdout.write("+")
            else:
                sys.stdout.write(".")
            synced_files.extend(t.file_names)
            sys.stdout.flush()

        save_synced_data_file_list(synced_files)

        self.session.commit()

    def sync_from_app(self, app_tracks):
        if not app_tracks:
            print("No tracks found.")
            return
        print("Syncing tracks '+' means new track '.' means update tracks")
        synced_files = []
        for t in app_tracks:
            created = update_or_create_activity(self.session, t)
            if created:
                sys.stdout.write("+")
            else:
                sys.stdout.write(".")
            if "file_names" in t:
                synced_files.extend(t.file_names)
            sys.stdout.flush()

        self.session.commit()

    def load(self):
        # if sub_type is not in the db, just add an empty string to it
        # 2026-06-09 用户反馈：之前限定 type=Run 是当时只跑步，现在多运动，不做 type 限制
        # 2026-06-12 异常数据修复：
        #   - distance > 0.1m 过滤空记录（上游一致）
        #   - distance IS NOT NULL 防御 NULL（之前 OR 子句会让 NULL 行漏过滤）
        #   - 爬楼（StairStepper）/ 跳绳（RopeSkipping）无距离走 OR 例外
        #   - Workout 距离为 0 的 19 条（Keep API 漏 GPX）保留不删（用户决策：丢数据更糟）
        #   - 0 距离 Run 在循环里二次过滤（误触发开始/取消 / Apple Watch 半路掉线）
        query = self.session.query(Activity).filter(
            or_(
                and_(Activity.distance > 0.1, Activity.distance.isnot(None)),
                Activity.type == 'StairStepper',  # 爬楼无距离
                Activity.type == 'RopeSkipping',  # 跳绳无距离
            )
        )
        if self.only_run:
            query = query.filter(Activity.type == "Run")

        activities = query.order_by(Activity.start_date_local.asc())
        activity_list = []

        streak = 0
        last_date = None
        skipped_zero_distance_runs = 0
        skipped_impossible_speed_runs = 0
        skipped_long_zero_distance = 0
        for activity in activities:
            # 2026-06-12 异常数据修复：0 距离 Run 跳过（误触发 / 半路掉线）
            # Workout 0 距离保留（Keep API 漏 GPX 但用户决策不删）
            if activity.type == 'Run' and (activity.distance is None or activity.distance <= 0):
                skipped_zero_distance_runs += 1
                continue
            # 2026-06-12 异常数据修复：0 距离 + 长时长（任意 type）跳过
            # 距离为 0 但时长 > 1 小时 = 严重异常（Keep API 漏 GPX 极端情况 / 数据损坏）
            if (activity.distance is None or activity.distance <= 0) and activity.moving_time:
                mt_seconds = _moving_time_to_seconds(activity.moving_time)
                if mt_seconds and mt_seconds > 3600:
                    skipped_long_zero_distance += 1
                    continue
            # 2026-06-12 异常数据修复：Run 速度异常（< 1 km/h 或 > 30 km/h）跳过
            # 慢于 1 km/h 持续 > 1h = 误触发 / 卡死；快于 30 km/h 持续 > 5min = 不可能是跑步
            if activity.type == 'Run' and activity.distance and activity.moving_time:
                mt_seconds = _moving_time_to_seconds(activity.moving_time)
                if mt_seconds and mt_seconds > 60:  # 至少 1 分钟
                    kmh = (activity.distance / 1000.0) / (mt_seconds / 3600.0)
                    too_slow = kmh < 1.0 and mt_seconds > 3600  # < 1 km/h 持续 > 1h
                    too_fast = kmh > 30.0 and mt_seconds > 300  # > 30 km/h 持续 > 5min
                    if bool(too_slow) or bool(too_fast):
                        skipped_impossible_speed_runs += 1
                        continue
            # Determine running streak.
            date = datetime.datetime.strptime(
                activity.start_date_local, "%Y-%m-%d %H:%M:%S"  # type: ignore
            ).date()
            if last_date is None:
                streak = 1
            elif date == last_date:
                pass
            elif date == last_date + datetime.timedelta(days=1):
                streak += 1
            else:
                assert date > last_date
                streak = 1
            activity.streak = streak  # type: ignore
            last_date = date
            if not IGNORE_BEFORE_SAVING:
                activity.summary_polyline = filter_out(activity.summary_polyline)  # type: ignore
            activity_list.append(activity.to_dict())

        if skipped_zero_distance_runs:
            print(f"[generator.load] skipped {skipped_zero_distance_runs} zero-distance Run activities")
        if skipped_long_zero_distance:
            print(f"[generator.load] skipped {skipped_long_zero_distance} long-duration zero-distance activities (any type)")
        if skipped_impossible_speed_runs:
            print(f"[generator.load] skipped {skipped_impossible_speed_runs} impossible-speed Run activities (< 1 km/h > 1h or > 30 km/h > 5min)")
        return activity_list[::-1]

    def get_old_tracks_ids(self):
        try:
            activities = self.session.query(Activity).all()
            return [str(a.run_id) for a in activities]
        except Exception as e:
            # pass the error
            print(f"something wrong with {str(e)}")
            return []

    def get_old_tracks_dates(self):
        try:
            activities = (
                self.session.query(Activity)
                .order_by(Activity.start_date_local.desc())
                .all()
            )
            return [str(a.start_date_local) for a in activities]
        except Exception as e:
            # pass the error
            print(f"something wrong with {str(e)}")
            return []
