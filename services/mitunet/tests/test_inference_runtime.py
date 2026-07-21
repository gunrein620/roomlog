import asyncio
import threading
import time
import unittest
from pathlib import Path

from server.inference_runtime import InferenceRuntime


class InferenceRuntimeTests(unittest.IsolatedAsyncioTestCase):
    async def test_serializes_operations_without_blocking_event_loop(self):
        entries = []
        runtime = InferenceRuntime(log=entries.append)
        state_lock = threading.Lock()
        active = 0
        max_active = 0
        heartbeat_count = 0
        keep_heartbeat = True

        def blocking_operation(value):
            nonlocal active, max_active
            with state_lock:
                active += 1
                max_active = max(max_active, active)
            time.sleep(0.03)
            with state_lock:
                active -= 1
            return value

        async def heartbeat():
            nonlocal heartbeat_count
            while keep_heartbeat:
                heartbeat_count += 1
                await asyncio.sleep(0.002)

        heartbeat_task = asyncio.create_task(heartbeat())
        first, second = await asyncio.gather(
            runtime.run("extract-image", lambda: blocking_operation("first")),
            runtime.run("extract-image", lambda: blocking_operation("second")),
        )
        keep_heartbeat = False
        await heartbeat_task

        self.assertEqual((first, second), ("first", "second"))
        self.assertEqual(max_active, 1)
        self.assertGreater(heartbeat_count, 5)
        self.assertEqual(len(entries), 2)
        self.assertEqual(entries[0]["event"], "mitunet_inference")
        self.assertEqual(entries[0]["operation"], "extract-image")
        self.assertEqual(entries[0]["status"], "ok")
        self.assertGreaterEqual(entries[0]["run_ms"], 20)
        self.assertGreaterEqual(entries[1]["wait_ms"], 20)

    async def test_logs_failed_operation_and_reraises(self):
        entries = []
        runtime = InferenceRuntime(log=entries.append)

        def fail():
            raise RuntimeError("failure detail must not be logged")

        with self.assertRaisesRegex(RuntimeError, "failure detail"):
            await runtime.run("compose-edits", fail)

        self.assertEqual(entries[0]["status"], "error")
        self.assertNotIn("failure detail", str(entries[0]))

    async def test_cancellation_keeps_gpu_slot_until_worker_finishes(self):
        runtime = InferenceRuntime(log=lambda _entry: None)
        first_started = threading.Event()
        release_first = threading.Event()
        second_started = threading.Event()

        def first_operation():
            first_started.set()
            release_first.wait(timeout=1)

        first_task = asyncio.create_task(runtime.run("extract-image", first_operation))
        await asyncio.to_thread(first_started.wait, 1)
        first_task.cancel()
        second_task = asyncio.create_task(
            runtime.run("extract-image", lambda: second_started.set()),
        )
        await asyncio.sleep(0.03)
        self.assertFalse(second_started.is_set())

        release_first.set()
        with self.assertRaises(asyncio.CancelledError):
            await first_task
        await second_task
        self.assertTrue(second_started.is_set())

    def test_server_routes_use_the_shared_runtime(self):
        server_source = (Path(__file__).parents[1] / "server" / "main.py").read_text()

        self.assertIn("app.state.inference_runtime = InferenceRuntime()", server_source)
        self.assertIn('await runtime.run("extract-image", run_extraction)', server_source)
        self.assertIn('await runtime.run("compose-edits", run_composition)', server_source)


if __name__ == "__main__":
    unittest.main()
