#!/usr/bin/env python3
"""
Flask app to track user scores.
Listens for GET requests at /results?user=xxx&time=yyy
Stores results in SQLite database (statistics.db) with format {username: time}
Each date contains entries for all users who completed puzzles on that date.
"""

import json
import sqlite3
from datetime import datetime, timedelta
from pathlib import Path

import pytz
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
                completion_timestamp TEXT,
                PRIMARY KEY (date, username)
            )
        """)
        conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_date ON results(date)
        """)
        # Add completion_timestamp column if it doesn't exist (for existing databases)
        try:
            conn.execute("ALTER TABLE results ADD COLUMN completion_timestamp TEXT")
            conn.commit()
        except sqlite3.OperationalError:
            # Column already exists, ignore
            pass
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
        
        # Get parameters from query string
        username = request.args.get('user')
        time_score = request.args.get('time')
        date = request.args.get('date')
        
        # Validate parameters
        if not username:
            return jsonify({'error': 'Missing required parameter: user'}), 400
        
        if not time_score:
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
        
        # Get current timestamp in UTC (stored as ISO format string)
        completion_timestamp = datetime.now(pytz.UTC).isoformat()
        
        # Store in SQLite database
        conn = get_db_connection()
        try:
            conn.execute(
                "INSERT OR REPLACE INTO results (date, username, time, completion_timestamp) VALUES (?, ?, ?, ?)",
                (submission_date, username, time_score, completion_timestamp)
            )
            conn.commit()
            app.logger.info(f"Stored result for user {username}: {time_score} at {submission_date} (completed at {completion_timestamp})")
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
    
    Returns JSON in format {username: {time: int, completion_timestamp: str}} 
    or {username: int} for backward compatibility if no timestamp exists.
    """
    try:
        # Initialize database if it doesn't exist
        init_database()
        
        conn = get_db_connection()
        try:
            rows = conn.execute(
                "SELECT username, time, completion_timestamp FROM results WHERE date = ? ORDER BY time ASC, username ASC",
                (date,)
            ).fetchall()
            
            # Convert to dictionary format with completion_timestamp if available
            leaderboard_data = {}
            for row in rows:
                # Ensure time is a valid integer
                time_value = row['time']
                if time_value is None:
                    continue  # Skip invalid entries
                
                completion_timestamp = row['completion_timestamp']
                # Check if completion_timestamp exists and is not empty
                if completion_timestamp and completion_timestamp.strip():
                    leaderboard_data[row['username']] = {
                        'time': int(time_value),
                        'completion_timestamp': completion_timestamp
                    }
                else:
                    # Backward compatibility: return just time if no timestamp
                    leaderboard_data[row['username']] = int(time_value)
            
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
        
        # Backfill existing records that don't have completion_timestamp
        conn = get_db_connection()
        backfilled_count = 0
        try:
            # Find records without completion_timestamp
            rows_without_timestamp = conn.execute(
                "SELECT date, username FROM results WHERE completion_timestamp IS NULL"
            ).fetchall()
            
            if rows_without_timestamp:
                pacific = pytz.timezone('America/Los_Angeles')
                for row in rows_without_timestamp:
                    date_str = row['date']
                    try:
                        # Parse the date and set to noon Pacific time
                        date_obj = datetime.strptime(date_str, '%Y-%m-%d')
                        noon_pacific = pacific.localize(datetime(date_obj.year, date_obj.month, date_obj.day, 12, 0, 0))
                        # Convert to UTC and format as ISO string
                        completion_timestamp = noon_pacific.astimezone(pytz.UTC).isoformat()
                        
                        # Update the record
                        conn.execute(
                            "UPDATE results SET completion_timestamp = ? WHERE date = ? AND username = ?",
                            (completion_timestamp, date_str, row['username'])
                        )
                        backfilled_count += 1
                    except ValueError:
                        # Skip invalid date formats
                        app.logger.warning(f"Invalid date format in database: {date_str}")
                
                conn.commit()
                app.logger.info(f"Backfilled {backfilled_count} existing records with completion timestamps")
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
                    
                    # Create noon Pacific time for this date
                    pacific = pytz.timezone('America/Los_Angeles')
                    # Parse the date and set to noon Pacific time
                    date_obj = datetime.strptime(date_match, '%Y-%m-%d')
                    noon_pacific = pacific.localize(datetime(date_obj.year, date_obj.month, date_obj.day, 12, 0, 0))
                    # Convert to UTC and format as ISO string
                    completion_timestamp = noon_pacific.astimezone(pytz.UTC).isoformat()
                    
                    # Insert all entries
                    file_records = 0
                    for username, time_score in date_data.items():
                        try:
                            time_score = int(time_score)
                            conn.execute(
                                "INSERT OR REPLACE INTO results (date, username, time, completion_timestamp) VALUES (?, ?, ?, ?)",
                                (date_match, username, time_score, completion_timestamp)
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
            'backfilled_records': backfilled_count,
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


@app.route('/streaks', methods=['POST'])
def get_streaks():
    """
    Get solve streaks for multiple users at once.
    
    Expects JSON body with 'usernames' array: {"usernames": ["user1", "user2", ...]}
    Returns JSON with streaks: {"user1": 5, "user2": 3, ...}
    """
    try:
        # Initialize database if it doesn't exist
        init_database()
        
        # Get usernames from request body
        if not request.is_json:
            return jsonify({'error': 'Request must be JSON'}), 400
        
        data = request.get_json()
        usernames = data.get('usernames', [])
        
        if not isinstance(usernames, list):
            return jsonify({'error': 'usernames must be an array'}), 400
        
        if not usernames:
            return jsonify({}), 200
        
        # Limit to prevent abuse
        if len(usernames) > 100:
            return jsonify({'error': 'Maximum 100 usernames per request'}), 400
        
        conn = get_db_connection()
        try:
            # Calculate streaks for all users
            pacific = pytz.timezone('America/Los_Angeles')
            utc = pytz.UTC
            min_streak_date = datetime(2026, 1, 1).date()
            current_date = datetime.now(pacific).date()
            
            streaks = {}
            
            for username in usernames:
                # Get all completions for this user with completion_timestamp
                rows = conn.execute(
                    "SELECT date, completion_timestamp FROM results WHERE username = ? AND completion_timestamp IS NOT NULL ORDER BY date DESC",
                    (username,)
                ).fetchall()
                
                if not rows:
                    streaks[username] = 0
                    continue
                
                # Create a set of dates where user completed on the puzzle date
                # Only include dates on or after January 1, 2026
                valid_dates = set()
                for row in rows:
                    puzzle_date_str = row['date']
                    completion_timestamp_str = row['completion_timestamp']
                    
                    try:
                        # Parse puzzle date
                        puzzle_date = datetime.strptime(puzzle_date_str, '%Y-%m-%d').date()
                        
                        # Skip dates before January 1, 2026
                        if puzzle_date < min_streak_date:
                            continue
                        
                        # Parse completion timestamp and convert to Pacific time
                        completion_dt = datetime.fromisoformat(completion_timestamp_str.replace('Z', '+00:00'))
                        if completion_dt.tzinfo is None:
                            # If no timezone info, assume UTC
                            completion_dt = utc.localize(completion_dt)
                        completion_date_pacific = completion_dt.astimezone(pacific).date()
                        
                        # Check if completion date matches puzzle date
                        # Only count if puzzle date is on or after January 1, 2026
                        if completion_date_pacific == puzzle_date and puzzle_date >= min_streak_date:
                            valid_dates.add(puzzle_date)
                    except (ValueError, AttributeError) as e:
                        # Skip invalid dates/timestamps
                        app.logger.warning(f"Invalid date/timestamp for user {username}: {e}")
                        continue
                
                # Count consecutive days going backwards from today
                # Stop if we go before January 1, 2026
                streak = 0
                check_date = current_date
                while check_date in valid_dates and check_date >= min_streak_date:
                    streak += 1
                    # Go back one day
                    check_date = check_date - timedelta(days=1)
                
                streaks[username] = streak
            
            return jsonify(streaks), 200
        finally:
            conn.close()
            
    except Exception as e:
        app.logger.error(f"Error calculating streaks: {str(e)}")
        return jsonify({'error': 'Internal server error'}), 500


@app.route('/streak/<username>', methods=['GET'])
def get_streak(username):
    """
    Get the current solve streak for a user.
    A streak is the number of consecutive days (going backwards from today)
    where the user completed a puzzle on the puzzle's date itself.
    
    Returns JSON with streak count.
    """
    try:
        # Initialize database if it doesn't exist
        init_database()
        
        conn = get_db_connection()
        try:
            # Get all completions for this user with completion_timestamp
            rows = conn.execute(
                "SELECT date, completion_timestamp FROM results WHERE username = ? AND completion_timestamp IS NOT NULL ORDER BY date DESC",
                (username,)
            ).fetchall()
            
            if not rows:
                return jsonify({'streak': 0}), 200
            
            # Calculate streak
            # A streak counts consecutive days going backwards from today
            # where completion_timestamp date matches the puzzle date
            # No streaks are counted before January 1, 2026
            pacific = pytz.timezone('America/Los_Angeles')
            utc = pytz.UTC
            
            # Minimum date for streak counting
            min_streak_date = datetime(2026, 1, 1).date()
            
            streak = 0
            # Start from today and work backwards
            current_date = datetime.now(pacific).date()
            
            # Create a set of dates where user completed on the puzzle date
            # Only include dates on or after January 1, 2026
            valid_dates = set()
            for row in rows:
                puzzle_date_str = row['date']
                completion_timestamp_str = row['completion_timestamp']
                
                try:
                    # Parse puzzle date
                    puzzle_date = datetime.strptime(puzzle_date_str, '%Y-%m-%d').date()
                    
                    # Skip dates before January 1, 2026
                    if puzzle_date < min_streak_date:
                        continue
                    
                    # Parse completion timestamp and convert to Pacific time
                    completion_dt = datetime.fromisoformat(completion_timestamp_str.replace('Z', '+00:00'))
                    if completion_dt.tzinfo is None:
                        # If no timezone info, assume UTC
                        completion_dt = utc.localize(completion_dt)
                    completion_date_pacific = completion_dt.astimezone(pacific).date()
                    
                    # Check if completion date matches puzzle date
                    # Only count if puzzle date is on or after January 1, 2026
                    if completion_date_pacific == puzzle_date and puzzle_date >= min_streak_date:
                        valid_dates.add(puzzle_date)
                except (ValueError, AttributeError) as e:
                    # Skip invalid dates/timestamps
                    app.logger.warning(f"Invalid date/timestamp for user {username}: {e}")
                    continue
            
            # Count consecutive days going backwards from today
            # Stop if we go before January 1, 2026
            check_date = current_date
            while check_date in valid_dates and check_date >= min_streak_date:
                streak += 1
                # Go back one day
                check_date = check_date - timedelta(days=1)
            
            return jsonify({'streak': streak}), 200
        finally:
            conn.close()
            
    except Exception as e:
        app.logger.error(f"Error calculating streak for {username}: {str(e)}")
        return jsonify({'error': 'Internal server error', 'streak': 0}), 500


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
