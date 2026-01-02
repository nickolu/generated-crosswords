#!/usr/bin/env python3
"""
Flask app to track user scores.
Listens for GET requests at /results?user=xxx&time=yyy
Stores results in SQLite database (statistics.db) with format {username: time}
Each date contains entries for all users who completed puzzles on that date.
"""

import json
import sqlite3
from datetime import datetime
from pathlib import Path

from flask import Flask, jsonify, request, send_from_directory

app = Flask(__name__)

# Directory to store JSON files (for migration and backward compatibility)
DATA_DIR = Path(__file__).parent / ".." / "data"
DATA_DIR.mkdir(exist_ok=True)

# Directory containing crossword JSON files
CROSSWORDS_DIR = Path(__file__).parent / ".." / "crosswords"

# Root directory for serving static files
ROOT_DIR = Path(__file__).parent / ".."

# SQLite database path - store in data directory for proper permissions
DB_PATH = DATA_DIR / "statistics.db"


def get_db_connection():
    """Get a connection to the SQLite database."""
    # Ensure data directory exists
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    return conn


def init_database():
    """Initialize the SQLite database with the results table."""
    conn = get_db_connection()
    try:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS results (
                date TEXT NOT NULL,
                username TEXT NOT NULL,
                time INTEGER NOT NULL,
                PRIMARY KEY (date, username)
            )
        """)
        conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_date ON results(date)
        """)
        conn.commit()
    finally:
        conn.close()


@app.route('/results', methods=['GET'])
def store_results():
    """
    Store user results in SQLite database.
    
    Expected parameters:
    - user: username (string)
    - time: time score (integer)
    - date: date (optional, defaults to today)
    
    Stores/updates result in SQLite database.
    
    Returns JSON response with status.
    """
    try:
        # Initialize database if it doesn't exist
        init_database()
        
        # Log all request args for debugging
        app.logger.info(f"Received /results request with args: {dict(request.args)}")
        app.logger.info(f"Request URL: {request.url}")
        app.logger.info(f"Request path: {request.path}")
        app.logger.info(f"Query string: {request.query_string.decode()}")
        
        # Get parameters from query string
        username = request.args.get('user')
        time_score = request.args.get('time')
        date = request.args.get('date')
        
        app.logger.info(f"Parsed parameters - user: {username}, time: {time_score}, date: {date}")
        
        # Validate parameters
        if not username:
            app.logger.warning(f"Missing user parameter. All args: {dict(request.args)}")
            return jsonify({'error': 'Missing required parameter: user'}), 400
        
        if not time_score:
            app.logger.warning(f"Missing time parameter. All args: {dict(request.args)}")
            return jsonify({'error': 'Missing required parameter: time'}), 400
        
        # Validate time is an integer
        try:
            time_score = int(time_score)
        except ValueError:
            return jsonify({'error': 'Parameter time must be an integer'}), 400
        
        # Generate current date as submission date (YYYY-MM-DD format)
        if date:
            submission_date = date
        else:
            submission_date = datetime.now().strftime('%Y-%m-%d')
        
        # Store in SQLite database
        conn = get_db_connection()
        try:
            conn.execute(
                "INSERT OR REPLACE INTO results (date, username, time) VALUES (?, ?, ?)",
                (submission_date, username, time_score)
            )
            conn.commit()
            app.logger.info(f"Stored result for user {username}: {time_score} at {submission_date}")
        except Exception as db_error:
            app.logger.error(f"Database error storing result: {str(db_error)}")
            conn.rollback()
            raise
        finally:
            conn.close()
        
        return jsonify({
            'status': 'success',
            'message': f'Result stored for user {username}',
            'data': {
                'user': username,
                'time': time_score,
                'submission_date': submission_date
            }
        }), 200
        
    except Exception as e:
        app.logger.error(f"Error storing result: {str(e)}")
        return jsonify({'error': 'Internal server error'}), 500


@app.route('/crossword-jsons', methods=['GET'])
def crossword_jsons():
    """
    Alias for /crosswords endpoint to match frontend expectations.
    """
    return list_crosswords()


@app.route('/crosswords', methods=['GET'])
def list_crosswords():
    """
    Return a list of all JSON files in the crosswords directory.
    
    Returns JSON response with a list of available crossword files.
    """
    try:
        # Check if crosswords directory exists
        if not CROSSWORDS_DIR.exists():
            return jsonify({'error': 'Crosswords directory not found'}), 404
        
        # Get all JSON files in the crosswords directory
        json_files = []
        for file_path in CROSSWORDS_DIR.glob('*.json'):
            json_files.append(file_path.name)
        
        # Sort the files for consistent ordering
        json_files.sort()
        
        app.logger.info(f"Found {len(json_files)} crossword files")
        
        return jsonify({
            'status': 'success',
            'count': len(json_files),
            'files': json_files
        }), 200
        
    except Exception as e:
        app.logger.error(f"Error listing crosswords: {str(e)}")
        return jsonify({'error': 'Internal server error'}), 500



@app.route('/crossword-generator/<path:filename>')
def crossword_assets(filename):
    """Serve crossword generator assets (JS, CSS, etc.) from root directory."""
    return send_from_directory(ROOT_DIR, filename)


@app.route('/leaderboard/<date>', methods=['GET'])
def get_leaderboard(date):
    """
    Get leaderboard data for a specific date from SQLite database.
    
    Returns JSON in format {username: time} matching the old JSON file format.
    """
    try:
        # Initialize database if it doesn't exist
        init_database()
        
        conn = get_db_connection()
        try:
            rows = conn.execute(
                "SELECT username, time FROM results WHERE date = ? ORDER BY time ASC, username ASC",
                (date,)
            ).fetchall()
            
            # Convert to dictionary format matching old JSON files
            leaderboard_data = {row['username']: row['time'] for row in rows}
            
            return jsonify(leaderboard_data), 200
        finally:
            conn.close()
            
    except Exception as e:
        app.logger.error(f"Error fetching leaderboard for {date}: {str(e)}")
        return jsonify({'error': 'Internal server error'}), 500


@app.route('/statistics/all-leaderboards', methods=['GET'])
def get_all_leaderboards():
    """
    Get all leaderboard data from SQLite database, grouped by date.
    Optimized endpoint for statistics page to avoid multiple requests.
    
    Returns JSON in format {date: {username: time}} for all dates.
    """
    try:
        # Initialize database if it doesn't exist
        init_database()
        
        conn = get_db_connection()
        try:
            # Fetch all results ordered by date, then time
            rows = conn.execute(
                "SELECT date, username, time FROM results ORDER BY date ASC, time ASC, username ASC"
            ).fetchall()
            
            # Group by date
            leaderboards = {}
            for row in rows:
                date = row['date']
                if date not in leaderboards:
                    leaderboards[date] = {}
                leaderboards[date][row['username']] = row['time']
            
            return jsonify(leaderboards), 200
        finally:
            conn.close()
            
    except Exception as e:
        app.logger.error(f"Error fetching all leaderboards: {str(e)}")
        return jsonify({'error': 'Internal server error'}), 500


@app.route('/migrate', methods=['GET'])
def migrate_json_to_sqlite():
    """
    Migrate all JSON files from data/ directory to SQLite database.
    This endpoint is idempotent - safe to call multiple times.
    
    Returns JSON with migration status.
    """
    try:
        # Initialize database
        init_database()
        
        # Check if database already has data
        conn = get_db_connection()
        try:
            existing_count = conn.execute("SELECT COUNT(*) as count FROM results").fetchone()['count']
            if existing_count > 0:
                # Database already has data, migration likely already done
                return jsonify({
                    'status': 'already_migrated',
                    'message': 'Database already contains data',
                    'existing_records': existing_count
                }), 200
        finally:
            conn.close()
        
        # Scan data directory for JSON files
        json_files = list(DATA_DIR.glob('*.json'))
        
        if not json_files:
            return jsonify({
                'status': 'no_files',
                'message': 'No JSON files found to migrate',
                'migrated_files': 0,
                'migrated_records': 0
            }), 200
        
        # Import each JSON file
        total_records = 0
        migrated_files = 0
        errors = []
        
        conn = get_db_connection()
        try:
            for json_file in json_files:
                # Extract date from filename (YYYY-MM-DD.json)
                date_match = json_file.stem
                if not date_match or len(date_match) != 10:
                    # Skip files that don't match date pattern
                    continue
                
                try:
                    # Validate date format
                    datetime.strptime(date_match, '%Y-%m-%d')
                except ValueError:
                    # Skip invalid date formats
                    continue
                
                try:
                    # Load JSON file
                    with open(json_file, 'r') as f:
                        date_data = json.load(f)
                    
                    # Insert all entries
                    file_records = 0
                    for username, time_score in date_data.items():
                        try:
                            time_score = int(time_score)
                            conn.execute(
                                "INSERT OR REPLACE INTO results (date, username, time) VALUES (?, ?, ?)",
                                (date_match, username, time_score)
                            )
                            file_records += 1
                        except (ValueError, TypeError) as e:
                            app.logger.warning(f"Invalid time value in {json_file.name} for user {username}: {e}")
                    
                    if file_records > 0:
                        migrated_files += 1
                        total_records += file_records
                        app.logger.info(f"Migrated {file_records} records from {json_file.name}")
                    
                except json.JSONDecodeError as e:
                    errors.append(f"{json_file.name}: Invalid JSON - {str(e)}")
                    app.logger.error(f"Failed to parse {json_file.name}: {e}")
                except Exception as e:
                    errors.append(f"{json_file.name}: {str(e)}")
                    app.logger.error(f"Error migrating {json_file.name}: {e}")
            
            conn.commit()
        finally:
            conn.close()
        
        response_data = {
            'status': 'success',
            'message': 'Migration completed',
            'migrated_files': migrated_files,
            'migrated_records': total_records,
            'total_files': len(json_files)
        }
        
        if errors:
            response_data['errors'] = errors
        
        return jsonify(response_data), 200
        
    except Exception as e:
        app.logger.error(f"Error during migration: {str(e)}")
        return jsonify({'error': 'Internal server error', 'message': str(e)}), 500


@app.route('/data/<path:filename>')
def data_files(filename):
    """
    Serve data files (leaderboard JSON files) for backward compatibility.
    If JSON file doesn't exist, try to serve from SQLite database.
    """
    json_path = DATA_DIR / filename
    
    # If JSON file exists, serve it
    if json_path.exists() and json_path.is_file():
        return send_from_directory(DATA_DIR, filename)
    
    # Otherwise, try to serve from SQLite if it's a date-based filename
    if filename.endswith('.json'):
        date_match = filename[:-5]  # Remove .json extension
        try:
            # Validate date format
            datetime.strptime(date_match, '%Y-%m-%d')
            # Try to get from database
            conn = get_db_connection()
            try:
                rows = conn.execute(
                    "SELECT username, time FROM results WHERE date = ? ORDER BY time ASC, username ASC",
                    (date_match,)
                ).fetchall()
                
                if rows:
                    leaderboard_data = {row['username']: row['time'] for row in rows}
                    return jsonify(leaderboard_data), 200
            finally:
                conn.close()
        except ValueError:
            # Not a valid date format, fall through to 404
            pass
    
    # File not found
    return jsonify({'error': 'File not found'}), 404


@app.route('/crosswords/<path:filename>')
def crossword_files(filename):
    """Serve crossword puzzle JSON files."""
    return send_from_directory(CROSSWORDS_DIR, filename)


@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint for monitoring."""
    return jsonify({'status': 'healthy'}), 200


@app.route('/', methods=['GET'])
def index():
    """Root endpoint with basic information."""
    return jsonify({
        'service': 'scoretracker',
        'description': 'Stores user scores in date-based JSON files (YYYY-MM-DD.json) with {username: time} format',
        'endpoints': {
            '/results': 'Store user results (GET with user and time parameters)',
            '/crosswords': 'List all available crossword JSON files',
            '/health': 'Health check endpoint'
        }
    }), 200


if __name__ == '__main__':
    # Development server - in production, use gunicorn
    app.run(host='0.0.0.0', port=5001, debug=False)
