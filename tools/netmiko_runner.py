#!/usr/bin/env python3
import json
import sys
from typing import Any


def _load_payload() -> dict[str, Any]:
    try:
        return json.load(sys.stdin)
    except Exception as exc:  # noqa: BLE001
        raise RuntimeError(f"invalid input payload: {exc}") from exc


def main() -> int:
    try:
        payload = _load_payload()
        from netmiko import ConnectHandler  # imported lazily for clear error handling
    except Exception as exc:  # noqa: BLE001
        print(json.dumps({"error": str(exc)}))
        return 2

    conn = None
    try:
        device = payload.get("device", {})
        timeout_s = int(payload.get("timeout_seconds", 60))
        global_delay_factor = float(payload.get("global_delay_factor", 1.0))

        connect_params = {
            "device_type": device.get("device_type", "autodetect"),
            "host": device.get("host"),
            "username": device.get("username"),
            "password": device.get("password"),
            "port": int(device.get("port", 22)),
            "timeout": timeout_s,
            "conn_timeout": timeout_s,
            "banner_timeout": timeout_s,
            "auth_timeout": timeout_s,
            "global_delay_factor": global_delay_factor,
            "fast_cli": False,
        }

        conn = ConnectHandler(**connect_params)

        steps = payload.get("steps", [])
        result_steps: list[dict[str, Any]] = []
        overall_status = "success"

        for step in steps:
            commands = step.get("commands", [])
            expect = step.get("expect", "")
            on_error = step.get("on_error", "abort")

            if not commands:
                sr = {
                    "name": step.get("name", ""),
                    "command": "",
                    "output": "",
                    "passed": False,
                    "error": "step has no command",
                }
                result_steps.append(sr)
                overall_status = "failed"
                if on_error != "continue":
                    break
                continue

            out_parts: list[str] = []
            step_error = ""
            for cmd in commands:
                try:
                    output = conn.send_command_timing(
                        cmd,
                        strip_prompt=False,
                        strip_command=False,
                        cmd_verify=False,
                        read_timeout=timeout_s,
                    )
                    out_parts.append(output)
                except Exception as exc:  # noqa: BLE001
                    step_error = str(exc)
                    break

            combined_output = "\n".join(out_parts).strip()
            passed = step_error == ""
            if passed and expect:
                passed = expect in combined_output
                if not passed:
                    step_error = f"expected '{expect}' not found in output"

            sr = {
                "name": step.get("name", ""),
                "command": " && ".join(commands),
                "output": combined_output,
                "passed": passed,
                "error": step_error,
            }
            result_steps.append(sr)

            if not passed:
                overall_status = "failed"
                if on_error != "continue":
                    break

        print(json.dumps({"status": overall_status, "steps": result_steps}))
        return 0
    except Exception as exc:  # noqa: BLE001
        print(json.dumps({"error": str(exc)}))
        return 1
    finally:
        if conn is not None:
            try:
                conn.disconnect()
            except Exception:  # noqa: BLE001
                pass


if __name__ == "__main__":
    raise SystemExit(main())
