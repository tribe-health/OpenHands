class ExampleMicroagent:
    """
    Minimal example microagent to keep the runtime container active.
    """

    def __init__(self):
        self.name = "ExampleMicroagent"

    def run(self, *args, **kwargs):
        return {"status": "ok", "message": "Example microagent is running."}