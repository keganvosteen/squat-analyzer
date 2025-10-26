"""
Monitoring and observability utilities.
Ready for Sentry integration.
"""
import os
import logging

logger = logging.getLogger(__name__)


def init_sentry(app):
    """Initialize Sentry for error tracking (when DSN is provided)."""
    sentry_dsn = os.environ.get('SENTRY_DSN')

    if not sentry_dsn:
        logger.info("SENTRY_DSN not set, skipping Sentry initialization")
        return False

    try:
        import sentry_sdk
        from sentry_sdk.integrations.flask import FlaskIntegration

        sentry_sdk.init(
            dsn=sentry_dsn,
            integrations=[FlaskIntegration()],
            traces_sample_rate=0.1,  # 10% of requests for performance monitoring
            environment=os.environ.get('FLASK_ENV', 'production'),
            release=os.environ.get('APP_VERSION', 'unknown')
        )
        logger.info("Sentry initialized successfully")
        return True
    except ImportError:
        logger.warning("sentry-sdk not installed. Install with: pip install sentry-sdk")
        return False
    except Exception as e:
        logger.error(f"Failed to initialize Sentry: {e}")
        return False


def init_prometheus(app):
    """Initialize Prometheus metrics (when prometheus-flask-exporter is available)."""
    try:
        from prometheus_flask_exporter import PrometheusMetrics

        metrics = PrometheusMetrics(app)

        # Custom metrics
        video_processing_time = metrics.histogram(
            'video_processing_seconds',
            'Time spent processing video',
            labels={'endpoint': lambda: 'analyze'}
        )

        memory_usage = metrics.gauge(
            'memory_usage_mb',
            'Current memory usage in MB'
        )

        logger.info("Prometheus metrics initialized")
        return metrics
    except ImportError:
        logger.info("prometheus-flask-exporter not installed. Install with: pip install prometheus-flask-exporter")
        return None
    except Exception as e:
        logger.error(f"Failed to initialize Prometheus: {e}")
        return None


def init_compression(app):
    """Initialize Flask-Compress for response compression."""
    try:
        from flask_compress import Compress

        # Configure compression
        app.config['COMPRESS_MIMETYPES'] = [
            'text/html',
            'text/css',
            'text/xml',
            'application/json',
            'application/javascript',
        ]
        app.config['COMPRESS_LEVEL'] = 6  # Balance between speed and compression
        app.config['COMPRESS_MIN_SIZE'] = 500  # Only compress responses > 500 bytes

        compress = Compress()
        compress.init_app(app)
        logger.info("Response compression enabled")
        return True
    except ImportError:
        logger.warning("flask-compress not installed. Install with: pip install flask-compress")
        return False
    except Exception as e:
        logger.error(f"Failed to initialize compression: {e}")
        return False
