#!/usr/bin/env python3
"""Check the actual GTK/WebKit controls without submitting print jobs."""
import time
import gi
gi.require_version("Atspi", "2.0")
from gi.repository import Atspi


def walk(node):
    if node is None:
        return
    yield node
    for i in range(node.get_child_count()):
        try:
            yield from walk(node.get_child_at_index(i))
        except Exception:
            continue


def find_any(names):
    wanted = {name.casefold() for name in names}
    for _ in range(80):
        for node in walk(Atspi.get_desktop(0)):
            if node.get_name().casefold() in wanted:
                return node
        time.sleep(.5)
    raise RuntimeError("Native accessible control missing: " + " or ".join(names))


def find(name):
    return find_any([name])


def click(name):
    node = find(name)
    assert node.get_action_iface().do_action(0), name


find("Minimise window")
# GNOME may start maximised when the nested desktop is smaller than the requested window.
initial = find_any(["Maximise window", "Restore window"])
if initial.get_name().casefold() == "restore window":
    click("Restore window")
    find("Maximise window")
find("Close window")
click("Maximise window")
find("Restore window")
click("Restore window")
click("Close window")
find("Finish this session?")
click("Keep working")
click("Appearance")
click("Dark")
click("Appearance")
click("Light")
click("Appearance")
click("System")
find("Check for updates")
print("Native GTK/WebKit appearance controls passed; no print submission.", flush=True)
