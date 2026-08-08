import sys
import os

sys.path.append(os.getcwd())

from agent.nodes import _clean_response

test_cases = [
    ('Result: [ { "Plan Name": "Masking Mini" } ] আসসালামুআলাইকুম।', 'আসসালামুআলাইকুম।'),
    ('System Info: [ { "Plan Name": "Masking Mini" } ] hello.', 'hello.'),
    ('Result: [{"a": 1}] This is a test', 'This is a test'),
    ('Result: {"a": 1} This is another test', 'This is another test'),
    ('Just a regular response', 'Just a regular response'),
    ('<function=test>some args</function> test text', 'test text')
]

all_passed = True
for case, expected in test_cases:
    actual = _clean_response(case)
    if actual != expected:
        print(f"FAILED: '{case}'\n  -> '{actual}'\n  expected: '{expected}'")
        all_passed = False
    else:
        print(f"PASSED: '{case}' -> '{actual}'")

if all_passed:
    print("All _clean_response tests passed!")
else:
    sys.exit(1)
