#!/usr/bin/env python3
"""
Flask app to track user scores.
Listens for GET requests at /results?user=xxx&time=yyy
Stores results in JSON files named xxx.json with format {date_of_submission: time}
"""

import json
from datetime import datetime
from pathlib import Path

from flask import Flask, request, jsonify

app = Flask(__name__)

# Directory to store JSON files
DATA_DIR = Path(__file__).parent / "data"
DATA_DIR.mkdir(exist_ok=True)


@app.route('/results', methods=['GET'])
def store_results():
    """
    Store user results in JSON file.
    
    Expected parameters:
    - user: username (string)
    - time: time score (integer)
    
    Returns JSON response with status.
    """
    try:
        # Get parameters from query string
        username = request.args.get('user')
        time_score = request.args.get('time')
        
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
        submission_date = datetime.now().strftime('%Y-%m-%d')
        
        # Path to user's JSON file
        user_file = DATA_DIR / f"{username}.json"
        
        # Load existing data or create new
        if user_file.exists():
            with open(user_file, 'r') as f:
                user_data = json.load(f)
        else:
            user_data = {}
        
        # Add new entry
        user_data[submission_date] = time_score
        
        # Save back to file
        with open(user_file, 'w') as f:
            json.dump(user_data, f, indent=2)
        
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


@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint for monitoring."""
    return jsonify({'status': 'healthy'}), 200


@app.route('/', methods=['GET'])
def index():
    """Root endpoint with basic information."""
    return jsonify({
        'service': 'scoretracker',
        'endpoints': {
            '/results': 'Store user results (GET with user and time parameters)',
            '/health': 'Health check endpoint'
        }
    }), 200


if __name__ == '__main__':
    # Development server - in production, use gunicorn
    app.run(host='0.0.0.0', port=5001, debug=False)
