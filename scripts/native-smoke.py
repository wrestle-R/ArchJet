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


def find(name):
    for _ in range(80):
        for node in walk(Atspi.get_desktop(0)):
            if node.get_name().casefold() == name.casefold():
                return node
        time.sleep(.5)
    raise RuntimeError("Native accessible control missing: " + name)


def click(name):
    node = find(name)
    assert node.get_action_iface().do_action(0), name


click("Change appearance")
click("Updates and what’s new")
find("A little more at home.")
click("dark")
click("light")
click("system")
click("Close updates")
print("Native GTK/WebKit appearance and release dialog passed; no print submission.", flush=True)
