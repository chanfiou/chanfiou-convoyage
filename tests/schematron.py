import re
import sys

from saxonche import PySaxonProcessor

FAILED_ASSERT = re.compile(
    r"<svrl:failed-assert[^>]*\stest=\"(?P<test>[^\"]*)\"[^>]*>(?P<body>.*?)</svrl:failed-assert>",
    re.S,
)
TEXT = re.compile(r"<svrl:text>(.*?)</svrl:text>", re.S)


def run(stylesheet: str, document: str) -> list[str]:
    with PySaxonProcessor(license=False) as processor:
        transformer = processor.new_xslt30_processor()
        executable = transformer.compile_stylesheet(stylesheet_file=stylesheet)
        report = executable.transform_to_string(source_file=document)

    failures = []
    for match in FAILED_ASSERT.finditer(report or ""):
        text = TEXT.search(match.group("body"))
        message = text.group(1) if text else match.group("test")
        failures.append(" ".join(message.split()))
    return failures


if __name__ == "__main__":
    stylesheet_path, document_path = sys.argv[1], sys.argv[2]
    for failure in run(stylesheet_path, document_path):
        print(failure)
