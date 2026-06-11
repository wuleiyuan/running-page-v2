import json
import logging
import sys
import time
import traceback
from datetime import datetime

import pytz
import requests
from generator import Generator
from stravalib.client import Client
from stravalib.exc import RateLimitExceeded
from tenacity import (
    RetryError,
    retry,
    retry_if_exception,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential,
    before_sleep_log,
)

try:
    from rich import print
except Exception:
    pass

_retry_logger = logging.getLogger("sports_fair.retry")


def adjust_time(time, tz_name):
    if not tz_name:
        tz_name = "Asia/Shanghai"
    tc_offset = datetime.now(pytz.timezone(tz_name)).utcoffset()
    return time + tc_offset


def adjust_time_to_utc(time, tz_name):
    tc_offset = datetime.now(pytz.timezone(tz_name)).utcoffset()
    return time - tc_offset


def adjust_timestamp_to_utc(timestamp, tz_name):
    tc_offset = datetime.now(pytz.timezone(tz_name)).utcoffset()
    delta = int(tc_offset.total_seconds())
    return int(timestamp) - delta


def to_date(ts):
    """
    Parse ISO format timestamp string to datetime object.
    Uses datetime.fromisoformat() for standard ISO format strings.
    Falls back to strptime for non-standard formats.
    """
    # Try fromisoformat first (Python 3.7+)
    try:
        return datetime.fromisoformat(ts)
    except ValueError:
        # Fallback to strptime for non-standard formats
        ts_fmts = ["%Y-%m-%dT%H:%M:%S", "%Y-%m-%dT%H:%M:%S.%f"]
        for ts_fmt in ts_fmts:
            try:
                return datetime.strptime(ts, ts_fmt)
            except ValueError:
                pass
        raise ValueError(f"cannot parse timestamp {ts} into date")


def make_activities_file(
    sql_file, data_dir, json_file, file_suffix="gpx", activity_title_dict={}
):
    generator = Generator(sql_file)
    generator.sync_from_data_dir(
        data_dir, file_suffix=file_suffix, activity_title_dict=activity_title_dict
    )
    activities_list = generator.load()
    with open(json_file, "w") as f:
        json.dump(activities_list, f)


def make_strava_client(client_id, client_secret, refresh_token):
    client = Client()

    refresh_response = client.refresh_access_token(
        client_id=client_id, client_secret=client_secret, refresh_token=refresh_token
    )
    client.access_token = refresh_response["access_token"]
    return client


def get_strava_last_time(client, is_milliseconds=True):
    """
    if there is no activities cause exception return 0
    """
    try:
        activity = None
        activities = client.get_activities(limit=10)
        activities = list(activities)
        activities.sort(key=lambda x: x.start_date, reverse=True)
        # for else in python if you don't know please google it.
        for a in activities:
            if a.type == "Run":
                activity = a
                break
        else:
            return 0
        end_date = activity.start_date + activity.elapsed_time
        last_time = int(datetime.timestamp(end_date))
        if is_milliseconds:
            last_time = last_time * 1000
        return last_time
    except Exception as e:
        print(f"Something wrong to get last time err: {str(e)}")
        return 0


def upload_file_to_strava(client, file_name, data_type, force_to_run=True):
    with open(file_name, "rb") as f:
        try:
            if force_to_run:
                r = client.upload_activity(
                    activity_file=f, data_type=data_type, activity_type="run"
                )
            else:
                r = client.upload_activity(activity_file=f, data_type=data_type)

        except RateLimitExceeded as e:
            timeout = e.timeout
            print(f"Strava API Rate Limit Exceeded. Retry after {timeout} seconds")
            time.sleep(timeout)
            if force_to_run:
                r = client.upload_activity(
                    activity_file=f, data_type=data_type, activity_type="run"
                )
            else:
                r = client.upload_activity(activity_file=f, data_type=data_type)
        print(
            f"Uploading {data_type} file: {file_name} to strava, upload_id: {r.upload_id}."
        )


# =============================================================================
# 网络请求重试：指数退避（1s → 2s → 4s → 8s → 16s，最长 60s）
# =============================================================================
#
# 用法：
#   from utils import http_get_with_retry, http_post_with_retry
#   r = http_get_with_retry(session, url, headers=headers, timeout=30)
#
# 设计要点：
#   - 只对"瞬时故障"重试（ConnectionError, Timeout, 5xx, 429）
#   - 不重试 4xx 客户端错误（401/403/404 等重试也没用）
#   - 默认最多重试 5 次，总耗时最多 ~31s
#   - 重试过程打印 WARNING 日志，方便 CI 排查
#   - 全部失败抛出最后一次异常（让上层决定 catch 继续 / 中断）

# 触发重试的异常类型（瞬时故障）
RETRYABLE_EXC = (
    requests.exceptions.ConnectionError,
    requests.exceptions.Timeout,
    requests.exceptions.ChunkedEncodingError,
    requests.exceptions.ContentDecodingError,
)


def _http_status_is_retryable(exc: BaseException) -> bool:
    """HTTPError 类的 exception：5xx / 429 重试，4xx 不重试"""
    if isinstance(exc, requests.exceptions.HTTPError) and getattr(exc, "response", None) is not None:
        code = exc.response.status_code
        return code == 429 or 500 <= code < 600
    return False


# tenacity predicate: 网络异常 OR 5xx/429 HTTPError
_retry_predicate = retry_if_exception_type(RETRYABLE_EXC) | retry_if_exception(
    _http_status_is_retryable
)


def _make_retry_decorator():
    """每次调用时构造一个新 retry 装饰器（避免 tenacity 内部状态共享）"""
    return retry(
        reraise=True,
        stop=stop_after_attempt(5),
        wait=wait_exponential(multiplier=1, min=1, max=60),
        retry=_retry_predicate,
        before_sleep=before_sleep_log(_retry_logger, logging.WARNING),
    )


def _check_response_status(resp):
    """Response 对象：5xx/429 → 抛 HTTPError 触发重试；4xx/2xx/3xx → 透传"""
    if resp is not None and (resp.status_code == 429 or 500 <= resp.status_code < 600):
        err = requests.exceptions.HTTPError(
            f"{resp.status_code} {resp.reason} on {getattr(resp, 'url', '?')}"
        )
        err.response = resp
        raise err
    return resp


def http_get_with_retry(session, url, **kwargs):
    """带指数退避的 GET；kwargs 透传 timeout/headers/params"""
    kwargs.setdefault("timeout", 30)
    @_make_retry_decorator()
    def _do():
        return _check_response_status(session.get(url, **kwargs))
    return _do()


def http_post_with_retry(session, url, **kwargs):
    """带指数退避的 POST"""
    kwargs.setdefault("timeout", 30)
    @_make_retry_decorator()
    def _do():
        return _check_response_status(session.post(url, **kwargs))
    return _do()


# =============================================================================
# 容错辅助：单数据源失败时记录错误但不让整个 CI 中断
# =============================================================================
#
# 用法（用于 run_data_sync.yml 里的多 source 编排）：
#   from utils import safe_run
#   keep_ok, keep_result = safe_run("keep", run_keep_sync, phone, password)
#   if keep_ok:
#       ... 处理 keep_result
#   # garmin source 失败也不会阻断 keep 的结果
#
# 设计：
#   - 返回 (success: bool, result_or_exception)
#   - 不抛异常，CI 继续跑下一个 source
#   - 失败信息进 stderr 方便 GitHub Actions 标记警告


def safe_run(source_name: str, fn, *args, **kwargs):
    """
    执行 fn(*args, **kwargs)，捕获所有异常不抛出。
    返回 (success, result_or_exception)。
    失败时打印到 stderr 并继续。
    """
    try:
        result = fn(*args, **kwargs)
        print(f"[OK] {source_name} sync completed")
        return (True, result)
    except Exception as e:
        print(f"[FAIL] {source_name} sync error: {e}", file=sys.stderr)
        traceback.print_exc(file=sys.stderr)
        return (False, e)
