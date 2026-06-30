"""Official Python SDK for the Peep web scraping API.

https://peep.shownomore.com/docs
"""

from .client import Peep, PeepError

__all__ = ["Peep", "PeepError"]
__version__ = "0.1.0"
