"""
Session management with automatic cleanup for memory efficiency.
"""
import time
import logging
from threading import Lock

logger = logging.getLogger(__name__)

# Global state dictionaries
previous_states = {}
squat_timings = {}
squat_counts = {}
session_start_times = {}
_session_lock = Lock()

# Session expiry time (1 hour)
SESSION_EXPIRY_SECONDS = 3600


def get_or_create_session(session_id):
    """Get session data or create if doesn't exist."""
    with _session_lock:
        if session_id not in previous_states:
            previous_states[session_id] = "standing"
            squat_counts[session_id] = 0
            squat_timings[session_id] = []
            session_start_times[session_id] = time.time()
            logger.info(f"Created new session: {session_id}")

        return {
            'state': previous_states[session_id],
            'count': squat_counts[session_id],
            'timings': squat_timings[session_id],
            'start_time': session_start_times[session_id]
        }


def update_session_state(session_id, state):
    """Update session state."""
    with _session_lock:
        if session_id in previous_states:
            previous_states[session_id] = state


def increment_squat_count(session_id):
    """Increment squat count for session."""
    with _session_lock:
        if session_id in squat_counts:
            squat_counts[session_id] += 1


def add_squat_timing(session_id, timing):
    """Add a squat timing to the session."""
    with _session_lock:
        if session_id in squat_timings:
            squat_timings[session_id].append(timing)


def reset_session(session_id):
    """Reset a specific session."""
    with _session_lock:
        if session_id in previous_states:
            previous_states[session_id] = "standing"
            squat_counts[session_id] = 0
            squat_timings[session_id] = []
            session_start_times[session_id] = time.time()
            logger.info(f"Reset session: {session_id}")
            return True
        return False


def delete_session(session_id):
    """Delete a specific session."""
    with _session_lock:
        deleted = False
        if session_id in previous_states:
            del previous_states[session_id]
            deleted = True
        if session_id in squat_counts:
            del squat_counts[session_id]
        if session_id in squat_timings:
            del squat_timings[session_id]
        if session_id in session_start_times:
            del session_start_times[session_id]

        if deleted:
            logger.info(f"Deleted session: {session_id}")
        return deleted


def cleanup_old_sessions():
    """Clean up sessions older than SESSION_EXPIRY_SECONDS."""
    now = time.time()
    expired_sessions = []

    with _session_lock:
        for session_id in list(session_start_times.keys()):
            if now - session_start_times[session_id] > SESSION_EXPIRY_SECONDS:
                expired_sessions.append(session_id)

    # Delete outside of iteration
    for session_id in expired_sessions:
        delete_session(session_id)

    if expired_sessions:
        logger.info(f"Cleaned up {len(expired_sessions)} expired sessions")

    return len(expired_sessions)


def get_session_count():
    """Get the number of active sessions."""
    with _session_lock:
        return len(previous_states)


def get_all_sessions():
    """Get all session IDs (for debugging)."""
    with _session_lock:
        return list(previous_states.keys())
