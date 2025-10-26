"""
Utility functions for calculating angles and measurements from pose landmarks.
"""
import math
import logging

logger = logging.getLogger(__name__)


def calculate_angle(a, b, c):
    """Calculate the angle between three points with stability checks."""
    try:
        # Get coordinates with fallbacks for all possible data formats
        try:
            # Try dictionary access first with proper conditional expressions
            a_x = a.get('x', 0) if isinstance(a, dict) else (a.x if hasattr(a, 'x') else 0)
            a_y = a.get('y', 0) if isinstance(a, dict) else (a.y if hasattr(a, 'y') else 0)

            b_x = b.get('x', 0) if isinstance(b, dict) else (b.x if hasattr(b, 'x') else 0)
            b_y = b.get('y', 0) if isinstance(b, dict) else (b.y if hasattr(b, 'y') else 0)

            c_x = c.get('x', 0) if isinstance(c, dict) else (c.x if hasattr(c, 'x') else 0)
            c_y = c.get('y', 0) if isinstance(c, dict) else (c.y if hasattr(c, 'y') else 0)
        except Exception:
            # More explicit approach if the above fails
            if isinstance(a, dict):
                a_x, a_y = a.get('x', 0), a.get('y', 0)
            elif hasattr(a, 'x') and hasattr(a, 'y'):
                a_x, a_y = a.x, a.y
            else:
                a_x, a_y = 0, 0

            if isinstance(b, dict):
                b_x, b_y = b.get('x', 0), b.get('y', 0)
            elif hasattr(b, 'x') and hasattr(b, 'y'):
                b_x, b_y = b.x, b.y
            else:
                b_x, b_y = 0, 0

            if isinstance(c, dict):
                c_x, c_y = c.get('x', 0), c.get('y', 0)
            elif hasattr(c, 'x') and hasattr(c, 'y'):
                c_x, c_y = c.x, c.y
            else:
                c_x, c_y = 0, 0

        # Calculate vectors
        ba_x, ba_y = a_x - b_x, a_y - b_y
        bc_x, bc_y = c_x - b_x, c_y - b_y

        # Calculate dot product
        dot_product = (ba_x * bc_x + ba_y * bc_y)

        # Calculate magnitudes
        magnitude_ba = math.sqrt(ba_x**2 + ba_y**2)
        magnitude_bc = math.sqrt(bc_x**2 + bc_y**2)

        # Handle division by zero
        if magnitude_ba < 1e-6 or magnitude_bc < 1e-6:
            return 0

        # Calculate cosine of angle
        cosine_angle = dot_product / (magnitude_ba * magnitude_bc)

        # Clamp to valid range to handle floating point errors
        cosine_angle = max(-1, min(1, cosine_angle))

        # Calculate angle in degrees
        angle_rad = math.acos(cosine_angle)
        angle_deg = math.degrees(angle_rad)

        return angle_deg
    except Exception as e:
        logger.error(f"Error calculating angle: {str(e)}")
        return 0  # Default fallback value


def calculate_depth_ratio(hip, knee, ankle):
    """Calculate the depth ratio based on hip, knee, and ankle positions."""
    try:
        # Get coordinates safely, handling all possible data formats
        hip_y = 0
        knee_y = 0
        ankle_y = 0

        # Get hip y-coordinate
        if isinstance(hip, dict):
            hip_y = hip.get('y', 0)
        elif hasattr(hip, 'y'):
            hip_y = hip.y

        # Get knee y-coordinate
        if isinstance(knee, dict):
            knee_y = knee.get('y', 0)
        elif hasattr(knee, 'y'):
            knee_y = knee.y

        # Get ankle y-coordinate
        if isinstance(ankle, dict):
            ankle_y = ankle.get('y', 0)
        elif hasattr(ankle, 'y'):
            ankle_y = ankle.y

        # Calculate distances
        hip_to_knee = abs(hip_y - knee_y)
        knee_to_ankle = abs(knee_y - ankle_y)
        hip_to_ankle = abs(hip_y - ankle_y)

        if hip_to_ankle < 1e-6:
            return 0

        # Calculate ratio
        depth_ratio = knee_y / hip_to_ankle

        return depth_ratio * 100  # Scale for readability
    except Exception as e:
        logger.error(f"Error calculating depth ratio: {str(e)}")
        return 0  # Default fallback value


def calculate_shoulder_midfoot_diff(shoulder, hip, knee, ankle):
    """Calculate the horizontal difference between shoulder and midfoot position."""
    try:
        # Get coordinates safely, handling all possible data formats
        shoulder_x = 0
        midfoot_x = 0

        # Get shoulder x-coordinate
        if isinstance(shoulder, dict):
            shoulder_x = shoulder.get('x', 0)
        elif hasattr(shoulder, 'x'):
            shoulder_x = shoulder.x

        # Get ankle x-coordinate
        if isinstance(ankle, dict):
            midfoot_x = ankle.get('x', 0)
        elif hasattr(ankle, 'x'):
            midfoot_x = ankle.x

        # Return the difference with sign to indicate direction (positive = shoulders in front of midfoot)
        # which is what we want to detect for forward lean
        return (shoulder_x - midfoot_x) * 100  # Convert to pixels
    except Exception as e:
        logger.error(f"Error calculating shoulder-midfoot difference: {str(e)}")
        return 0  # Default fallback value


def calculate_pelvic_angle(lm, POSE_LANDMARKS):
    """Approximate pelvic/trunk angle (°) in the sagittal plane using hip & shoulder centres.
    0° means perfectly vertical trunk, positive values = leaning forward.
    """
    try:
        sh_l, sh_r = lm[POSE_LANDMARKS.LEFT_SHOULDER], lm[POSE_LANDMARKS.RIGHT_SHOULDER]
        hip_l, hip_r = lm[POSE_LANDMARKS.LEFT_HIP], lm[POSE_LANDMARKS.RIGHT_HIP]
    except (IndexError, KeyError, TypeError):
        return None

    shoulder_cx = (sh_l['x'] + sh_r['x']) / 2.0
    shoulder_cy = (sh_l['y'] + sh_r['y']) / 2.0
    hip_cx = (hip_l['x'] + hip_r['x']) / 2.0
    hip_cy = (hip_l['y'] + hip_r['y']) / 2.0

    dx = hip_cx - shoulder_cx
    dy = hip_cy - shoulder_cy  # positive downwards in image coords
    if dy == 0:
        return 0.0
    # atan2 returns radians; convert to degrees. We measure angle from vertical axis.
    angle = math.degrees(math.atan2(dx, dy))
    return angle
