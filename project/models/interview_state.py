import time

class InterviewState:
    """Manages global interview state."""
    
    def __init__(self):
        # Interview timing
        self.started_at = None
        self.duration_sec = 0
        self.finished = False
        self.paused_at = None
        self.paused_total = 0
        
        # Coding window
        self.coding_active = False
        self.coding_end_at = None
        self.coding_submission = None
        
        # Conversation
        self.conversation = []
        self.context = ""
        self.last_question = None
        self.probed_topics = set()
        
        # Audio tracking
        self.turn_counter = 0
        self.last_audio_sha1 = None
    
    def pause_timer(self):
        """Pause the main interview timer."""
        if self.started_at and self.paused_at is None:
            self.paused_at = int(time.time())
    
    def resume_timer(self):
        """Resume the main interview timer."""
        if self.paused_at is not None:
            self.paused_total += int(time.time()) - self.paused_at
            self.paused_at = None
    
    def start_timer(self, minutes: int):
        """Start or restart the interview timer."""
        self.started_at = int(time.time())
        self.duration_sec = max(1, int(minutes) * 60)
        self.finished = False
        self.paused_at = None
        self.paused_total = 0
    
    def remaining_seconds(self):
        """Calculate remaining interview time."""
        if not self.started_at or not self.duration_sec:
            return None
        now = int(time.time())
        paused_now = 0
        if self.paused_at is not None:
            paused_now = now - self.paused_at
        elapsed_active = (now - self.started_at) - (self.paused_total + paused_now)
        return max(0, self.duration_sec - max(0, elapsed_active))
    
    def time_up(self):
        """Check if interview time has expired."""
        rem = self.remaining_seconds()
        return rem is not None and rem <= 0
    
    def reset(self):
        """Reset all state."""
        self.__init__()

# Global state instance
interview_state = InterviewState()
