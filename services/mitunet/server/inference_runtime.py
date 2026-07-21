"""Non-blocking, serialized execution for GPU-backed MitUNet operations."""

from __future__ import annotations

import asyncio
import json
import time
from collections.abc import Callable
from typing import TypeVar

T = TypeVar("T")


def _elapsed_ms(started_at: float) -> int:
    return max(0, round((time.perf_counter() - started_at) * 1000))


def _default_log(entry: dict[str, object]) -> None:
    print(json.dumps(entry, separators=(",", ":")), flush=True)


class InferenceRuntime:
    """Keep model operations single-filed while leaving the event loop responsive."""

    def __init__(self, log: Callable[[dict[str, object]], None] = _default_log) -> None:
        self._semaphore = asyncio.Semaphore(1)
        self._log = log

    async def run(self, operation_name: str, operation: Callable[[], T]) -> T:
        wait_started_at = time.perf_counter()
        async with self._semaphore:
            wait_ms = _elapsed_ms(wait_started_at)
            run_started_at = time.perf_counter()
            status = "ok"
            worker = asyncio.create_task(asyncio.to_thread(operation))
            try:
                return await asyncio.shield(worker)
            except asyncio.CancelledError:
                status = "cancelled"
                try:
                    await asyncio.shield(worker)
                except Exception:
                    pass
                raise
            except BaseException:
                status = "error"
                raise
            finally:
                self._log({
                    "event": "mitunet_inference",
                    "operation": operation_name,
                    "status": status,
                    "wait_ms": wait_ms,
                    "run_ms": _elapsed_ms(run_started_at),
                })
