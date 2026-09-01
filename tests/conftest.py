import sys
from pathlib import Path

import pandas as pd
import pytest

REPO = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO))


@pytest.fixture(scope="session")
def repo():
    return REPO


@pytest.fixture(scope="session")
def roster():
    return pd.read_csv(REPO / "frosted_cwl_members.csv")
