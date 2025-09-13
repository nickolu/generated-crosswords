#!/usr/bin/env python3
"""
Flask app to track user scores.
Listens for GET requests at /results?user=xxx&time=yyy
Stores results in JSON files named YYYY-MM-DD.json with format {username: time}
Each date file contains a dictionary of user/time pairs updated when new results are added.
"""

import json
from datetime import datetime
from pathlib import Path

from flask import Flask, request, jsonify, send_from_directory

app = Flask(__name__)

# Directory to store JSON files
DATA_DIR = Path(__file__).parent / ".." / "data"
DATA_DIR.mkdir(exist_ok=True)

# Directory containing crossword JSON files
CROSSWORDS_DIR = Path(__file__).parent / ".." / "crosswords"

# Root directory for serving static files
ROOT_DIR = Path(__file__).parent / ".."


@app.route('/results', methods=['GET'])
def store_results():
    """
    Store user results in date-based JSON file.
    
    Expected parameters:
    - user: username (string)
    - time: time score (integer)
    
    Creates/updates a JSON file named YYYY-MM-DD.json containing
    a dictionary of {username: time} for all users on that date.
    
    Returns JSON response with status.
    """
    try:
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
        
        # Path to date-based JSON file
        date_file = DATA_DIR / f"{submission_date}.json"
        
        # Load existing data for this date or create new
        if date_file.exists():
            with open(date_file, 'r') as f:
                date_data = json.load(f)
        else:
            date_data = {}
        
        # Add or update user's entry for this date
        date_data[username] = time_score
        
        # Save back to file
        with open(date_file, 'w') as f:
            json.dump(date_data, f, indent=2)
        
        app.logger.info(f"Stored result for user {username}: {time_score} at {submission_date}")
        
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
    """Serve crossword generator assets (JS, CSS, etc.)."""
    return send_from_directory(ROOT_DIR / 'crossword-generator', filename)


@app.route('/data/<path:filename>')
def data_files(filename):
    """Serve data files (leaderboard JSON files)."""
    return send_from_directory(DATA_DIR, filename)


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
